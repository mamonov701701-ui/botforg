"""
Регрессия: POST /auth/email/login по настоящему TCP (uvicorn), не только TestClient.

Раньше два слоя BaseHTTPMiddleware (Session + Security) давали anyio.EndOfStream и 500.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_email_login_unknown_user_401_over_tcp():
    port = _pick_free_port()
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}/auth/email/login"
    try:
        deadline = time.time() + 25
        last_err = None
        while time.time() < deadline:
            try:
                r = httpx.post(
                    url,
                    json={"email": "no_such_user_tcp@example.com", "password": "x"},
                    timeout=5.0,
                )
                break
            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_err = e
                time.sleep(0.4)
        else:
            pytest.fail(f"server did not accept connections: {last_err}")

        assert r.status_code == 401, r.text[:500]
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
