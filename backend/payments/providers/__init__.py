"""Конкретные реализации PaymentProvider. SDK эквайринга — только здесь."""

from backend.payments.providers.fake import PROVIDER_NAME as FAKE_PROVIDER_NAME
from backend.payments.providers.fake import FakePaymentProvider

__all__ = ["FakePaymentProvider", "FAKE_PROVIDER_NAME"]
