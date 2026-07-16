"""
Checkout intent — pending-заказ на будущую покупку тарифа/пакета (Этап 6.5).

Не выдаёт entitlement и не имитирует оплату. Цена фиксируется snapshot'ом с сервера.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class CheckoutProductType(str, Enum):
    TARIFF = "tariff"
    ADDON = "addon"


class CheckoutIntentStatus(str, Enum):
    PENDING = "pending"


class CheckoutIntent(Base):
    """Pending checkout intent: каталожный code + серверный snapshot цены."""

    __tablename__ = "checkout_intents"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_checkout_intents_user_idempotency",
        ),
        Index("ix_checkout_intents_user_id", "user_id"),
        Index("ix_checkout_intents_status", "status"),
        Index("ix_checkout_intents_product", "product_type", "product_code"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    product_type = Column(String(32), nullable=False)
    product_code = Column(String(64), nullable=False)
    product_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(10), nullable=False, default="RUB")
    status = Column(String(32), nullable=False, default=CheckoutIntentStatus.PENDING.value)
    idempotency_key = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], backref="checkout_intents")
