import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

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
if settings.ENVIRONMENT == "development":
    # В dev режиме разрешаем туннельные домены
    allowed_origins.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if settings.ENVIRONMENT != "development" else ["*"],
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
app.include_router(auth.router, prefix="/auth")
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
