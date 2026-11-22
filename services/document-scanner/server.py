"""HTTPS-ingress relay for Crecy's document worker and a private clamd socket."""

import hashlib
import hmac
import json
import os
import re
import socket
import struct
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


MAX_FILE_BYTES = 50 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
MAX_FRAME_BYTES = 4096
MAX_DEFINITION_AGE = timedelta(days=3)
MAX_PENDING_CONNECTIONS = 12
MAX_CONCURRENT_SCANS = 3

SECRET_FORMAT = re.compile(r"[A-Za-z0-9._~-]{32,256}")
SIZE_FORMAT = re.compile(r"[0-9]{1,10}")
DIGEST_FORMAT = re.compile(r"[0-9a-f]{64}")
ENGINE_VERSION_FORMAT = re.compile(rb"ClamAV [^/\s]+/[0-9]+/(.+)")
DETECTION_FORMAT = re.compile(rb"stream: ([A-Za-z0-9_.-]+) FOUND")


class RequestFailure(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


def remaining_time(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Scanner deadline expired")
    return remaining


def send_to_engine(engine, data, deadline):
    engine.settimeout(remaining_time(deadline))
    engine.sendall(data)


def read_engine_frame(engine, deadline):
    frame = bytearray()
    while len(frame) < MAX_FRAME_BYTES:
        engine.settimeout(remaining_time(deadline))
        chunk = engine.recv(MAX_FRAME_BYTES - len(frame))
        if not chunk:
            break
        frame.extend(chunk)
        delimiter = frame.find(b"\0")
        if delimiter != -1:
            if delimiter != len(frame) - 1:
                break
            return bytes(frame[:delimiter])
    raise RequestFailure(HTTPStatus.SERVICE_UNAVAILABLE, "invalid_scanner_reply")


def verify_definitions(connect_clamd, deadline):
    with connect_clamd(remaining_time(deadline)) as engine:
        send_to_engine(engine, b"zVERSION\0", deadline)
        response = read_engine_frame(engine, deadline)

    match = ENGINE_VERSION_FORMAT.fullmatch(response)
    if match is None:
        raise RequestFailure(HTTPStatus.SERVICE_UNAVAILABLE, "signatures_unavailable")
    try:
        definition_time = datetime.strptime(
            match[1].decode("ascii"), "%a %b %d %H:%M:%S %Y"
        ).replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise RequestFailure(HTTPStatus.SERVICE_UNAVAILABLE, "signatures_unavailable") from exc

    age = datetime.now(timezone.utc) - definition_time
    if not -timedelta(hours=1) <= age <= MAX_DEFINITION_AGE:
        raise RequestFailure(HTTPStatus.SERVICE_UNAVAILABLE, "signatures_stale")


def interpret_verdict(response):
    if response == b"stream: OK":
        return "clean"
    detected = DETECTION_FORMAT.fullmatch(response)
    if detected is None:
        raise RequestFailure(HTTPStatus.SERVICE_UNAVAILABLE, "scan_incomplete")
    if detected[1].startswith((b"Heuristics.Limits.Exceeded", b"Heuristics.Encrypted")):
        raise RequestFailure(HTTPStatus.UNPROCESSABLE_ENTITY, "document_unscannable")
    return "infected"


class RelayRequest(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Hosting access logs can report request status. The relay logs no headers or document data.
        return

    def reply(self, status, body):
        data = json.dumps(body, separators=(",", ":")).encode("ascii")
        self.close_connection = True
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            pass

    def single_header(self, name):
        values = self.headers.get_all(name, [])
        return values[0] if len(values) == 1 else ""

    def do_GET(self):
        if self.path != "/health":
            self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        try:
            verify_definitions(self.server.connect_clamd, time.monotonic() + 2)
        except (OSError, RequestFailure):
            self.reply(HTTPStatus.SERVICE_UNAVAILABLE, {"status": "unavailable"})
            return
        self.reply(HTTPStatus.OK, {"status": "ready"})

    def read_scan_parameters(self):
        authorization = self.single_header("Authorization").encode("latin-1")
        if not hmac.compare_digest(authorization, self.server.authorization):
            raise RequestFailure(HTTPStatus.UNAUTHORIZED, "unauthorized")
        if (self.single_header("Content-Type").lower() != "application/octet-stream"
                or self.headers.get_all("Transfer-Encoding")
                or self.headers.get_all("Content-Encoding")):
            raise RequestFailure(HTTPStatus.BAD_REQUEST, "invalid_content_type")

        content_length = self.single_header("Content-Length")
        if SIZE_FORMAT.fullmatch(content_length) is None or int(content_length) == 0:
            raise RequestFailure(HTTPStatus.BAD_REQUEST, "invalid_content_length")
        size = int(content_length)
        if size > MAX_FILE_BYTES:
            raise RequestFailure(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "document_too_large")

        digest = self.single_header("x-crecy-sha256")
        raw_job = self.single_header("Idempotency-Key")
        try:
            job = str(uuid.UUID(raw_job))
        except ValueError as exc:
            raise RequestFailure(HTTPStatus.BAD_REQUEST, "invalid_job_id") from exc
        if job != raw_job.lower() or DIGEST_FORMAT.fullmatch(digest) is None:
            raise RequestFailure(HTTPStatus.BAD_REQUEST, "invalid_scan_metadata")
        return size, digest, job

    def stream_to_clamd(self, size, expected_digest, deadline):
        digest = hashlib.sha256()
        with self.server.connect_clamd(remaining_time(deadline)) as engine:
            send_to_engine(engine, b"zINSTREAM\0", deadline)
            unread = size
            while unread:
                self.connection.settimeout(remaining_time(deadline))
                chunk = self.rfile.read1(min(CHUNK_BYTES, unread))
                if not chunk:
                    raise RequestFailure(HTTPStatus.REQUEST_TIMEOUT, "incomplete_upload")
                digest.update(chunk)
                send_to_engine(engine, struct.pack("!I", len(chunk)) + chunk, deadline)
                unread -= len(chunk)

            # No end marker is sent on mismatch. clamd discards the incomplete stream.
            if not hmac.compare_digest(digest.hexdigest(), expected_digest):
                raise RequestFailure(HTTPStatus.UNPROCESSABLE_ENTITY, "digest_mismatch")
            send_to_engine(engine, b"\0" * 4, deadline)
            return interpret_verdict(read_engine_frame(engine, deadline))

    def do_POST(self):
        if self.path != "/scan":
            self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        try:
            size, digest, job = self.read_scan_parameters()
            if not self.server.scan_slots.acquire(blocking=False):
                raise RequestFailure(HTTPStatus.TOO_MANY_REQUESTS, "scanner_busy")
            try:
                deadline = time.monotonic() + self.server.scan_timeout
                verify_definitions(self.server.connect_clamd, deadline)
                verdict = self.stream_to_clamd(size, digest, deadline)
            finally:
                self.server.scan_slots.release()
        except RequestFailure as failure:
            self.reply(failure.status, {"error": failure.code})
        except OSError:
            self.reply(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "scanner_unavailable"})
        else:
            self.reply(HTTPStatus.OK, {"verdict": verdict, "reference": f"clamav:{job}"})


class RelayServer(ThreadingHTTPServer):
    request_queue_size = MAX_PENDING_CONNECTIONS

    def __init__(self, address, secret, connect_clamd, timeout):
        super().__init__(address, RelayRequest)
        self.authorization = f"Bearer {secret}".encode("ascii")
        self.connect_clamd = connect_clamd
        self.scan_timeout = timeout
        self.connection_slots = threading.BoundedSemaphore(MAX_PENDING_CONNECTIONS)
        self.scan_slots = threading.BoundedSemaphore(MAX_CONCURRENT_SCANS)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(self.scan_timeout)
        return connection, address

    def process_request(self, request, client_address):
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()


def make_server(host, port, secret, connect_clamd, *, timeout=10.0):
    if SECRET_FORMAT.fullmatch(secret) is None:
        raise ValueError("Supply a 32–256 character URL-safe Crecy scanner secret")
    return RelayServer((host, port), secret, connect_clamd, timeout)


def connect_configured_clamd(timeout):
    tcp_port = os.environ.get("CLAMD_TCP_PORT")
    if tcp_port:
        return socket.create_connection(("127.0.0.1", int(tcp_port)), timeout)

    engine = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        engine.settimeout(timeout)
        engine.connect(os.environ.get("CLAMD_SOCKET", "/tmp/crecy-clamd.sock"))
    except OSError:
        engine.close()
        raise
    return engine


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    secret = os.environ.get("CRECY_DOCUMENT_SCAN_RELAY_SECRET", "")
    with make_server("0.0.0.0", port, secret, connect_configured_clamd) as relay:
        relay.serve_forever()
