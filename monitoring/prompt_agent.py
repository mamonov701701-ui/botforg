import os, sys, time, json, requests, subprocess, psutil
from pathlib import Path

TG_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TG_CHAT  = os.getenv("TG_CHAT_ID", "")
BASE_URL = os.getenv("BOTFORG_BASE_URL", "http://localhost:5173")

ROOT = Path("monitoring")
LOCK = ROOT / "prompt_agent.lock"
STATE = ROOT / "offset.txt"

ALLOWED_CMDS = [
    "npm --prefix frontend run dev -- --host",
    "npm run dev -- --host",
    "pytest -q",
    "pytest",
    "python -m monitoring.screenshot_agent",
    "python -m monitoring.visual_diff",
    "python -m monitoring.autoheal",
    "python -m monitoring.scheduler --once",
    "uvicorn backend.main:app --reload --port 8000",
]

def send_msg(text: str):
    if not TG_TOKEN or not TG_CHAT: return
    try:
        requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                      json={"chat_id": TG_CHAT, "text": text[:4000]}, timeout=30)
    except Exception:
        pass

def send_doc(path: Path, caption=""):
    if not TG_TOKEN or not TG_CHAT: return
    try:
        with path.open("rb") as f:
            requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendDocument",
                          data={"chat_id": TG_CHAT, "caption": caption},
                          files={"document": (path.name, f)}, timeout=120)
    except Exception:
        pass

def long_poll(offset=None):
    params = {"timeout": 60}
    if offset: params["offset"] = offset
    r = requests.get(f"https://api.telegram.org/bot{TG_TOKEN}/getUpdates",
                     params=params, timeout=90)
    r.raise_for_status()
    return r.json().get("result", [])

def is_listening(port:int)->bool:
    for p in psutil.process_iter(attrs=["connections"]):
        for c in p.info.get("connections", []):
            try:
                if c.laddr and c.laddr.port == port: return True
            except Exception: pass
    return False

HELP = (
    "/help — справка\n"
    "/status — статус портов\n"
    "/run <cmd> — выполнить из белого списка\n"
    "/task {json} — write/replace\n"
    "/restart_me — перезапустить агента (без ошибок)\n"
)

def handle_text(text: str):
    text = (text or "").strip()

    if text in ("/start","/help"):
        send_msg(HELP); return

    if text == "/status":
        f = "✅" if is_listening(5173) else "❌"
        b = "✅" if is_listening(8000) else "❌"
        send_msg(f"Status:\nFrontend(5173): {f}\nBackend(8000): {b}\nURL: {BASE_URL}")
        return

    if text.startswith("/run "):
        cmd = text[len("/run "):].strip()
        if cmd not in ALLOWED_CMDS:
            send_msg(f"Command not allowed: {cmd}")
            return
        try:
            p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            out, err = p.communicate(timeout=180)
            send_msg(f"/run → {cmd}\ncode={p.returncode}\nstdout:\n{(out or '')[:900]}\nstderr:\n{(err or '')[:900]}")
        except subprocess.TimeoutExpired:
            send_msg(f"/run → {cmd}\ncode=124\nTimeout")
        return

    if text.startswith("/task "):
        payload = text[len("/task "):].strip()
        try:
            t = json.loads(payload)
            act = t.get("action"); path = Path(t.get("path",""))
            if act == "write":
                content = t.get("content","")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                send_msg(f"task:write → OK\n{path}")
            elif act == "replace":
                if not path.exists():
                    send_msg(f"task:replace → файл не найден: {path}"); return
                src = path.read_text(encoding="utf-8")
                new = src.replace(t.get("find",""), t.get("replace",""))
                path.write_text(new, encoding="utf-8")
                send_msg(f"task:replace → OK\n{path}")
            else:
                send_msg(f"unknown task action: {act}")
        except Exception as e:
            send_msg(f"/task error: {e}")
        return

    if text == "/restart_me":
        # Стабильный перезапуск: запускаем новый процесс и выходим через sys.exit
        try:
            try:
                if LOCK.exists(): LOCK.unlink()
            except Exception: pass
            subprocess.Popen([sys.executable, "-m", "monitoring.prompt_agent"],
                             creationflags=0x08000000)  # CREATE_NO_WINDOW
            send_msg("Перезапуск агента инициирован ✅")
            time.sleep(0.5)
            sys.exit(0)
        except Exception as e:
            send_msg(f"/restart_me error: {e}")
        return

    send_msg("Неизвестная команда. Напиши /help")

def main():
    # single-instance lock
    try:
        if LOCK.exists():
            try:
                old = int(LOCK.read_text().strip())
                if old and psutil.pid_exists(old):
                    print(f"[agent] already running: {old}")
                    return
            except Exception: pass
        LOCK.write_text(str(os.getpid()))
    except Exception: pass

    if not TG_TOKEN or not TG_CHAT:
        print("TG_BOT_TOKEN/TG_CHAT_ID not set"); return

    send_msg("Агент запущен ✅ /help")
    offset = 0
    if STATE.exists():
        try: offset = int(STATE.read_text())
        except Exception: offset = 0

    while True:
        try:
            updates = long_poll(offset)
            for u in updates:
                offset = max(offset, u["update_id"]+1)
                STATE.write_text(str(offset))
                msg = u.get("message") or u.get("edited_message") or {}
                chat = msg.get("chat",{})
                if str(chat.get("id")) != str(TG_CHAT): continue
                txt = (msg.get("text") or "").strip()
                if txt: handle_text(txt)
        except Exception as e:
            try: send_msg(f"Loop error: {e}")
            except Exception: pass
            time.sleep(2)

if __name__ == "__main__":
    try:
        ROOT.mkdir(parents=True, exist_ok=True)
    except Exception: pass
    main()
