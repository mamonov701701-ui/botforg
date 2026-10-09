"""Run the canonical dev backend and keep its combined output in bounded logs."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys


LOG_NAME = re.compile(r"^\.dev-backend-only-(\d{8}-\d{6})(?:-(\d{3,}))?\.log$")


def report_fatal_error(directory: Path, stamp: str, message: str):
    print(message, file=sys.stderr, flush=True)
    try:
        # Keep a small diagnostic even though the launcher runs in a hidden window.
        (directory / f".dev-backend-only-{stamp}.failure.txt").write_text(
            message[:2048] + "\n", encoding="utf-8"
        )
    except OSError:
        pass


class RotatingBackendLog:
    def __init__(self, directory: Path, stamp: str, max_bytes: int, max_files: int):
        if not re.fullmatch(r"\d{8}-\d{6}", stamp):
            raise ValueError("Invalid backend log timestamp")
        if max_bytes < 1 or max_files < 1:
            raise ValueError("Backend log limits must be positive")
        self.directory = directory
        self.stamp = stamp
        self.max_bytes = max_bytes
        self.max_files = max_files
        self.sequence = 0
        self.size = 0
        self.file = None
        self.path = None
        self._open_segment()

    def _segment_path(self):
        suffix = "" if self.sequence == 0 else f"-{self.sequence:03d}"
        return self.directory / f".dev-backend-only-{self.stamp}{suffix}.log"

    def _open_segment(self):
        while True:
            path = self._segment_path()
            try:
                self.file = path.open("xb", buffering=0)
                break
            except FileExistsError:
                self.sequence += 1
        self.path = path
        self.size = 0
        warnings = self._enforce_retention()
        for warning in warnings:
            self.notice(warning)

    def _enforce_retention(self):
        segments = []
        for path in self.directory.iterdir():
            match = LOG_NAME.fullmatch(path.name)
            if match and path.is_file() and not path.is_symlink():
                segments.append((match.group(1), int(match.group(2) or 0), path))
        segments.sort()
        warnings = []
        for _, _, path in segments[:-self.max_files]:
            if path == self.path:
                continue
            try:
                path.unlink()
            except OSError as exc:
                warnings.append(f"Could not remove old backend log {path.name}: {exc}")
        return warnings

    def write(self, data: bytes):
        view = memoryview(data)
        while view:
            if self.size == self.max_bytes:
                self.file.close()
                self.sequence += 1
                self._open_segment()
            portion = view[: self.max_bytes - self.size]
            written = self.file.write(portion)
            if written is None or written < 1:
                raise OSError("Backend log write made no progress")
            self.size += written
            view = view[written:]

    def notice(self, message: str):
        note = (f"[backend log rotation] {message}\n").encode("utf-8", errors="replace")
        remaining = self.max_bytes - self.size
        if remaining:
            written = self.file.write(note[:remaining])
            self.size += written
        print(message, file=sys.stderr, flush=True)

    def close(self):
        if self.file is not None:
            self.file.close()


def backend_command(root: Path, python: Path, host: str, port: int) -> str:
    wrapper = root / "scripts" / "dev-backend-runtime-env.cmd"
    reload_dir = root / "backend"
    return (
        f'cd /d "{root}" && call "{wrapper}" "{python}" -u -m uvicorn '
        f'backend.main:app --host {host} --port {port} --reload '
        f'--reload-dir "{reload_dir}"'
    )


def run(stamp: str, host: str, port: int, max_bytes: int, max_files: int) -> int:
    root = Path(__file__).resolve().parent.parent
    log = RotatingBackendLog(root / "scripts", stamp, max_bytes, max_files)
    process = None
    try:
        command = backend_command(root, Path(sys.executable), host, port)
        process = subprocess.Popen(
            "cmd.exe /c " + command,
            cwd=root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
        )
        while True:
            chunk = os.read(process.stdout.fileno(), 64 * 1024)
            if not chunk:
                break
            log.write(chunk)
        code = process.wait()
        if code:
            log.notice(f"Backend command exited with code {code}")
        return code
    except Exception as exc:
        message = f"ERROR: backend logging failed: {exc}"
        try:
            log.notice(message)
        except Exception:
            pass
        report_fatal_error(root / "scripts", stamp, message)
        if process is not None and process.poll() is None:
            try:
                subprocess.run(
                    ["taskkill.exe", "/T", "/F", "/PID", str(process.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                )
                process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                process.terminate()
        return 1
    finally:
        if process is not None and process.stdout is not None:
            process.stdout.close()
        log.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stamp", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--max-bytes", type=int, required=True)
    parser.add_argument("--max-files", type=int, required=True)
    args = parser.parse_args()
    try:
        sys.exit(run(args.stamp, args.host, args.port, args.max_bytes, args.max_files))
    except Exception as exc:
        report_fatal_error(Path(__file__).resolve().parent, args.stamp,
                           f"ERROR: backend log setup failed: {exc}")
        sys.exit(1)
