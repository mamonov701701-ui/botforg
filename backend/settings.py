import os
from typing import Optional

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


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

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
