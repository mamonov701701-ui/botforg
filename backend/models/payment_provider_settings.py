"""
Admin-настройки платёжных провайдеров (Этап 6.9).

Секреты НЕ хранятся в этой таблице — только в env.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PaymentProviderMode(str):
    TEST = "test"
    PRODUCTION = "production"


class PaymentProviderSetting(Base):
    """Настройки провайдера для админки (без секретов)."""

    __tablename__ = "payment_provider_settings"
    __table_args__ = (
        UniqueConstraint("code", name="uq_payment_provider_settings_code"),
        Index("ix_payment_provider_settings_enabled", "enabled"),
        Index(
            "ix_payment_provider_settings_is_default",
            "is_default_for_new_payments",
        ),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    display_name = Column(String(128), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    mode = Column(String(32), nullable=False, default="test")
    currency = Column(String(10), nullable=False, default="RUB")
    priority = Column(Integer, nullable=False, default=100)
    is_default_for_new_payments = Column(Boolean, nullable=False, default=False)

    last_health_check_at = Column(DateTime, nullable=True)
    last_health_check_status = Column(String(32), nullable=True)
    last_health_check_message = Column(Text, nullable=True)

    last_webhook_status = Column(String(32), nullable=True)
    last_webhook_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
