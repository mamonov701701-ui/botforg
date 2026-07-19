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


class NormalizedRefundStatus(str, Enum):
    """
    Provider-neutral refund object status (Этап 6.14.5).

    Matches YooKassa refund statuses. Local BotForg states like
    ``provider_unknown`` are orchestration concerns (6.14.6+), not adapter DTO.
    """

    PENDING = "pending"
    SUCCEEDED = "succeeded"
    CANCELED = "canceled"


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
class ParsedRefundWebhookEvent:
    """
    Normalized provider refund notification (Этап 6.14.7).

    ``raw`` must contain only a sanitized safe subset — never full provider body
    or credentials. Local orchestration states (e.g. provider_unknown) are not
    represented here.
    """

    provider: str
    provider_event_id: str
    event_type: str
    provider_refund_id: str
    provider_payment_id: str
    status: NormalizedRefundStatus
    amount: Decimal | None = None
    currency: str | None = None
    occurred_at: datetime | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CancelPaymentResult:
    provider: str
    provider_payment_id: str
    status: NormalizedPaymentStatus
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CreateRefundRequest:
    """
    Create a provider refund. Caller MUST supply a stable idempotency_key
    (ledger/request scoped). Adapters must not invent keys from amount.
    """

    provider_payment_id: str
    amount: Decimal
    currency: str
    idempotency_key: str
    description: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RefundPaymentResult:
    provider: str
    provider_payment_id: str
    refund_id: str
    status: NormalizedRefundStatus
    amount: Decimal | None = None
    currency: str | None = None
    created_at: datetime | None = None
    cancellation_details: dict[str, str] | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RefundStatusResult:
    provider: str
    refund_id: str
    provider_payment_id: str
    status: NormalizedRefundStatus
    amount: Decimal | None = None
    currency: str | None = None
    created_at: datetime | None = None
    cancellation_details: dict[str, str] | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderPublicInfo:
    """Публичное описание провайдера без секретов."""

    name: str
    available: bool
    test_mode: bool
    is_fake: bool = False
