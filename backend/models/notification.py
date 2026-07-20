"""
Универсальный notification outbox (Этап 6.14.10Б).

Не дублирует refund_audit_events — только очередь доставки.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.types import JSON

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class NotificationOutboxStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    RETRY = "retry"
    FAILED_PERMANENT = "failed_permanent"
    CANCELED = "canceled"


class NotificationChannel(str, Enum):
    EMAIL = "email"
    # reserved: IN_APP = "in_app", TELEGRAM = "telegram"


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_notification_outbox_idempotency"),
        Index("ix_notification_outbox_status_available", "status", "available_at"),
        Index("ix_notification_outbox_status_locked", "status", "locked_at"),
        Index("ix_notification_outbox_aggregate", "aggregate_type", "aggregate_id"),
        Index("ix_notification_outbox_recipient_user", "recipient_user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    notification_type = Column(String(64), nullable=False)
    channel = Column(String(32), nullable=False, default=NotificationChannel.EMAIL.value)
    recipient_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    recipient_email = Column(String(320), nullable=False)
    aggregate_type = Column(String(64), nullable=False)
    aggregate_id = Column(String(64), nullable=False)
    event_type = Column(String(64), nullable=False)
    idempotency_key = Column(String(255), nullable=False)
    payload_json = Column(JSON, nullable=False)
    status = Column(
        String(32),
        nullable=False,
        default=NotificationOutboxStatus.PENDING.value,
    )
    attempts = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime, nullable=False, default=_utcnow)
    locked_at = Column(DateTime, nullable=True)
    locked_by = Column(String(128), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    last_error_code = Column(String(64), nullable=True)
    last_error_message = Column(String(1000), nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
