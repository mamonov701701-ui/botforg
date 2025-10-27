import atexit
import json
import os
import re
import shutil
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
ALERTS_ON = False
BOT_ALREADY_RUNNING = False
QUIET_MODE = True
last_err_type = None
last_err_ts = 0


def run_ps(cmd: str, timeout=600):
    """Запустить PowerShell-команду и вернуть (rc, out, err)."""
    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
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


def run_ps_file(script_path: str, timeout=600):
    """Запустить PowerShell скрипт из файла и вернуть (rc, out, err)."""
    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path],
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


def run_cmd(cmd: str, timeout=600):
    """Выполнить произвольную команду в shell и вернуть (rc, out, err)."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=ROOT,
        )
        return (result.returncode, result.stdout, result.stderr)
    except subprocess.TimeoutExpired:
        return (124, "", "TIMEOUT")
    except Exception as e:
        return (1, "", str(e))


def do_fix_frontend_host():
    """Внутренняя функция для исправления vite.config.js"""
    vite_config_path = ROOT / "frontend" / "vite.config.js"
    vite_config_ts_path = ROOT / "frontend" / "vite.config.ts"
    
    # Определяем какой файл существует
    if vite_config_path.exists():
        config_file = vite_config_path
    elif vite_config_ts_path.exists():
        config_file = vite_config_ts_path
    else:
        return {"success": False, "error": "vite.config.js не найден"}
    
    # Правильная рабочая конфигурация с middleware для туннелей
    correct_config = """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'disable-host-check',
      configureServer(server) {
        // Отключаем проверку хоста для туннелей
        server.middlewares.use((req, res, next) => {
          delete req.headers['host']
          req.headers['host'] = 'localhost:5173'
          next()
        })
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
"""
    
    try:
        config_file.write_text(correct_config, encoding="utf-8")
        log_line("vite.config.js restored to working configuration")
        return {"success": True, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def handle_fix_backend_cors():
    """Проверить и исправить CORS настройки в backend/main.py"""
    main_py_path = ROOT / "backend" / "main.py"
    
    if not main_py_path.exists():
        return {"changed": False, "error": "backend/main.py не найден"}
    
    try:
        content = main_py_path.read_text(encoding="utf-8")
        original_content = content
        changed = False
        
        # Проверяем наличие импорта CORSMiddleware
        if "from fastapi.middleware.cors import CORSMiddleware" not in content:
            # Находим первый импорт FastAPI и добавляем после него
            if "from fastapi import FastAPI" in content:
                content = content.replace(
                    "from fastapi import FastAPI",
                    "from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware"
                )
                changed = True
        
        # Проверяем правильность настройки CORS
        has_correct_cors = (
            'allow_origins=allowed_origins if settings.ENVIRONMENT != "development" else ["*"]' in content
            or 'allow_origins=["*"]' in content
        ) and 'allow_credentials=True' in content and 'allow_methods=["*"]' in content
        
        if not has_correct_cors:
            # Ищем блок app.add_middleware(CORSMiddleware
            if "app.add_middleware(\n    CORSMiddleware," in content:
                # CORS блок уже есть, но неправильный - не трогаем, просто сообщаем
                pass
            else:
                # CORS блока нет - добавляем после app = FastAPI()
                if "app = FastAPI()" in content:
                    cors_block = """\n\n# Настройка CORS - разрешаем все источники в dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)"""
                    content = content.replace(
                        "app = FastAPI()",
                        "app = FastAPI()" + cors_block
                    )
                    changed = True
        
        if changed:
            main_py_path.write_text(content, encoding="utf-8")
            log_line("backend/main.py: CORS settings updated")
        
        return {"changed": changed, "error": None}
    
    except Exception as e:
        return {"changed": False, "error": str(e)}


def handle_status(payload):
    cmd = """
    git rev-parse --abbrev-ref HEAD;
    git status -s;
    """
    rc, out, err = run_ps(cmd)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_backend_start(payload):
    # быстрый старт бекенда через uvicorn (порт 8001)
    cmd = r"""
    cd backend;
    if (Test-Path .venv) { . .\.venv\Scripts\Activate.ps1 } elseif (Test-Path venv) { . .\venv\Scripts\Activate.ps1 }
    pip install -r requirements.txt;
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*uvicorn*' } | Stop-Process -Force;
    Start-Sleep 2;
    Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','cd C:\Users\mamon\botforg\backend; if (Test-Path .venv) { . .\.venv\Scripts\Activate.ps1 } elseif (Test-Path venv) { . .\venv\Scripts\Activate.ps1 }; uvicorn main:app --host 0.0.0.0 --port 8001 --reload' | Out-Null;
    "backend: started on http://localhost:8001"
    """
    rc, out, err = run_ps(cmd, timeout=120)
    return {"rc": rc, "stdout": out, "stderr": err}


def handle_frontend_start(payload):
    # vite dev (порт 5173) - host настроен в vite.config.js
    cmd = r"""
    cd frontend;
    if (Test-Path package-lock.json) { npm ci } else { npm install }
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*vite*' } | Stop-Process -Force;
    Start-Sleep 2;
    Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','cd C:\Users\mamon\botforg\frontend; $env:DANGEROUSLY_DISABLE_HOST_CHECK="true"; npm run dev' | Out-Null;
    "frontend: started on http://0.0.0.0:5173 (доступен для туннелей)"
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
        "stdout": "backend: http://localhost:8001\nfrontend: http://localhost:5173",
        "stderr": "",
    }


def handle_expose(payload):
    # Запускаем SSH туннель (localhost.run) - работает везде!
    rc, out, err = run_ps_file(
        r"scripts\dev-expose-ssh.ps1",
        timeout=15,  # Скрипт работает ~10 секунд (SSH уходит в фон сразу)
    )
    be_url = None
    fe_url = None
    install_cmd = None
    error_msg = None
    
    for line in out.splitlines():
        if line.startswith("BACKEND_URL="):
            be_url = line.split("=", 1)[1].strip()
        if line.startswith("FRONTEND_URL="):
            fe_url = line.split("=", 1)[1].strip()
        if line.startswith("INSTALL_CMD="):
            install_cmd = line.split("=", 1)[1].strip()
        if line.startswith("ERROR_MSG="):
            error_msg = line.split("=", 1)[1].strip()
    
    pretty = []
    
    # Cloudflared не установлен
    if be_url == "NOT_INSTALLED":
        pretty.append("⚠️ Cloudflared не установлен")
        pretty.append("")
        pretty.append("📦 Установите командой:")
        pretty.append(f"   {install_cmd}")
        pretty.append("")
        pretty.append("Затем перезапустите терминал и попробуйте /expose снова")
        return {"rc": 0, "stdout": "\n".join(pretty), "stderr": ""}
    
    # Сервера не запущены
    if be_url == "NOT_RUNNING" and fe_url == "NOT_RUNNING":
        pretty.append("⚠️ Сервера не запущены")
        pretty.append("")
        pretty.append("Сначала запустите:")
        pretty.append("  /backend_start")
        pretty.append("  /frontend_start")
        pretty.append("")
        pretty.append("Затем попробуйте /expose снова")
        return {"rc": 0, "stdout": "\n".join(pretty), "stderr": ""}
    
    # URLs получены
    has_urls = False
    if be_url and be_url != "PENDING" and be_url != "NOT_RUNNING" and not be_url.startswith("ERROR"):
        pretty.append(f"🌐 Backend → {be_url}")
        has_urls = True
    if fe_url and fe_url != "PENDING" and fe_url != "NOT_RUNNING" and not fe_url.startswith("ERROR"):
        pretty.append(f"🌐 Frontend → {fe_url}")
        has_urls = True
    
    if has_urls:
        pretty.append("")
        pretty.append("✅ Туннели созданы!")
        pretty.append("")
        pretty.append("⚠️ ВАЖНО:")
        pretty.append("Если видите ошибку 1033 в браузере:")
        pretty.append("   → Запустите /backend_start")
        pretty.append("   → Подождите 10 секунд")
        pretty.append("   → Обновите страницу в браузере")
    else:
        pretty.append("⏳ Туннели создаются... попробуйте /expose ещё раз через 15 сек")
    
    return {"rc": rc, "stdout": "\n".join(pretty) or out, "stderr": err}


def handle_install_cloudflared(payload):
    # Устанавливаем cloudflared через winget
    rc, out, err = run_ps(
        r"winget install Cloudflare.cloudflared --silent --accept-package-agreements --accept-source-agreements",
        timeout=300,
    )
    if rc == 0:
        msg = "✅ Cloudflared установлен!\n\n"
        msg += "Теперь попробуйте /expose"
        return {"rc": 0, "stdout": msg, "stderr": ""}
    else:
        return {"rc": rc, "stdout": out or "Ошибка установки", "stderr": err}


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


def handle_fix_pipeline(payload):
    """Авточин + полный запуск (frontend+backend+туннели)"""
    results = {}
    
    # 1. Фикс frontend host
    frontend_result = do_fix_frontend_host()
    results["frontend_host"] = "OK" if frontend_result.get("success") else "FAIL"
    
    # 2. Фикс backend CORS
    cors_result = handle_fix_backend_cors()
    results["backend_cors"] = "OK" if not cors_result.get("error") else "FAIL"
    
    # 3. Запуск полного pipeline
    pipeline_result = handle_pipeline({})
    results["pipeline"] = "OK" if pipeline_result.get("rc") == 0 else "FAIL"
    
    # Формируем итоговый отчет
    status = "\n".join([f"  - {k}: {v}" for k, v in results.items()])
    all_ok = all(v == "OK" for v in results.values())
    icon = "✅" if all_ok else "⚠️"
    
    return {
        "rc": 0 if all_ok else 1,
        "stdout": f"🧪 fix_pipeline завершён:\n{status}\nГотово {icon}",
        "stderr": ""
    }


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
    "install_cloudflared": handle_install_cloudflared,
    "pipeline": handle_pipeline,
    "fix_pipeline": handle_fix_pipeline,
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


def send_msg(text: str, reply_markup=None):
    """Отправить сообщение с опциональной клавиатурой"""
    if not TG_TOKEN or not CHAT_ID:
        return
    try:
        data = {"chat_id": CHAT_ID, "text": text}
        if reply_markup:
            data["reply_markup"] = json.dumps(reply_markup)
        requests.post(
            f"{TG_API}/sendMessage",
            data=data,
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


def build_main_menu():
    """Главное меню (основное управление проектом)"""
    return {
        "keyboard": [
            [{"text": "/status"}, {"text": "/backend_start"}, {"text": "/frontend_start"}],
            [{"text": "/expose"}, {"text": "/pipeline"}, {"text": "/stop_all"}],
            [{"text": "/menu_sys"}, {"text": "/logs"}, {"text": "/restart_me"}],
        ],
        "resize_keyboard": True,
    }


def build_sys_menu():
    """Системное меню (диагностика, билды, шумность)"""
    return {
        "keyboard": [
            [{"text": "/tests"}, {"text": "/typecheck"}, {"text": "/build"}],
            [{"text": "/quiet"}, {"text": "/verbose"}, {"text": "/logs"}],
            [{"text": "/fix_backend_cors"}, {"text": "/fix_frontend_host"}],
            [{"text": "/install_cloudflared"}, {"text": "/menu_main"}],
        ],
        "resize_keyboard": True,
    }


def handle_text(text: str):
    """Handle Telegram commands"""
    text = text.strip()

    if text in ("/start", "/help"):
        help_text = (
            "🤖 BotForg Dev Agent\n\n"
            "⚡ БЫСТРЫЙ СТАРТ:\n"
            "/pipeline — Запустить всё сразу (backend+frontend+туннели)\n"
            "/preview_urls — Показать все ссылки\n\n"
            "🚀 УПРАВЛЕНИЕ СЕРВИСАМИ:\n"
            "/backend_start — Запустить FastAPI (порт 8001)\n"
            "/frontend_start — Запустить Vite (порт 5173)\n"
            "/expose — Создать публичные туннели (SSH)\n"
            "/stop_all — Остановить все процессы\n\n"
            "🔍 РАЗРАБОТКА:\n"
            "/status — Git branch + статус\n"
            "/typecheck — TypeScript проверка\n"
            "/tests — Backend pytest\n"
            "/build — Production build\n\n"
            "⚙️ НАСТРОЙКИ:\n"
            "/quiet — Тихий режим (меньше логов)\n"
            "/verbose — Полный лог\n"
            "/logs — Скачать логи агента\n"
            "/restart_me — Перезапустить агента\n\n"
            "🩹 АВТОЧИН / ДИСТАНЦИОННО:\n"
            "/fix_pipeline — авточин + полный запуск (frontend+backend+туннели)\n\n"
            "🔧 ПРОДВИНУТОЕ:\n"
            "/fix_backend_cors — починить CORS backend и перезапустить FastAPI\n"
            "/fix_frontend_host — восстановить vite.config.js (разрешить доступ через туннели)\n"
            '/task {"action":"exec","cmd":"echo test"} — выполнить команду на Dev-машине (ТОЛЬКО ВЛАДЕЛЕЦ)\n\n'
            "💡 Используйте кнопки меню ниже ⬇️"
        )
        send_msg(help_text, reply_markup=build_main_menu())
        return

    if text == "/menu_main":
        send_msg("📋 Главное меню ✅", reply_markup=build_main_menu())
        return

    if text == "/menu_sys":
        send_msg("⚙️ Системное меню", reply_markup=build_sys_menu())
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

    if text == "/fix_backend_cors":
        send_msg("🛡 Проверяю CORS настройки backend...")
        
        result = handle_fix_backend_cors()
        
        if result.get("error"):
            send_msg(f"❌ Ошибка: {result['error']}")
            return
        
        # Перезапускаем backend
        send_msg("🔄 Перезапускаю backend...")
        backend_result = handle_backend_start({})
        
        changed_text = "✅ да" if result.get("changed") else "ℹ️ уже был настроен"
        backend_status = "✅ успешно" if backend_result.get("rc") == 0 else "❌ ошибка"
        
        response = (
            f"🛡 CORS проверен\n"
            f"🔄 Backend перезапущен: {backend_status}\n"
            f"✍️ Файл обновлён: {changed_text}"
        )
        
        send_msg(response)
        log_line(f"fix_backend_cors: changed={result.get('changed')}, backend_rc={backend_result.get('rc')}")
        return

    if text == "/fix_frontend_host":
        send_msg("🛠 Исправляю vite.config.js...")
        
        result = do_fix_frontend_host()
        
        if result.get("error"):
            send_msg(f"❌ Ошибка: {result['error']}")
        else:
            send_msg(
                "✅ vite.config.js успешно исправлен!\n"
                "Теперь можно перезапустить фронтенд:\n"
                "/frontend_start"
            )
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
        "/install_cloudflared": "install_cloudflared",
        "/preview_urls": "preview_urls",
        "/pipeline": "pipeline",
        "/fix_pipeline": "fix_pipeline",
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
            
            # Специальная обработка для exec - выполнение произвольной команды
            if action == "exec":
                cmd = task.get("cmd", "").strip()
                if not cmd:
                    send_msg("❌ exec: no cmd provided")
                    return
                
                send_msg(f"Выполняю команду: {cmd[:100]}...")
                rc, stdout, stderr = run_cmd(cmd, timeout=300)
                
                icon = "✅" if rc == 0 else "❌"
                response = f"{icon} exec (rc={rc})\n"
                if stdout:
                    response += f"\n{stdout[:2000]}"
                if stderr:
                    response += f"\n\nstderr:\n{stderr[:1000]}"
                
                send_msg(response)
                log_line(f"exec: cmd='{cmd[:100]}' rc={rc}")
                return
            
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
    global BOT_ALREADY_RUNNING
    if BOT_ALREADY_RUNNING:
        # уже есть активный polling цикл, не запускаем второй, просто выходим спокойно
        return
    BOT_ALREADY_RUNNING = True
    
    if not TG_TOKEN or not CHAT_ID:
        print("❌ TG_BOT_TOKEN/TG_CHAT_ID не заданы")
        print("Установите переменные окружения:")
        print("  set TG_BOT_TOKEN=your_token")
        print("  set TG_CHAT_ID=your_chat_id")
        return

    send_msg(
        "🤖 Агент команд запущен ✅\nИспользуй /help для списка команд",
        reply_markup=build_main_menu()
    )
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
