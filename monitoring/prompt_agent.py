import json, time, os, subprocess, traceback, sys
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
import requests
import psutil
import msvcrt, tempfile

# --- single instance guard ---
import psutil, sys
from pathlib import Path

LOCK_FILE = Path("monitoring") / "prompt_agent.lock"

def already_running():
    """Проверяем, запущен ли агент другим процессом"""
    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
            if psutil.pid_exists(pid):
                print(f"[agent] уже запущен PID={pid}")
                return True
        except Exception:
            pass
    LOCK_FILE.write_text(str(os.getpid()))
    return False

def clear_lock():
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
    except:
        pass

# сразу проверяем при старте
if already_running():
    sys.exit(0)

import atexit
atexit.register(clear_lock)
# --- end guard ---

# Переменные для анти-спама
last_err_type = None
last_err_ts = 0
QUIET_MODE = True  # стартуем в тихом режиме
ALERTS_ON = True

# Single instance lock
LOCK_DIR  = Path("monitoring") / "locks"
LOCK_DIR.mkdir(parents=True, exist_ok=True)
LOCK_FILE = LOCK_DIR / "prompt_agent.pid"

# Логи агента
LOG_DIR = Path("monitoring") / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "agent.log"

def log_line(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"[{ts}] {msg}\n")
    except:
        pass

# OS-мьютекс через файл (Windows-safe)
_mutex_handle = None
def acquire_mutex():
    global _mutex_handle
    try:
        fpath = str((tempfile.gettempdir() if hasattr(tempfile, "gettempdir") else ".") + "\\prompt_agent.mutex")
        _mutex_handle = open(fpath, "a+")
        msvcrt.locking(_mutex_handle.fileno(), msvcrt.LK_NBLCK, 1)
        return True
    except Exception:
        return False

def release_mutex():
    global _mutex_handle
    try:
        if _mutex_handle:
            msvcrt.locking(_mutex_handle.fileno(), msvcrt.LK_UNLCK, 1)
            _mutex_handle.close()
    except:
        pass

def single_instance_start():
    # PID-lock
    if LOCK_FILE.exists():
        try:
            old = int(LOCK_FILE.read_text().strip())
        except:
            old = -1
        if old > 0:
            # если старый процесс жив — выходим
            try:
                import psutil as _ps
                if _ps.pid_exists(old):
                    print(f"[single_instance] already running: PID={old}")
                    return False
            except:
                # если psutil недоступен — всё равно подстрахуемся мьютексом
                pass
        try: LOCK_FILE.unlink()
        except: pass

    # ОС-мьютекс
    if not acquire_mutex():
        print("[single_instance] mutex busy; another instance is running")
        return False

    LOCK_FILE.write_text(str(os.getpid()))
    return True

def single_instance_cleanup():
    try:
        if LOCK_FILE.exists() and LOCK_FILE.read_text().strip() == str(os.getpid()):
            LOCK_FILE.unlink()
    except:
        pass
    release_mutex()

def _mask(s: str) -> str:
    if not s: return s
    if len(s) <= 8: return "****"
    return s[:4] + "…" + s[-4:]

LAST_RUN = {"snap": 0, "pipeline": 0}
COOLDOWN_SEC = 90  # пауза между повторами, можно менять

def _allowed(name: str, now=None):
    import time
    if now is None: now = time.time()
    last = LAST_RUN.get(name, 0)
    if now - last < COOLDOWN_SEC:
        return False, int(COOLDOWN_SEC - (now - last))
    LAST_RUN[name] = now
    return True, 0

def git_snapshot(msg: str) -> str:
    try:
        # создаём ветку safety/<timestamp> и коммитим текущее состояние
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        branch = f"safety/{ts}"
        subprocess.run("git add -A", shell=True)
        subprocess.run(f'git commit -m "[safety] snapshot {ts}"', shell=True)
        subprocess.run(f"git branch {branch}", shell=True)
        return branch
    except Exception as e:
        return ""

