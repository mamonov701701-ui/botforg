import os
import sys
import time
import socket
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import psutil
import requests

TG_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TG_CHAT  = os.getenv("TG_CHAT_ID", "")

COOLDOWN_MIN = 3
STATE_DIR = Path("monitoring") / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)


def send_msg(text: str) -> None:
    if not TG_TOKEN or not TG_CHAT:
        print(text)
        return
    try:
        requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                      data={"chat_id": TG_CHAT, "text": text}, timeout=20)
    except Exception:
        pass


def is_listening(port: int) -> bool:
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr and conn.laddr.port == port:
                return True
    except Exception:
        pass
    return False


def http_check(url: str, timeout: int = 5) -> bool:
    try:
        r = requests.get(url, timeout=timeout)
        return r.status_code < 500
    except Exception:
        return False


def can_restart(name: str) -> bool:
    stamp = STATE_DIR / f"autoheal_{name}.txt"
    if not stamp.exists():
        return True
    try:
        last = datetime.fromisoformat(stamp.read_text().strip())
        return datetime.now() - last >= timedelta(minutes=COOLDOWN_MIN)
    except Exception:
        return True


def mark_restart(name: str) -> None:
    (STATE_DIR / f"autoheal_{name}.txt").write_text(datetime.now().isoformat())


def kill_processes_matching(substr: str) -> int:
    killed = 0
    for p in psutil.process_iter(attrs=["pid", "name", "cmdline"]):
        try:
            cmd = " ".join(p.info.get("cmdline") or [])
            if substr.lower() in (cmd or "").lower():
                p.kill(); killed += 1
        except Exception:
            pass
    return killed


def start_background(cmd: str) -> int:
    flags = 0
    if os.name == "nt":
        CREATE_NEW_CONSOLE = 0x00000010
        DETACHED_PROCESS = 0x00000008
        flags = CREATE_NEW_CONSOLE | DETACHED_PROCESS
    try:
        proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        return proc.pid or 0
    except Exception:
        return -1


def restart_frontend() -> bool:
    if not can_restart("frontend"):
        return False
    k = kill_processes_matching("vite")
    pid = start_background("npm run dev -- --host")
    mark_restart("frontend")
    send_msg(f"[autoheal] frontend restart: killed={k}, started_pid={pid}")
    return True


def restart_backend() -> bool:
    if not can_restart("backend"):
        return False
    k = kill_processes_matching("uvicorn")
    pid = start_background("uvicorn backend.main:app --reload --port 8000")
    mark_restart("backend")
    send_msg(f"[autoheal] backend restart: killed={k}, started_pid={pid}")
    return True


def run_once() -> int:
    had_issue = False

    # FRONTEND
    front_ok = is_listening(5173) and http_check(os.getenv("BOTFORG_BASE_URL", "http://localhost:5173"))
    if not front_ok:
        had_issue = True
        restarted = restart_frontend()
        if not restarted:
            send_msg("[autoheal] frontend issue, restart skipped due to cooldown")

    # BACKEND
    back_ok = is_listening(8000) and http_check("http://localhost:8000")
    if not back_ok:
        had_issue = True
        restarted = restart_backend()
        if not restarted:
            send_msg("[autoheal] backend issue, restart skipped due to cooldown")

    if not had_issue:
        send_msg("[autoheal] OK: services are healthy")
        return 0
    return 2


if __name__ == "__main__":
    # one-shot by default; --once is synonymous
    sys.exit(run_once())


