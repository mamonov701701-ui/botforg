from pathlib import Path
import os

# Базовый адрес фронта (если другой порт — поменяй)
BASE_URL = os.getenv("BOTFORG_BASE_URL", "http://localhost:5173")

# Какие страницы снимать
PAGES = [
    {"name": "home", "path": "/"},
    {"name": "editor-1", "path": "/editor/1"},
    {"name": "templates", "path": "/templates"},
    {"name": "features", "path": "/features"},
    {"name": "login", "path": "/login"},
]

# На каких «мониторах» рендерить
VIEWPORTS = [
    {"name": "1440x900", "width": 1440, "height": 900, "dpr": 1.0},
    {"name": "1920x1080", "width": 1920, "height": 1080, "dpr": 1.0},
]

# Делать ли full-page скрин
FULLPAGE_FOR = {"home", "features"}  # можно дополнять

# Папка для результатов
ROOT_DIR = Path("monitoring") / "screenshots"

# Telegram (заполни в ОС как переменные окружения)
TELEGRAM_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TG_CHAT_ID", "")

