# Chat module enabled - 2026-01-21
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

from backend.auth import email_routes
from backend.auth import routes as oauth_routes
from backend.middleware.security import SecurityMiddleware
from backend.routers import account as account_router
from backend.routers import auth
from backend.routers import billing as billing_router
from backend.routers import blocks as blocks_router
from backend.routers import bot as bot_router
from backend.routers import bot_template as bot_template_router
from backend.routers import editor as editor_router
from backend.routers import message as message_router
from backend.routers import payment as payment_router
from backend.routers import review as review_router
from backend.routers import scenario as scenario_router
from backend.routers import template as templates
from backend.routers import user_template as user_template_router
from backend.routers import platform_admin as platform_admin_router
from backend.routers import user_security as user_security_router
from backend.routers import my_roles as my_roles_router
from backend.routers import team as team_router
from backend.routers import ai as ai_router
from backend.routers import analytics as analytics_router
from backend.routers import media as media_router
from backend.routers import bot_tags as bot_tags_router
from backend.routers import chat as chat_router
from backend.routers import bot_contacts as bot_contacts_router
from backend.routers import market as market_router
from backend.settings import settings

app = FastAPI()

# Add session middleware for OAuth state
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET
    if settings.SESSION_SECRET
    else settings.JWT_SECRET,
    same_site="lax",
)

# Добавляем security middleware
app.add_middleware(SecurityMiddleware)

# Настройка CORS - разрешаем localhost + туннели
allowed_origins = [settings.FRONTEND_ORIGIN, settings.FRONTEND_URL]

# В dev режиме добавляем localhost варианты
if settings.ENVIRONMENT == "development":
    allowed_origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ])
    # Убираем дубликаты
    allowed_origins = list(set(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Всегда используем конкретные origins (нельзя использовать "*" с credentials)
    allow_credentials=True,  # Important for OAuth cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Убираем Base.metadata.create_all(bind=engine) - используем Alembic

# OAuth routes (new)
app.include_router(oauth_routes.router)
app.include_router(email_routes.router)
app.include_router(account_router.router)

# Existing routes
# app.include_router(auth.router, prefix="/auth")  # ОТКЛЮЧЕН - используем email_routes вместо этого
app.include_router(templates.router)  # без prefix
app.include_router(bot_router.router, prefix="/bots")
app.include_router(review_router.router)  # без prefix
app.include_router(user_template_router.router, prefix="/user-templates")
app.include_router(bot_template_router.router, prefix="/bot-templates")
app.include_router(message_router.router, prefix="/messages")
app.include_router(billing_router.router, prefix="/billing")
app.include_router(payment_router.router)
app.include_router(editor_router.router)
app.include_router(blocks_router.router)
app.include_router(scenario_router.router)
app.include_router(platform_admin_router.router)
app.include_router(user_security_router.router)
app.include_router(my_roles_router.router)
app.include_router(team_router.router, prefix="/api/team")
app.include_router(ai_router.router)
app.include_router(analytics_router.router)
app.include_router(media_router.router, prefix="/media")
app.include_router(bot_tags_router.router)
app.include_router(bot_contacts_router.router)
app.include_router(market_router.router)
app.include_router(chat_router.router)

# Настройка раздачи статических файлов для загруженных медиа
UPLOAD_DIR = Path("uploads/media")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Главная: редирект на Swagger
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


# Healthcheck для быстрой проверки живости
@app.get("/healthz", tags=["system"])
def healthz():
    return {"status": "ok"}

# Force reload trigger - chat enabled 2026-01-21 14:25
