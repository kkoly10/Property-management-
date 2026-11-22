import hashlib
import http.client
import json
import socket
import struct
import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone

from server import make_server


SECRET = "document-scanner-loopback-secret-32-bytes"
PAYLOAD = b"synthetic scanner fixture\x00\xff"
MAX_BODY_BYTES = 50 * 1024 * 1024


def receive_exact(connection, count):
    received = bytearray()
    while len(received) < count:
        chunk = connection.recv(count - len(received))
        if not chunk:
            raise EOFError("Truncated fake ClamAV request")
        received.extend(chunk)
    return bytes(received)


class FakeClamd:
    def __init__(self, verdict, signature_age, allow_aborted_stream):
        self.verdict = verdict
        self.allow_aborted_stream = allow_aborted_stream
        published = datetime.now(timezone.utc) - signature_age
        self.version = f"ClamAV 1.4.7/28191/{published:%a %b %d %H:%M:%S %Y}".encode("ascii")
        self.payloads = []
        self.connections = []
        self.failures = []

    def connect(self, timeout_seconds):
        client, daemon = socket.socketpair()
        client.settimeout(timeout_seconds)
        daemon.settimeout(5)
        thread = threading.Thread(target=self.serve, args=(daemon,), daemon=True)
        self.connections.append((client, thread))
        thread.start()
        return client

    def serve(self, connection):
        try:
            with connection:
                while first_byte := connection.recv(1):
                    command = bytearray(first_byte)
                    while command[-1] != 0:
                        command.extend(receive_exact(connection, 1))
                    if command == b"zVERSION\0":
                        connection.sendall(self.version + b"\0")
                    elif command == b"zINSTREAM\0":
                        chunks = bytearray()
                        try:
                            while size := struct.unpack("!I", receive_exact(connection, 4))[0]:
                                chunks.extend(receive_exact(connection, size))
                        except EOFError:
                            if self.allow_aborted_stream:
                                return
                            raise
                        self.payloads.append(bytes(chunks))
                        connection.sendall(self.verdict + b"\0")
                        return
                    else:
                        raise AssertionError(f"Unexpected fake ClamAV command {bytes(command)!r}")
        except (EOFError, OSError, AssertionError) as error:
            self.failures.append(error)

    def close(self):
        for client, thread in self.connections:
            client.close()
            thread.join(timeout=6)
        if any(thread.is_alive() for _, thread in self.connections):
            raise AssertionError("A fake ClamAV connection is still running")
        if self.failures:
            raise AssertionError("Fake ClamAV protocol failed") from self.failures[0]


class ScannerServerTests(unittest.TestCase):
    def start_server(self, verdict=b"stream: OK", signature_age=timedelta(), *, allow_aborted_stream=False):
        self.clamd = FakeClamd(verdict, signature_age, allow_aborted_stream)
        self.addCleanup(self.clamd.close)
        self.server = make_server("127.0.0.1", 0, SECRET, self.clamd.connect, timeout=2.0)
        thread = threading.Thread(target=self.server.serve_forever, args=(0.01,), daemon=True)
        thread.start()
        self.addCleanup(thread.join, 3)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def scan(self, payload=PAYLOAD, *, credential=SECRET, digest=None, length=None):
        headers = {
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(payload) if length is None else length),
            "Idempotency-Key": str(uuid.uuid4()),
            "X-Crecy-Sha256": digest or hashlib.sha256(payload).hexdigest(),
        }
        if credential is not None:
            headers["Authorization"] = f"Bearer {credential}"
        return self.request("POST", "/scan", payload, headers)

    def test_fresh_engine_is_healthy_and_scans_exact_bytes(self):
        self.start_server()
        self.assertEqual(self.request("GET", "/health")[0], 200)
        status, body = self.scan()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["verdict"], "clean")
        self.assertEqual(self.clamd.payloads, [PAYLOAD])

    def test_detection_returns_infected(self):
        self.start_server(b"stream: Synthetic.Test.Detection FOUND")
        status, body = self.scan()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["verdict"], "infected")

    def test_mismatched_digest_is_rejected(self):
        self.start_server(allow_aborted_stream=True)
        status, _ = self.scan(digest=hashlib.sha256(b"different bytes").hexdigest())
        self.assertEqual(status, 422)
        self.assertEqual(self.clamd.payloads, [])

    def test_scan_requires_the_shared_bearer_token(self):
        self.start_server()
        for credential in (None, SECRET + "-wrong"):
            with self.subTest(credential=credential):
                self.assertEqual(self.scan(credential=credential)[0], 401)
        self.assertEqual(self.clamd.payloads, [])

    def test_oversize_request_is_rejected_from_content_length(self):
        self.start_server()
        status, _ = self.scan(b"", length=MAX_BODY_BYTES + 1)
        self.assertEqual(status, 413)
        self.assertEqual(self.clamd.payloads, [])

    def test_engine_error_is_retryable_failure(self):
        self.start_server(b"stream: synthetic engine error ERROR")
        self.assertEqual(self.scan()[0], 503)

    def test_stale_database_refuses_health_and_scan(self):
        self.start_server(signature_age=timedelta(days=30))
        self.assertEqual(self.request("GET", "/health")[0], 503)
        self.assertEqual(self.scan()[0], 503)
        self.assertEqual(self.clamd.payloads, [])

    def test_scan_limit_alert_is_unscannable(self):
        self.start_server(b"stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND")
        self.assertEqual(self.scan()[0], 422)

    def test_encrypted_alert_is_unscannable(self):
        self.start_server(b"stream: Heuristics.Encrypted.Zip FOUND")
        self.assertEqual(self.scan()[0], 422)


if __name__ == "__main__":
    unittest.main()
