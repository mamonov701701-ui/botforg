# Chat module enabled - 2026-01-21
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

from backend.auth import email_routes
from backend.auth import routes as oauth_routes
from backend.middleware.security import SecurityMiddleware
from backend.routers import account as account_router
from backend.routers import plans as plans_router
from backend.routers import tariff as tariff_router
from backend.routers import auth
from backend.routers import billing as billing_router
from backend.routers import blocks as blocks_router
from backend.routers import bot as bot_router
from backend.routers import bot_crm as bot_crm_router
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
from backend.routers import market_admin as market_admin_router
from backend.routers import tariff_admin as tariff_admin_router
from backend.routers import legal as legal_router
from backend.routers import privacy as privacy_router
from backend.routers import channels as channels_router
from backend.routers import channel_webhooks as channel_webhooks_router
from backend.routers import dev_simulate as dev_simulate_router
from backend.routers import max as max_router
from backend.routers import whatsapp as whatsapp_router
from backend.routers import webhook as webhook_router
import backend.channels  # noqa: F401 — регистрация адаптеров каналов
from backend.settings import settings
from backend.database import SessionLocal, check_db_connection
from backend.models.constructor_core import CtorBotUser
from backend.services.cache.redis_cache import (
    add_dirty_aggregate,
    pop_dirty_aggregates,
    check_redis_connection,
)
from backend.services.bot_crm.overview_aggregate_service import refresh_overview_aggregate

logger = logging.getLogger(__name__)


def _check_production_env():
    """152-ФЗ: в production запретить запуск без обязательных env (РФ)."""
    if settings.ENVIRONMENT != "production":
        return
    dev_secret = "dev-secret-key-change-in-production-32chars"
    dev_jwt = "dev-jwt-secret-key-change-in-production-32"
    if not settings.SECRET_KEY or settings.SECRET_KEY == dev_secret:
        logger.error("Production: SECRET_KEY must be set and differ from dev default")
        sys.exit(1)
    if not settings.JWT_SECRET or settings.JWT_SECRET == dev_jwt:
        logger.error("Production: JWT_SECRET must be set and differ from dev default")
        sys.exit(1)
    if getattr(settings, "DEBUG", False):
        logger.error("Production: DEBUG must be false")
        sys.exit(1)
    if settings.DATA_REGION != "RU":
        logger.error("Production: DATA_REGION=RU is required for РФ")
        sys.exit(1)
    if settings.STORAGE_REGION != "RU":
        logger.error("Production: STORAGE_REGION=RU is required for РФ")
        sys.exit(1)
    if not settings.CHAT_HASH_SALT or settings.CHAT_HASH_SALT.strip() == "":
        logger.error("Production: CHAT_HASH_SALT must be set for РФ")
        sys.exit(1)


