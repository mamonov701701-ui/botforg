import os
from pathlib import Path
from typing import Optional

from pydantic import ConfigDict, model_validator
from pydantic_settings import BaseSettings

_KEYS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _KEYS_DIR.parent
_ENV_FILE = _KEYS_DIR / ".env"

# Дефолт в .env/доках: sqlite:///./botforg.db — иначе путь считается от cwd и миграции/uvicorn видят РАЗНЫЕ файлы.
_DEV_DEFAULT_SQLITE_URL = "sqlite:///./botforg.db"


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

    # Database (см. _anchor_dev_sqlite_url: дефолт привязывается к корню репозитория)
    DATABASE_URL: str = _DEV_DEFAULT_SQLITE_URL
    REDIS_URL: str = "redis://localhost:6379/0"
    STRICT_REDIS: bool = os.getenv("STRICT_REDIS", "false").lower() == "true"
    DB_STATEMENT_TIMEOUT_MS: int = int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "5000"))
    DB_LOCK_TIMEOUT_MS: int = int(os.getenv("DB_LOCK_TIMEOUT_MS", "2000"))
    CRM_AGGREGATE_BATCH_SIZE: int = int(os.getenv("CRM_AGGREGATE_BATCH_SIZE", "200"))
    SHADOW_MAX_STALE_SECONDS: int = int(os.getenv("SHADOW_MAX_STALE_SECONDS", "120"))

    # Payment providers (optional legacy keys — secrets only from env)
    TELEGRAM_PAYMENT_PROVIDER_TOKEN: Optional[str] = None
    YOOKASSA_SHOP_ID: Optional[str] = None
    YOOKASSA_SECRET_KEY: Optional[str] = None
    YOOKASSA_REDIRECT_URL: Optional[str] = None
    # Dev/test only: skip official webhook IP allowlist (NEVER in production)
    YOOKASSA_WEBHOOK_SKIP_IP_CHECK: bool = False
    PAYMENT_PROVIDER_HTTP_TIMEOUT_SEC: float = 15.0
    STRIPE_API_KEY: Optional[str] = None
    STRIPE_SUCCESS_URL: Optional[str] = None
    STRIPE_CANCEL_URL: Optional[str] = None
    CLOUDPAYMENTS_PUBLIC_ID: Optional[str] = None
    CLOUDPAYMENTS_SECRET_KEY: Optional[str] = None
    CLOUDPAYMENTS_PAYMENT_URL: Optional[str] = None
    CLOUDPAYMENTS_SUCCESS_URL: Optional[str] = None
    CLOUDPAYMENTS_FAIL_URL: Optional[str] = None

    # Payment provider abstraction (Этап 6.8)
    # Default provider name (e.g. yookassa). Fake never default in production.
    PAYMENT_PROVIDER_DEFAULT: str = "yookassa"
    # Comma-separated enabled provider names (without secrets)
    PAYMENT_PROVIDERS_AVAILABLE: str = "yookassa"
    # Test mode: allows FakePaymentProvider outside production
    PAYMENT_PROVIDER_TEST_MODE: bool = False
    # Explicit opt-in for fake provider in non-production (in addition to TESTING/test mode)
    ALLOW_FAKE_PAYMENT_PROVIDER: bool = False

    # Encrypted payment provider connection credentials (Этап 6.10A)
    # Master key: base64 (urlsafe) or hex of exactly 32 bytes. Never store in DB.
    PAYMENT_CREDENTIALS_MASTER_KEY: str = ""
    PAYMENT_CREDENTIALS_KEY_ID: str = "default"
    PAYMENT_CREDENTIALS_ENCRYPTION_VERSION: int = 1

    # Testing mode
    TESTING: bool = os.getenv("TESTING", "false").lower() == "true"
    # Dev-only: allow mock POST /me/plan and PATCH /billing/quota (never in production)
    ALLOW_DEV_TARIFF_FULFILLMENT: bool = False
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

    @model_validator(mode="after")
    def _anchor_dev_sqlite_url(self) -> "Settings":
        """Один и тот же botforg.db независимо от текущего каталога процесса (Alembic vs uvicorn)."""
        raw = (self.DATABASE_URL or "").strip()
        if raw != _DEV_DEFAULT_SQLITE_URL:
            return self
        db_path = (_REPO_ROOT / "botforg.db").resolve()
        self.DATABASE_URL = f"sqlite:///{db_path.as_posix()}"
        return self


settings = Settings()
