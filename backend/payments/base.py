"""
Общий интерфейс PaymentProvider (Этап 6.8 + refund contract 6.14.5).

Реализации провайдеров живут в backend/payments/providers/*.
Общие tariff/checkout/fulfillment services НЕ импортируют SDK эквайринга.
Refund orchestration (ledger / webhook / entitlement) — этапы 6.14.6+.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.payments.dto import (
    CancelPaymentResult,
    CreatePaymentRequest,
    CreatePaymentResult,
    CreateRefundRequest,
    ParsedWebhookEvent,
    PaymentStatusResult,
    RefundPaymentResult,
    RefundStatusResult,
)


class PaymentProviderError(Exception):
    def __init__(self, message: str, *, code: str = "payment_provider_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class PaymentProvider(ABC):
    """Контракт платёжного провайдера."""

    name: str
    is_fake: bool = False

    @abstractmethod
    def create_payment(self, request: CreatePaymentRequest) -> CreatePaymentResult:
        raise NotImplementedError

    @abstractmethod
    def get_payment_status(self, provider_payment_id: str) -> PaymentStatusResult:
        raise NotImplementedError

    @abstractmethod
    def verify_and_parse_webhook(
        self,
        *,
        headers: dict[str, str],
        body: bytes,
        payload: dict[str, Any] | None = None,
    ) -> ParsedWebhookEvent:
        """Проверить подпись/аутентичность и вернуть нормализованное событие."""
        raise NotImplementedError

    @abstractmethod
    def cancel_payment(self, provider_payment_id: str) -> CancelPaymentResult:
        raise NotImplementedError

    @abstractmethod
    def refund_payment(self, request: CreateRefundRequest) -> RefundPaymentResult:
        """
        Create a refund at the provider.

        Idempotency is entirely caller-owned via ``request.idempotency_key``.
        Timeouts / network ambiguity raise ``PaymentProviderError`` — adapters
        must not retry POST internally.
        """
        raise NotImplementedError

    @abstractmethod
    def get_refund_status(self, refund_id: str) -> RefundStatusResult:
        """Fetch current refund object by provider refund id."""
        raise NotImplementedError
