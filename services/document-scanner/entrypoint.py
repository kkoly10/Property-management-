"""Run the relay and its scanner processes as the container's unprivileged user."""

import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from server import SECRET_FORMAT


CONFIG_DIRECTORY = Path(__file__).resolve().parent
DEFAULT_SOCKET = "/tmp/crecy-clamd.sock"


def clamd_config(runtime_directory):
    socket_path = os.environ.get("CLAMD_SOCKET", DEFAULT_SOCKET)
    if not re.fullmatch(r"/[\w./-]+", socket_path, re.ASCII) or len(socket_path) > 103:
        raise ValueError("CLAMD_SOCKET must be a short absolute Unix path")
    config = (CONFIG_DIRECTORY / "clamd.conf").read_text(encoding="utf-8")
    config += f"LocalSocket {socket_path}\nTemporaryDirectory {runtime_directory}\n"
    tcp_port = os.environ.get("CLAMD_TCP_PORT")
    if tcp_port:
        if not re.fullmatch(r"[0-9]{1,5}", tcp_port) or not 1024 <= int(tcp_port) <= 65535:
            raise ValueError("CLAMD_TCP_PORT must be an unprivileged TCP port")
        config += f"TCPAddr 127.0.0.1\nTCPSocket {int(tcp_port)}\n"
    return config


def stop_children(children):
    for _, process in children:
        if process.poll() is None:
            process.terminate()
    deadline = time.monotonic() + 6
    for _, process in children:
        try:
            process.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def run():
    if SECRET_FORMAT.fullmatch(os.environ.get("CRECY_DOCUMENT_SCAN_RELAY_SECRET", "")) is None:
        raise ValueError("CRECY_DOCUMENT_SCAN_RELAY_SECRET must contain 32–256 URL-safe characters")
    os.umask(0o077)
    stop = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stop.set())

    daemon_env = os.environ.copy()
    daemon_env.pop("CRECY_DOCUMENT_SCAN_RELAY_SECRET", None)
    children = []
    with tempfile.TemporaryDirectory(prefix="crecy-scanner-", dir="/tmp") as runtime:
        config_path = Path(runtime) / "clamd.conf"
        config_path.write_text(clamd_config(runtime), encoding="utf-8")
        update_config_path = Path(runtime) / "freshclam.conf"
        update_config = (CONFIG_DIRECTORY / "freshclam.conf").read_text(encoding="utf-8")
        update_config_path.write_text(update_config + f"NotifyClamd {config_path}\n", encoding="utf-8")
        try:
            children.append(("clamd", subprocess.Popen(["clamd", "--config-file", str(config_path)], env=daemon_env)))
            children.append(("relay", subprocess.Popen([sys.executable, str(CONFIG_DIRECTORY / "server.py")])))
            children.append(("freshclam", subprocess.Popen(
                ["freshclam", "--daemon", "--config-file", str(update_config_path)],
                env=daemon_env,
            )))
            while not stop.wait(0.25):
                for name, process in children:
                    status = process.poll()
                    if status is not None:
                        print(f"Scanner subprocess {name} exited with status {status}.", file=sys.stderr)
                        return 1
            return 0
        finally:
            stop_children(children)


if __name__ == "__main__":
    try:
        sys.exit(run())
    except (OSError, ValueError) as error:
        sys.exit(f"Scanner startup failed: {error}")
