"""
Checkout intent + payment attempts / webhook events (Этапы 6.5–6.7).

Provider-agnostic: без YooKassa HTTP. Fulfillment — через services/payment_fulfillment.py.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
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
    AWAITING_PAYMENT = "awaiting_payment"
    PAID = "paid"
    FULFILLED = "fulfilled"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentAttemptStatus(str, Enum):
    CREATED = "created"
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentWebhookProcessStatus(str, Enum):
    RECEIVED = "received"
    PROCESSED = "processed"
    IGNORED = "ignored"
    ERROR = "error"


# Statuses that must not receive new entitlement fulfillment.
CHECKOUT_TERMINAL_BLOCKING = frozenset(
    {
        CheckoutIntentStatus.CANCELLED.value,
        CheckoutIntentStatus.FAILED.value,
        CheckoutIntentStatus.REFUNDED.value,
    }
)


class CheckoutIntent(Base):
    """Checkout intent: каталожный code + серверный snapshot цены + lifecycle оплаты."""

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
        Index("ix_checkout_intents_provider_payment_id", "provider_payment_id"),
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

    payment_provider = Column(String(64), nullable=True)
    provider_payment_id = Column(String(255), nullable=True)

    paid_at = Column(DateTime, nullable=True)
    fulfilled_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    refunded_at = Column(DateTime, nullable=True)

    fulfilled_subscription_id = Column(
        Integer, ForeignKey("user_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    fulfilled_addon_id = Column(
        Integer, ForeignKey("user_addons.id", ondelete="SET NULL"), nullable=True
    )

    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], backref="checkout_intents")
    payment_attempts = relationship(
        "PaymentAttempt",
        back_populates="checkout_intent",
        cascade="all, delete-orphan",
    )


class PaymentAttempt(Base):
    """Попытка оплаты checkout intent (provider-agnostic)."""

    __tablename__ = "payment_attempts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_payment_id",
            name="uq_payment_attempts_provider_payment",
        ),
        UniqueConstraint(
            "checkout_intent_id",
            "idempotency_key",
            name="uq_payment_attempts_intent_idempotency",
        ),
        Index("ix_payment_attempts_checkout_intent_id", "checkout_intent_id"),
        Index("ix_payment_attempts_user_id", "user_id"),
        Index("ix_payment_attempts_status", "status"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    checkout_intent_id = Column(
        Integer,
        ForeignKey("checkout_intents.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider = Column(String(64), nullable=False)
    # Optional link to encrypted PaymentProviderConnection (Этап 6.10A).
    # SET NULL on connection delete — history keeps provider string snapshot.
    connection_id = Column(
        Integer,
        ForeignKey("payment_provider_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    provider_payment_id = Column(String(255), nullable=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="RUB")
    status = Column(
        String(32), nullable=False, default=PaymentAttemptStatus.CREATED.value
    )
    idempotency_key = Column(String(128), nullable=False)
    confirmation_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    checkout_intent = relationship("CheckoutIntent", back_populates="payment_attempts")
    user = relationship("User", foreign_keys=[user_id])


class PaymentWebhookEvent(Base):
    """Идемпотентная запись provider webhook event."""

    __tablename__ = "payment_webhook_events"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_event_id",
            name="uq_payment_webhook_events_provider_event",
        ),
        Index("ix_payment_webhook_events_process_status", "process_status"),
        Index("ix_payment_webhook_events_checkout_intent_id", "checkout_intent_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(64), nullable=False)
    provider_event_id = Column(String(255), nullable=False)
    event_type = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=True)
    payment_attempt_id = Column(
        Integer, ForeignKey("payment_attempts.id", ondelete="SET NULL"), nullable=True
    )
    checkout_intent_id = Column(
        Integer, ForeignKey("checkout_intents.id", ondelete="SET NULL"), nullable=True
    )
    process_status = Column(
        String(32),
        nullable=False,
        default=PaymentWebhookProcessStatus.RECEIVED.value,
    )
    error_message = Column(Text, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
