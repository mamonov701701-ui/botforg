import atexit
import json
import os
import re
import subprocess
import sys
import time
import traceback
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]

# Telegram configuration
TG_TOKEN = os.getenv("TG_BOT_TOKEN", "")
CHAT_ID = os.getenv("TG_CHAT_ID", "")
TG_API = f"https://api.telegram.org/bot{TG_TOKEN}"

# Paths
TASKS_DIR = Path("monitoring/tasks")
TASKS_DIR.mkdir(parents=True, exist_ok=True)
QUEUE_PATH = TASKS_DIR / "queue.jsonl"
DONE_PATH = TASKS_DIR / "done.jsonl"
STATE_PATH = TASKS_DIR / "offset.txt"
LOCK_FILE = Path("monitoring/prompt_agent.lock")
LOG_DIR = Path("monitoring/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "agent.log"

# Mode flags
QUIET_MODE = True
last_err_type = None
last_err_ts = 0


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
    # Запускаем скрипт и парсим BACKEND_URL, FRONTEND_URL, PASSWORD
    rc, out, err = run_ps(
        r"powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-expose.ps1",
        timeout=180,
    )
    be_url = None
    fe_url = None
    password = None
    
    for line in out.splitlines():
        if line.startswith("BACKEND_URL="):
            be_url = line.split("=", 1)[1].strip()
        if line.startswith("FRONTEND_URL="):
            fe_url = line.split("=", 1)[1].strip()
        if line.startswith("PASSWORD="):
            password = line.split("=", 1)[1].strip()
    
    pretty = []
    if be_url and be_url != "PENDING":
        pretty.append(f"🌐 Backend → {be_url}")
    if fe_url and fe_url != "PENDING":
        pretty.append(f"🌐 Frontend → {fe_url}")
    if password and password != "UNKNOWN":
        pretty.append(f"🔑 Пароль: {password}")
    
    if not pretty:
        pretty.append("⚠️ Туннели не созданы. Установите localtunnel: npm install -g localtunnel")
    
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


def handle_stop_all(payload):
    rc, out, err = run_ps(
        r"powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-stop.ps1",
        timeout=60,
    )
    return {"rc": rc, "stdout": out, "stderr": err}


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
    "stop_all": handle_stop_all,
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


def log_line(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"[{ts}] {msg}\n")
    except:
        pass


def send_msg(text: str):
    if not TG_TOKEN or not CHAT_ID:
        return
    try:
        requests.post(
            f"{TG_API}/sendMessage",
            data={"chat_id": CHAT_ID, "text": text},
            timeout=30,
        )
    except Exception:
        pass


def send_doc(path: Path, caption=""):
    if not TG_TOKEN or not CHAT_ID:
        return
    try:
        with path.open("rb") as f:
            requests.post(
                f"{TG_API}/sendDocument",
                data={"chat_id": CHAT_ID, "caption": caption},
                files={"document": (path.name, f)},
                timeout=60,
            )
    except Exception:
        pass


def long_poll(offset: int | None):
    params = {"timeout": 60}
    if offset:
        params["offset"] = offset
    r = requests.get(f"{TG_API}/getUpdates", params=params, timeout=90)
    r.raise_for_status()
    return r.json().get("result", [])


def enqueue(task: dict):
    with QUEUE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(task, ensure_ascii=False) + "\n")


def iterate_queue():
    if not QUEUE_PATH.exists():
        return []
    lines = QUEUE_PATH.read_text(encoding="utf-8").splitlines()
    out, rest = [], []
    for ln in lines:
        if not ln.strip():
            continue
        try:
            out.append(json.loads(ln))
        except Exception:
            rest.append(ln)
    QUEUE_PATH.write_text("\n".join(rest), encoding="utf-8")
    return out