def _pid_alive(pid: int) -> bool:
    try:
        if pid <= 0: return False
        os.kill(pid, 0)
        return True
    except Exception:
        return False

@contextmanager
def single_instance():
    # если lock существует и процесс жив — выходим
    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
        except Exception:
            pid = -1
        if _pid_alive(pid):
            print(f"[single_instance] already running: PID={pid}")
            sys.exit(0)
        else:
            # залипший лок — очищаем
            try: LOCK_FILE.unlink()
            except: pass
    # пишем свой pid
    LOCK_FILE.write_text(str(os.getpid()))
    try:
        yield
    finally:
        try:
            if LOCK_FILE.exists():
                # удаляем только если наш pid
                cur = LOCK_FILE.read_text().strip()
                if cur == str(os.getpid()):
                    LOCK_FILE.unlink()
        except:
            pass

TG_TOKEN = os.getenv("TG_BOT_TOKEN", "")
CHAT_ID  = os.getenv("TG_CHAT_ID", "")
BASE_URL = os.getenv("BOTFORG_BASE_URL", "http://localhost:5173")

ROOT = Path("monitoring")
TASKS_DIR = ROOT / "tasks"
TASKS_DIR.mkdir(parents=True, exist_ok=True)
QUEUE_PATH = TASKS_DIR / "queue.jsonl"
DONE_PATH  = TASKS_DIR / "done.jsonl"
STATE_PATH = TASKS_DIR / "offset.txt"

ALLOWED_CMDS = [
    "npm run dev -- --host",
    "npm --prefix frontend run dev -- --host",
    "pytest -q",
    "pytest",
    "python -m monitoring.screenshot_agent",
    "python -m monitoring.frontend_health",
    "python -m monitoring.visual_diff",
    "python -m monitoring.autoheal",
    "python -m monitoring.cleanup",
    "python -m monitoring.scheduler --once",
    "uvicorn backend.main:app --reload --port 8000",
]

TG_API = f"https://api.telegram.org/bot{TG_TOKEN}"

def send_msg(text: str):
    if not TG_TOKEN or not CHAT_ID: return
    try:
        requests.post(f"{TG_API}/sendMessage", data={"chat_id": CHAT_ID, "text": text}, timeout=30)
    except Exception:
        pass

def send_doc(path: Path, caption=""):
    if not TG_TOKEN or not CHAT_ID: return
    try:
        with path.open("rb") as f:
            requests.post(f"{TG_API}/sendDocument", data={"chat_id": CHAT_ID, "caption": caption},
                          files={"document": (path.name, f)}, timeout=60)
    except Exception:
        pass

def send_kbd(text: str):
    try:
        kb = {
            "keyboard": [
                [ {"text":"/status"}, {"text":"/snap"}, {"text":"/pipeline"} ],
                [ {"text":"/health"}, {"text":"/diff"}, {"text":"/set_baseline"} ],
                [ {"text":"/backend_start"}, {"text":"/tests"} ],
                [ {"text":"/quiet"}, {"text":"/verbose"}, {"text":"/logs"} ]
            ],
            "resize_keyboard": True,
            "one_time_keyboard": False
        }
        requests.post(f"{TG_API}/sendMessage",
                      json={"chat_id": CHAT_ID, "text": text, "reply_markup": kb},
                      timeout=30)
    except Exception:
        pass

def long_poll(offset: int|None):
    params = {"timeout": 60}
    if offset: params["offset"] = offset
    r = requests.get(f"{TG_API}/getUpdates", params=params, timeout=90)
    r.raise_for_status()
    return r.json().get("result", [])

def enqueue(task: dict):
    with QUEUE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(task, ensure_ascii=False) + "\n")

def iterate_queue():
    if not QUEUE_PATH.exists(): return []
    lines = QUEUE_PATH.read_text(encoding="utf-8").splitlines()
    out, rest = [], []
    for ln in lines:
        if not ln.strip(): continue
        try:
            out.append(json.loads(ln))
        except Exception:
            rest.append(ln)
    QUEUE_PATH.write_text("\n".join(rest), encoding="utf-8")
    return out

