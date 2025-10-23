import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_ps(cmd: str, timeout=600):
    """Запустить PowerShell-команду и вернуть (rc, out, err)."""
    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=ROOT,
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        return 124, b"", b"TIMEOUT"
    return (
        proc.returncode,
        out.decode(errors="ignore"),
        err.decode(errors="ignore"),
    )


def handle_status(payload):
    cmd = """
    git rev-parse --abbrev-ref HEAD;
    git status -s;
    """
    rc, out, err = run_ps(cmd)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_backend_start(payload):
    # быстрый старт бекенда через uvicorn (порт 8000)
    cmd = r"""
    cd backend;
    if (Test-Path .venv) { . .\.venv\Scripts\Activate.ps1 } elseif (Test-Path venv) { . .\venv\Scripts\Activate.ps1 }
    pip install -r requirements.txt;
    Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','cd backend; if (Test-Path .venv) { . .\.venv\Scripts\Activate.ps1 } elseif (Test-Path venv) { . .\venv\Scripts\Activate.ps1 }; uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload' | Out-Null;
    "backend: started on http://localhost:8000"
    """
    rc, out, err = run_ps(cmd, timeout=120)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_frontend_start(payload):
    # vite dev (порт 5173)
    cmd = r"""
    cd frontend;
    if (Test-Path package-lock.json) { npm ci } else { npm install }
    Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','cd frontend; npm run dev -- --host' | Out-Null;
    "frontend: started on http://localhost:5173"
    """
    rc, out, err = run_ps(cmd, timeout=240)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_tests(payload):
    cmd = r"""
    cd backend;
    if (Test-Path .venv) { . .\.venv\Scripts\Activate.ps1 } elseif (Test-Path venv) { . .\venv\Scripts\Activate.ps1 }
    pytest -q
    """
    rc, out, err = run_ps(cmd, timeout=1200)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_typecheck(payload):
    cmd = r"""
    cd frontend;
    npm run typecheck
    """
    rc, out, err = run_ps(cmd, timeout=1200)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_build(payload):
    cmd = r"""
    cd frontend;
    npm run build
    """
    rc, out, err = run_ps(cmd, timeout=1800)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_preview_urls(payload):
    # печатаем известные локальные адреса
    return {
        "rc": 0,
        "stdout": "backend: http://localhost:8000\nfrontend: http://localhost:5173",
        "stderr": "",
    }


def handle_expose(payload):
    # Запускаем скрипт и парсим две строки BACKEND_URL=..., FRONTEND_URL=...
    rc, out, err = run_ps(
        r"powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-expose.ps1",
        timeout=180,
    )
    be_url = None
    fe_url = None
    for line in out.splitlines():
        if line.startswith("BACKEND_URL="):
            be_url = line.split("=", 1)[1].strip()
        if line.startswith("FRONTEND_URL="):
            fe_url = line.split("=", 1)[1].strip()
    pretty = []
    if be_url:
        pretty.append(f"Backend → {be_url}")
    if fe_url:
        pretty.append(f"Frontend → {fe_url}")
    return {"rc": rc, "stdout": "\n".join(pretty) or out, "stderr": err}


def handle_pipeline(payload):
    steps = [
        ("backend_start", handle_backend_start),
        ("frontend_start", handle_frontend_start),
        ("expose", handle_expose),
    ]
    logs = []
    rc_total = 0
    for name, fn in steps:
        r = fn({})
        logs.append(
            f"== {name} ==\nstdout:\n{r.get('stdout','')}\nstderr:\n{r.get('stderr','')}\nrc={r.get('rc')}"
        )
        rc_total = rc_total or r.get("rc", 0)
    return {"rc": rc_total, "stdout": "\n\n".join(logs), "stderr": ""}


TASK_HANDLERS = {
    "status": handle_status,
    "backend_start": handle_backend_start,
    "frontend_start": handle_frontend_start,
    "tests": handle_tests,
    "typecheck": handle_typecheck,
    "build": handle_build,
    "preview_urls": handle_preview_urls,
    "expose": handle_expose,
    "pipeline": handle_pipeline,
}


def handle_task(task_json: str):
    data = json.loads(task_json)
    action = data.get("action")
    payload = data.get("payload", {})
    if action not in TASK_HANDLERS:
        return {
            "rc": 2,
            "stdout": "",
            "stderr": f"unknown task action: {action}",
        }
    return TASK_HANDLERS[action](payload)


# Для совместимости: если запускают как скрипт с JSON в argv[1]
if __name__ == "__main__":
    js = sys.argv[1] if len(sys.argv) > 1 else "{}"
    res = handle_task(js)
    print(json.dumps(res, ensure_ascii=False))