def append_done(rec: dict):
    with DONE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def handle_text(text: str):
    """Handle Telegram commands"""
    text = text.strip()

    if text in ("/start", "/help"):
        help_text = (
            "🤖 BotForg Dev Agent\n\n"
            "Команды:\n"
            "/status — Git branch + статус\n"
            "/typecheck — TypeScript проверка\n"
            "/build — Production build\n"
            "/tests — Backend pytest\n"
            "/backend_start — Запустить FastAPI\n"
            "/frontend_start — Запустить Vite\n"
            "/expose — Cloudflared туннели\n"
            "/preview_urls — Локальные URLs\n"
            "/pipeline — Всё сразу (backend+frontend+expose)\n"
            "/stop_all — Остановить все процессы\n\n"
            "Расширенные:\n"
            "/task {JSON} — Выполнить задачу\n"
            "/quiet — Тихий режим\n"
            "/verbose — Полный лог\n"
            "/logs — Скачать логи\n"
            "/restart_me — Перезапустить агента\n"
        )
        send_msg(help_text)
        return

    if text == "/quiet":
        global QUIET_MODE
        QUIET_MODE = True
        send_msg("🔕 Quiet mode: ON")
        log_line("quiet ON")
        return

    if text == "/verbose":
        QUIET_MODE = False
        send_msg("🔔 Quiet mode: OFF")
        log_line("quiet OFF")
        return

    if text == "/logs":
        if LOG_FILE.exists():
            send_doc(LOG_FILE, "agent.log")
        else:
            send_msg("Логов пока нет")
        return

    if text == "/restart_me":
        try:
            send_msg("Перезапуск агента инициирован ✅")
            LOCK_FILE.unlink(missing_ok=True)
            subprocess.Popen(
                [sys.executable, "-m", "monitoring.prompt_agent"],
                creationflags=0x08000000,  # CREATE_NO_WINDOW
            )
            time.sleep(0.5)
            sys.exit(0)
        except Exception as e:
            send_msg(f"/restart_me error: {e}")
        return

    # Map simple commands to task actions
    action_map = {
        "/status": "status",
        "/typecheck": "typecheck",
        "/build": "build",
        "/tests": "tests",
        "/backend_start": "backend_start",
        "/frontend_start": "frontend_start",
        "/expose": "expose",
        "/preview_urls": "preview_urls",
        "/pipeline": "pipeline",
        "/stop_all": "stop_all",
    }

    if text in action_map:
        action = action_map[text]
        send_msg(f"Выполняю: {action}...")
        try:
            result = TASK_HANDLERS[action]({})
            rc = result.get("rc", 0)
            stdout = result.get("stdout", "")
            stderr = result.get("stderr", "")

            # Format response
            response = f"✅ {action} (rc={rc})\n"
            if stdout:
                response += f"\n{stdout[:1500]}"
            if stderr and rc != 0:
                response += f"\n\nErrors:\n{stderr[:500]}"

            send_msg(response)
        except Exception as e:
            send_msg(f"❌ Error: {str(e)[:500]}")
        return

    if text.startswith("/task "):
        payload = text[len("/task ") :].strip()
        try:
            task = json.loads(payload)
            action = task.get("action")
            if action in TASK_HANDLERS:
                send_msg(f"Выполняю: {action}...")
                result = TASK_HANDLERS[action](task.get("payload", {}))
                rc = result.get("rc", 0)
                stdout = result.get("stdout", "")
                stderr = result.get("stderr", "")

                response = f"✅ {action} (rc={rc})\n"
                if stdout:
                    response += f"\n{stdout[:1500]}"
                if stderr and rc != 0:
                    response += f"\n\nErrors:\n{stderr[:500]}"

                send_msg(response)
            else:
                send_msg(f"❌ Unknown action: {action}")
        except json.JSONDecodeError as e:
            send_msg(f"❌ Invalid JSON: {e}")
        except Exception as e:
            send_msg(f"❌ Error: {str(e)[:500]}")
        return

    send_msg("Неизвестная команда. Напиши /help")


@contextmanager
def single_instance():
    """Single instance guard"""
    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
            if os.path.exists(f"/proc/{pid}") or os.name == "nt":
                # On Windows, just check if lock is recent
                if time.time() - LOCK_FILE.stat().st_mtime < 3600:
                    print(f"[single_instance] already running: PID={pid}")
                    sys.exit(0)
        except Exception:
            pass
        LOCK_FILE.unlink(missing_ok=True)

    LOCK_FILE.write_text(str(os.getpid()))
    try:
        yield
    finally:
        try:
            if LOCK_FILE.exists():
                cur = LOCK_FILE.read_text().strip()
                if cur == str(os.getpid()):
                    LOCK_FILE.unlink()
        except:
            pass


def main():
    """Main Telegram bot loop"""
    if not TG_TOKEN or not CHAT_ID:
        print("❌ TG_BOT_TOKEN/TG_CHAT_ID не заданы")
        print("Установите переменные окружения:")
        print("  set TG_BOT_TOKEN=your_token")
        print("  set TG_CHAT_ID=your_chat_id")
        return

    send_msg("🤖 Агент команд запущен ✅\nИспользуй /help для списка команд")
    log_line("agent started; quiet mode ON")

    # Delete webhook
    try:
        requests.get(f"{TG_API}/deleteWebhook", timeout=10)
    except Exception as e:
        log_line(f"deleteWebhook error: {e}")

    # Load offset
    offset = 0
    if STATE_PATH.exists():
        try:
            offset = int(STATE_PATH.read_text())
        except:
            offset = 0

    # Main loop
    while True:
        try:
            updates = long_poll(offset)
            for u in updates:
                offset = max(offset, u["update_id"] + 1)
                STATE_PATH.write_text(str(offset))

                msg = u.get("message") or u.get("edited_message")
                if not msg:
                    continue

                chat = msg.get("chat", {})
                if str(chat.get("id")) != str(CHAT_ID):
                    continue

                txt = (msg.get("text") or "").strip()
                if not txt:
                    continue

                log_line(f"Received: {txt[:50]}")
                handle_text(txt)

        except Exception as e:
            msg = str(e)
            log_line(f"loop error: {msg}")

            # Handle 409 Conflict (bot running elsewhere)
            err_type = "409" if ("409" in msg or "Conflict" in msg) else "other"
            if err_type == "409":
                time.sleep(30)
                continue

            global last_err_type, last_err_ts
            now = time.time()
            if (last_err_type != err_type) or (now - last_err_ts > 300):
                if not QUIET_MODE:
                    send_msg(f"⚠️ Loop error: {msg[:300]}")
                last_err_type = err_type
                last_err_ts = now

            time.sleep(3)


# Для совместимости: если запускают как скрипт с JSON в argv[1]
if __name__ == "__main__":
    # Direct JSON task execution (for testing)
    if len(sys.argv) > 1:
        js = sys.argv[1]
        res = handle_task(js)
        print(json.dumps(res, ensure_ascii=False))
    else:
        # Start Telegram bot
        with single_instance():
            try:
                main()
            finally:
                log_line("agent stopped")