def append_done(rec: dict):
    with DONE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")

def is_listening(port: int) -> bool:
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr and conn.laddr.port == port:
                return True
    except Exception:
        pass
    return False


def run_shell(cmd: str) -> tuple[int,str,str]:
    if cmd not in ALLOWED_CMDS:
        return (127, "", f"Command not allowed: {cmd}")
    try:
        proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = proc.communicate(timeout=180)
        return (proc.returncode, out, err)
    except subprocess.TimeoutExpired:
        return (124, "", "Timeout")
    except Exception as e:
        return (1, "", f"Error: {e}")

HELP_TEXT = (
    "Команды:\n"
    "/status — состояние фронта/бэка\n"
    "/snap — сделать скрины сейчас\n"
    "/health — проверить здоровье фронтенда\n"
    "/set_baseline — установить baseline из последних скриншотов\n"
    "/diff — сравнить последние скрины с baseline\n"
    "/run <cmd> — выполнить из белого списка\n"
    "/task {\"action\":\"shell\",\"cmd\":\"...\"}\n"
    "/task {\"action\":\"replace\",\"path\":\"...\",\"find\":\"...\",\"replace\":\"...\"}\n"
    "/quiet — выключить уведомления об ошибках\n"
    "/verbose — включить уведомления об ошибках\n"
    "/force_unlock — снять lock агента\n"
    "/logs — прислать файл логов агента\n\n"
    "Примеры:\n"
    "/env — показать важные переменные\n"
    "/alerts_on — включить умные алерты\n"
    "/alerts_off — выключить\n"
    "/healthloop <count> <sec> — выполнить health <count> раз каждые <sec> сек\n"
    "/pipeline — скрины + визуальный дифф\n"
    "/backend_start — запустить backend\n"
    "/tests — запустить pytest -q\n"
    "/ps — список процессов агента\n"
    "/restart_me — мягкий перезапуск\n"
    "/autoheal — проверить и, при необходимости, перезапустить фронт/бэк\n"
    "/frontend_restart — перезапустить фронтенд dev\n"
    "/run python -m monitoring.cleanup — очистка старых файлов\n"
    "/run python -m monitoring.screenshot_agent\n"
    "/run python -m monitoring.frontend_health\n"
    "/run python -m monitoring.visual_diff\n"
    "/revert_snapshot safety/20251007_0620 — откат к снапшоту\n"
    "/task {\"action\":\"shell\",\"cmd\":\"pytest -q\"}\n"
    "/task {\"action\":\"replace\",\"path\":\"frontend/src/App.jsx\",\"find\":\"Hello\",\"replace\":\"Привет\"}\n"
    "/task {\"action\":\"write\",\"path\":\"...\",\"content\":\"...\"} — создать/перезаписать файл\n"
)

