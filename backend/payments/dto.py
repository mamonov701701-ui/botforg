"""
Provider-neutral DTO и нормализованные статусы платежей (Этап 6.8).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any


class NormalizedPaymentStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


@dataclass(frozen=True)
class CreatePaymentRequest:
    amount: Decimal
    currency: str
    description: str
    idempotency_key: str
    return_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CreatePaymentResult:
    provider: str
    provider_payment_id: str
    status: NormalizedPaymentStatus
    confirmation_url: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PaymentStatusResult:
    provider: str
    provider_payment_id: str
    status: NormalizedPaymentStatus
    amount: Decimal | None = None
    currency: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedWebhookEvent:
    provider: str
    provider_event_id: str
    event_type: str
    provider_payment_id: str
    status: NormalizedPaymentStatus
    amount: Decimal | None = None
    currency: str | None = None
    occurred_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CancelPaymentResult:
    provider: str
    provider_payment_id: str
    status: NormalizedPaymentStatus
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RefundPaymentResult:
    provider: str
    provider_payment_id: str
    refund_id: str
    status: NormalizedPaymentStatus
    amount: Decimal | None = None
    currency: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderPublicInfo:
    """Публичное описание провайдера без секретов."""

    name: str
    available: bool
    test_mode: bool
    is_fake: bool = False
