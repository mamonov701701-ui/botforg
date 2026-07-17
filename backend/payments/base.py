"""
Общий интерфейс PaymentProvider (Этап 6.8).

Реализации провайдеров живут в backend/payments/providers/*.
Общие tariff/checkout/fulfillment services НЕ импортируют SDK эквайринга.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.payments.dto import (
    CancelPaymentResult,
    CreatePaymentRequest,
    CreatePaymentResult,
    ParsedWebhookEvent,
    PaymentStatusResult,
    RefundPaymentResult,
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
    def refund_payment(
        self,
        provider_payment_id: str,
        *,
        amount: Any | None = None,
        currency: str | None = None,
    ) -> RefundPaymentResult:
        raise NotImplementedError