def handle_text(text: str):
    text = text.strip()
    if text in ("/start","/help"):
        send_msg(HELP_TEXT)
        send_kbd("Выбери команду на клавиатуре ниже ⤵️"); return

    if text == "/env":
        import os
        token = os.getenv("TG_BOT_TOKEN","")
        masked = (token[:6] + "…" + token[-4:]) if token else "(нет)"
        msg = (
            f"TG_CHAT_ID: {os.getenv('TG_CHAT_ID','')}\n"
            f"TG_BOT_TOKEN: {masked}\n"
            f"BOTFORG_BASE_URL: {os.getenv('BOTFORG_BASE_URL','')}\n"
            f"KEEP_DAYS: {os.getenv('KEEP_DAYS','7')}\n"
        )
        send_msg(msg); return

    if text == "/alerts_on":
        ALERTS_ON = True
        send_msg("🔔 Alerts: ON"); return

    if text == "/alerts_off":
        ALERTS_ON = False
        send_msg("🔕 Alerts: OFF"); return

    if text == "/quiet":
        QUIET_MODE = True
        send_msg("🔕 Quiet mode: ON"); log_line("quiet ON"); return

    if text == "/verbose":
        QUIET_MODE = False
        send_msg("🔔 Quiet mode: OFF"); log_line("quiet OFF"); return

    if text == "/status":
        f_ok = is_listening(5173)
        b_ok = is_listening(8000)
        send_msg(f"Status:\nFrontend(5173): {'✅' if f_ok else '❌'}\nBackend(8000): {'✅' if b_ok else '❌'}\nURL: {BASE_URL}")
        return

    if text == "/snap":
        ok, left = _allowed("snap")
        if not ok:
            send_msg(f"⏳ Подожди ещё {left}с перед повтором /snap")
            return
        code,out,err = run_shell("python -m monitoring.screenshot_agent")
        send_msg(f"/snap → code={code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        if ALERTS_ON and code and code>0:
            send_msg(f"⚠️ Snap завершился с кодом {code}")
        snaps = sorted((Path('monitoring')/'screenshots').rglob('summary.json'))
        if snaps: send_doc(snaps[-1], caption="summary.json")
        return

    if text == "/health":
        code,out,err = run_shell("python -m monitoring.frontend_health")
        send_msg(f"/health → code={code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        # Отправляем файл с ошибками если он существует
        errors_file = Path("monitoring/frontend_errors.json")
        if errors_file.exists():
            send_doc(errors_file, caption="frontend_errors.json")
        return

    if text.startswith("/healthloop"):
        parts = text.split()
        try:
            cnt = int(parts[1]) if len(parts)>1 else 6
            sec = int(parts[2]) if len(parts)>2 else 10
        except:
            send_msg("Использование: /healthloop <count> <sec>"); return
        send_msg(f"Старт /healthloop: {cnt} раз каждые {sec}с")
        for i in range(cnt):
            code,out,err = run_shell("python -m monitoring.frontend_health")
            send_msg(f"[{i+1}/{cnt}] health → {code}")
            time.sleep(sec)
        return

    if text == "/pipeline":
        ok, left = _allowed("pipeline")
        if not ok:
            send_msg(f"⏳ Подожди ещё {left}с перед повтором /pipeline")
            return
        send_msg("Запускаю пайплайн: скрины → дифф…")
        c1,o1,e1 = run_shell("python -m monitoring.screenshot_agent")
        c2,o2,e2 = run_shell("python -m monitoring.visual_diff")
        # если какой-то код > 0 и ALERTS_ON — отправим краткий итог
        if ALERTS_ON and ((c1 and c1>0) or (c2 and c2>0)):
            send_msg(f"⚠️ Pipeline warning: snap={c1}, diff={c2}")
        send_msg(f"/pipeline → snap:{c1} diff:{c2}")
        from pathlib import Path as _P
        diff_dir = _P("monitoring")/"diff"
        reps = sorted(diff_dir.rglob("report.json"))
        if reps: send_doc(reps[-1], "visual diff report")
        zips = sorted(diff_dir.rglob("visual_diff_report.zip"))
        if zips: send_doc(zips[-1], "visual diff ZIP")
        return

    if text == "/backend_start":
        send_msg("Запускаю backend…")
        code,out,err = run_shell("uvicorn backend.main:app --reload --port 8000")
        send_msg(f"backend_start → {code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        return

    if text == "/tests":
        send_msg("Запускаю тесты…")
        code,out,err = run_shell("pytest -q")
        send_msg(f"tests → {code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        return

    if text == "/autoheal":
        code,out,err = run_shell("python -m monitoring.autoheal")
        send_msg(f"/autoheal → code={code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        return

    # показать процессы python, связанные с агентом
    if text == "/ps":
        try:
            import psutil
            rows = []
            for p in psutil.process_iter(attrs=["pid","name","cmdline"]):
                cmd = " ".join(p.info.get("cmdline") or [])
                if "monitoring.prompt_agent" in cmd:
                    rows.append(f"PID {p.info['pid']}  {cmd}")
            send_msg("Процессы агента:\n" + ("\n".join(rows) if rows else "нет"))
        except Exception as e:
            send_msg(f"/ps error: {e}")
        return

    # мягкий перезапуск без дублей
    if text == "/restart_me":
        send_msg("♻️ Перезапуск агента…")
        try:
            # снимаем lock и мьютекс, затем перезапуск себя
            try:
                if LOCK_FILE.exists(): LOCK_FILE.unlink()
            except: pass
            os.execv(sys.executable, [sys.executable, "-m", "monitoring.prompt_agent"])
        except Exception as e:
            send_msg(f"Не удалось перезапустить: {e}")
        return

    if text == "/frontend_restart":
        import psutil, subprocess
        killed = 0
        for p in psutil.process_iter(attrs=["pid","name","cmdline"]):
            try:
                cmd = " ".join(p.info.get("cmdline") or [])
                if "vite" in (cmd or "").lower():
                    p.kill(); killed += 1
            except: pass
        send_msg(f"Остановлено процессов vite: {killed}. Поднимаю dev…")
        code,out,err = run_shell("npm run dev -- --host")
        send_msg(f"frontend_restart → {code}")
        return

    if text == "/diff":
        code,out,err = run_shell("python -m monitoring.visual_diff")
        send_msg(f"/diff → code={code}\n{(out or '')[:900]}\n{(err or '')[:900]}")
        # если есть файл monitoring/diff/.../report.json — отправь его
        from pathlib import Path as _P
        diff_reports = sorted((_P("monitoring")/"diff").rglob("report.json"))
        if diff_reports: send_doc(diff_reports[-1], "visual diff report")
        return

    if text == "/set_baseline":
        from pathlib import Path as _P, shutil as _sh
        shots = sorted((_P("monitoring")/"screenshots").rglob("summary.json"))
        if not shots:
            send_msg("Нет последних скринов"); return
        last_dir = shots[-1].parent
        base = _P("monitoring")/"baseline"
        base.mkdir(parents=True, exist_ok=True)
        # копируем PNG
        for p in last_dir.glob("*.png"):
            _sh.copy2(p, base/p.name)
        send_msg("Baseline обновлён ✅")
        return

    if text.startswith("/run "):
        cmd = text[len("/run "):].strip()
        code,out,err = run_shell(cmd)
        send_msg(f"/run → {cmd}\ncode={code}\nstdout:\n{(out or '')[:900]}\nstderr:\n{(err or '')[:900]}")
        return

    if text.startswith("/task "):
        payload = text[len("/task "):].strip()
        try:
            task = json.loads(payload)
            task["ts"] = datetime.now().isoformat()
            enqueue(task)
            send_msg("Задача принята в очередь ✅")
        except Exception as e:
            send_msg(f"Ошибка JSON: {e}")
        return

    if text.startswith("/revert_snapshot "):
        br = text.split(" ",1)[1].strip()
        try:
            proc = subprocess.Popen(f"git checkout {br}", shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            out, err = proc.communicate(timeout=60)
            code = proc.returncode
        except subprocess.TimeoutExpired:
            code, out, err = 124, "", "Timeout"
        except Exception as e:
            code, out, err = 1, "", str(e)
        send_msg(f"revert to {br}: {code}\n{(out or '')[:400]}\n{(err or '')[:400]}")
        return

    if text == "/force_unlock":
        try:
            if LOCK_FILE.exists(): LOCK_FILE.unlink()
            send_msg("🔓 Lock удалён"); log_line("lock removed")
        except Exception as e:
            send_msg(f"Не удалось удалить lock: {e}")
        return

    if text == "/logs":
        if LOG_FILE.exists():
            send_doc(LOG_FILE, "agent.log")
        else:
            send_msg("Логов пока нет")
        return

    if text == "/reload_agent":
        try:
            import sys as _sys, os as _os, subprocess as _sp, time as _time
            from pathlib import Path as _P
            try:
                (_P("monitorинг")/"prompt_agent.lock").unlink(missing_ok=True)
            except Exception:
                pass
            _sp.Popen([_sys.executable, "-m", "monitoring.prompt_agent"], creationflags=0x00000008)
            send_msg("Перезапуск агента инициирован ✅")
            _time.sleep(0.5)
            _os._exit(0)
        except Exception as e:
            send_msg(f"/reload_agent error: {e}")
            return

        send_msg("Неизвестная команда. Напиши /help")

def process_tasks():
    tasks = iterate_queue()
    for t in tasks:
        try:
            act = t.get("action")
            if act == "shell":
                cmd = t.get("cmd","")
                code,out,err = run_shell(cmd)
                send_msg(f"task:shell → {cmd}\ncode={code}\nstdout:\n{(out or '')[:900]}\nstderr:\n{(err or '')[:900]}")
                append_done({"ok": code==0, "task":t, "out":out, "err":err})
            elif act == "replace":
                path = Path(t["path"])
                find = t.get("find","")
                repl = t.get("replace","")
                if not path.exists():
                    send_msg(f"task:replace → файл не найден: {path}")
                    append_done({"ok": False, "task":t, "err":"file not found"})
                    continue
                snap = git_snapshot("before replace")
                text = path.read_text(encoding="utf-8")
                new  = text.replace(find, repl)
                path.write_text(new, encoding="utf-8")
                send_msg(f"task:replace → OK\n{path}\nsnapshot: {snap or 'no-snapshot'}")
                append_done({"ok": True, "task":t, "snapshot": snap})
            elif act == "write":
                path = Path(t["path"])
                content = t.get("content","")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                send_msg(f"task:write → OK\n{path}")
                append_done({"ok": True, "task": t})
            else:
                send_msg(f"Неизвестное действие: {act}")
                append_done({"ok": False, "task":t, "err":"unknown action"})
        except Exception as e:
            append_done({"ok": False, "task":t, "err":traceback.format_exc()})
            send_msg(f"Ошибка в обработке задачи:\n{e}")

def main():
    # если по какой-то причине дубликат всё же стартовал интерактивно
    if os.environ.get("FORCE_MULTI","0") != "1":
        # single_instance_start уже отработал в __main__, но подстрахуемся
        # если здесь не наш PID в LOCK_FILE — сразу выходим
        try:
            if LOCK_FILE.exists() and LOCK_FILE.read_text().strip() != str(os.getpid()):
                print("[warn] duplicate detected; exiting")
                return
        except:
            pass
    if not TG_TOKEN or not CHAT_ID:
        print("TG_BOT_TOKEN/TG_CHAT_ID не заданы"); return
    send_msg("Агент команд запущен ✅ /help")
    QUIET_MODE = True
    log_line("agent started; quiet mode ON")
    # сносим вебхук на всякий случай
    try:
        requests.get(f"{TG_API}/deleteWebhook", timeout=10)
    except Exception as _e:
        log_line(f"deleteWebhook error: {_e}")
    offset = 0
    if STATE_PATH.exists():
        try: offset = int(STATE_PATH.read_text())
        except: offset = 0
    while True:
        try:
            updates = long_poll(offset)
            for u in updates:
                offset = max(offset, u["update_id"]+1)
                STATE_PATH.write_text(str(offset))
                msg = u.get("message") or u.get("edited_message")
                if not msg: continue
                chat = msg.get("chat",{})
                if str(chat.get("id")) != str(CHAT_ID): continue
                txt = (msg.get("text") or "").strip()
                if not txt: continue
                handle_text(txt)
            process_tasks()
        except Exception as e:
            msg = str(e)
            log_line(f"loop error: {msg}")
            err_type = "409" if ("409" in msg or "Conflict" in msg) else "other"
            if err_type == "409":
                # не спамим в чат
                time.sleep(30)
                continue
            global last_err_type, last_err_ts
            now = time.time()
            if (last_err_type != err_type) or (now - last_err_ts > 300):
                if not QUIET_MODE:
                    send_msg(f"Loop error: {msg}")
                last_err_type = err_type
                last_err_ts = now
            time.sleep(3)

if __name__ == "__main__":
    if not single_instance_start():
        sys.exit(0)
    try:
        main()
    finally:
        single_instance_cleanup()
