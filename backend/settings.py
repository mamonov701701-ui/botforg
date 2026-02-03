import os
from pathlib import Path
from typing import Optional

from pydantic import ConfigDict
from pydantic_settings import BaseSettings

_KEYS_DIR = Path(__file__).resolve().parent
_ENV_FILE = _KEYS_DIR / ".env"


class Settings(BaseSettings):
    # JWT settings
    # For development/testing, defaults are provided. In production, set via environment!
    SECRET_KEY: str = "dev-secret-key-change-in-production-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # OAuth JWT settings (for session cookies)
    # For development/testing, defaults are provided. In production, set via environment!
    JWT_SECRET: str = "dev-jwt-secret-key-change-in-production-32"
    SESSION_SECRET: str = ""  # Optional: Separate session secret (recommended)
    ENVIRONMENT: str = "development"

    # OAuth providers
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    YANDEX_CLIENT_ID: str = ""
    YANDEX_CLIENT_SECRET: str = ""
    MAILRU_CLIENT_ID: str = ""
    MAILRU_CLIENT_SECRET: str = ""

    # CORS settings
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # Email/Password Auth
    REQUIRE_EMAIL_VERIFICATION: bool = True
    SMTP_HOST: str = ""
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    EMAIL_FROM: str = "BotForg <noreply@botforg.app>"

    # Database
    DATABASE_URL: str = "sqlite:///./botforg.db"

    # Payment providers (optional)
    TELEGRAM_PAYMENT_PROVIDER_TOKEN: Optional[str] = None
    YOOKASSA_SHOP_ID: Optional[str] = None
    YOOKASSA_SECRET_KEY: Optional[str] = None
    YOOKASSA_REDIRECT_URL: Optional[str] = None
    STRIPE_API_KEY: Optional[str] = None
    STRIPE_SUCCESS_URL: Optional[str] = None
    STRIPE_CANCEL_URL: Optional[str] = None
    CLOUDPAYMENTS_PUBLIC_ID: Optional[str] = None
    CLOUDPAYMENTS_SECRET_KEY: Optional[str] = None
    CLOUDPAYMENTS_PAYMENT_URL: Optional[str] = None
    CLOUDPAYMENTS_SUCCESS_URL: Optional[str] = None
    CLOUDPAYMENTS_FAIL_URL: Optional[str] = None

    # Testing mode
    TESTING: bool = os.getenv("TESTING", "false").lower() == "true"
    # Production: must be False (no debug stack traces, no autodocs in unsafe mode)
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    # В prod по умолчанию отключаем /docs, /redoc, /openapi.json (ALLOW_DOCS=false)
    ALLOW_DOCS: bool = (
        os.getenv("ALLOW_DOCS", "false" if os.getenv("ENVIRONMENT") == "production" else "true").lower() == "true"
    )

    # 152-ФЗ: регион данных и хранения (для prod в РФ обязательны DATA_REGION=RU, STORAGE_REGION=RU)
    DATA_REGION: str = ""
    STORAGE_REGION: str = ""
    # 152-ФЗ: секрет для HMAC chat_hash (в prod обязателен, chat_id в БД не хранится)
    CHAT_HASH_SALT: str = ""

    # MAX (platform-api.max.ru): базовый URL API и публичный URL для webhook
    MAX_API_BASE: str = "https://platform-api.max.ru"
    MAX_WEBHOOK_BASE_URL: str = ""  # https://YOUR_DOMAIN — обязателен в prod для включения канала MAX
    MAX_WEBHOOK_SECRET_LEN: int = 48  # длина генерируемого webhook_secret (A-Za-z0-9_-)

    # WhatsApp Meta Cloud API (Graph API)
    WHATSAPP_GRAPH_API_BASE: str = "https://graph.facebook.com/v19.0"

    model_config = ConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