def _run_startup_sync() -> None:
    """Синхронный старт: миграции SQLite + фоновые потоки. Вызывается из lifespan до yield (трафик не обрабатывается)."""
    _check_production_env()
    db_ok, db_msg = check_db_connection()
    if not db_ok:
        raise RuntimeError(f"Database is not ready at startup: {db_msg}")

    from backend.services.ensure_migrations import ensure_dev_sqlite_migrations_applied

    ensure_dev_sqlite_migrations_applied()

    if settings.ENVIRONMENT == "production" and settings.STRICT_REDIS:
        redis_ok, redis_msg = check_redis_connection()
        if not redis_ok:
            raise RuntimeError(f"Redis is required in production, but unavailable: {redis_msg}")

    if settings.ENVIRONMENT == "production":
        logger.info("Production mode enabled")
        logger.info("Security keys loaded from environment")
    if getattr(settings, "TESTING", False):
        return
    from backend.services.retention_cleanup import run_retention_cleanup_once

    is_sqlite = str(getattr(settings, "DATABASE_URL", "")).startswith("sqlite")

    def _seed_crm_aggregate_dirty() -> None:
        db = SessionLocal()
        try:
            rows = db.query(CtorBotUser.bot_id, CtorBotUser.environment).distinct().all()
            for bot_id, env in rows:
                if not bot_id:
                    continue
                e = str(env or "prod")
                if e not in ("dev", "prod"):
                    e = "prod"
                add_dirty_aggregate(int(bot_id), e)
        finally:
            db.close()

    def _crm_aggregate_loop() -> None:
        time.sleep(8)
        seeded = False
        sleep_seconds = 30
        while True:
            try:
                if not seeded:
                    _seed_crm_aggregate_dirty()
                    seeded = True
                dirty = pop_dirty_aggregates(limit=max(1, int(settings.CRM_AGGREGATE_BATCH_SIZE)))
                for bot_id, env in dirty:
                    db = SessionLocal()
                    try:
                        refresh_overview_aggregate(db, bot_id=bot_id, environment=env)  # type: ignore[arg-type]
                    finally:
                        db.close()
                sleep_seconds = 30
            except Exception as e:
                logger.exception("crm_aggregate_refresh: %s", e)
                sleep_seconds = min(300, max(30, sleep_seconds * 2))
            time.sleep(sleep_seconds)

    def _loop():
        time.sleep(60)
        sleep_seconds = 86400
        error_sleep_seconds = 300
        while True:
            try:
                run_retention_cleanup_once()
                sleep_seconds = 86400
                error_sleep_seconds = 300
            except Exception as e:
                logger.exception("retention_cleanup: %s", e)
                sleep_seconds = error_sleep_seconds
                error_sleep_seconds = min(86400, error_sleep_seconds * 2)
            time.sleep(sleep_seconds)

    if is_sqlite:
        logger.info("Skipping CRM aggregate background loop for SQLite database")
    else:
        threading.Thread(target=_crm_aggregate_loop, daemon=True).start()
    threading.Thread(target=_loop, daemon=True).start()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """lifespan до yield блокирует приём запросов — Alembic на SQLite не конкурирует с POST /auth/email/login."""
    _run_startup_sync()
    yield


# В prod (ENVIRONMENT=production) по умолчанию /docs, /redoc, /openapi.json отключены (404)
_docs_enabled = getattr(settings, "ALLOW_DOCS", True)
app = FastAPI(
    lifespan=_lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Add session middleware for OAuth state
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET
    if settings.SESSION_SECRET
    else settings.JWT_SECRET,
    same_site="lax",
)

# Security: чистый ASGI (SecurityASGIMiddleware), не второй BaseHTTPMiddleware — иначе uvicorn + POST ломаются.
# ПДн-лог в том же слое. Рядом только SessionMiddleware (BaseHTTPMiddleware) — см. backend/middleware/security.py
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
        "http://localhost:8011",
        "http://127.0.0.1:8011",
        "http://localhost:8002",
        "http://127.0.0.1:8002",
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
app.include_router(plans_router.router)
app.include_router(tariff_router.router)

# Existing routes
# app.include_router(auth.router, prefix="/auth")  # ОТКЛЮЧЕН - используем email_routes вместо этого
app.include_router(templates.router)  # без prefix
app.include_router(bot_router.router, prefix="/bots")
app.include_router(bot_crm_router.router, prefix="/bots")
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
app.include_router(market_admin_router.router)
app.include_router(tariff_admin_router.router)
app.include_router(chat_router.router)
app.include_router(legal_router.router)
app.include_router(privacy_router.router)
app.include_router(channels_router.router)
app.include_router(max_router.router)
app.include_router(whatsapp_router.router)
app.include_router(channel_webhooks_router.router)
app.include_router(dev_simulate_router.router)
app.include_router(webhook_router.router)

# Настройка раздачи статических файлов для загруженных медиа
UPLOAD_DIR = Path("uploads/media")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/ready", tags=["system"])
def readiness_check():
    db_ok, db_msg = check_db_connection()
    redis_ok, redis_msg = check_redis_connection()
    checks = {
        "db": {"ok": db_ok, "message": db_msg},
        "redis": {"ok": redis_ok, "message": redis_msg},
        "crm_aggregate_service": {"ok": True, "message": "loaded"},
    }
    if not db_ok:
        return JSONResponse(status_code=503, content={"status": "not_ready", "checks": checks})
    if settings.ENVIRONMENT == "production" and settings.STRICT_REDIS and not redis_ok:
        return JSONResponse(status_code=503, content={"status": "not_ready", "checks": checks})
    return {"status": "ready", "checks": checks}


# Главная: редирект на Swagger
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


# Healthcheck для быстрой проверки живости
@app.get("/healthz", tags=["system"])
def healthz():
    return {"status": "ok"}




