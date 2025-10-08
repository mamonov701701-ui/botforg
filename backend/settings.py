from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT settings
    SECRET_KEY: str = "your_secret_key_here_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS settings
    FRONTEND_ORIGIN: str = "http://localhost:5173"

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
