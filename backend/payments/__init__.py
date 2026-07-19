"""
Payment provider abstraction (Этап 6.8).

Публичный API пакета — registry + DTO + base.
SDK YooKassa/Robokassa/CloudPayments здесь не импортируются.
"""
from backend.payments.base import PaymentProvider, PaymentProviderError
from backend.payments.dto import (
    CancelPaymentResult,
    CreatePaymentRequest,
    CreatePaymentResult,
    CreateRefundRequest,
    NormalizedPaymentStatus,
    NormalizedRefundStatus,
    ParsedRefundWebhookEvent,
    ParsedWebhookEvent,
    PaymentStatusResult,
    ProviderPublicInfo,
    RefundPaymentResult,
    RefundStatusResult,
)
from backend.payments.registry import (
    clear_provider_cache,
    get_default_payment_provider,
    get_default_provider_name,
    get_payment_provider,
    list_available_provider_names,
    list_provider_public_info,
    mask_secret,
    provider_config_public_view,
)

__all__ = [
    "PaymentProvider",
    "PaymentProviderError",
    "NormalizedPaymentStatus",
    "NormalizedRefundStatus",
    "CreatePaymentRequest",
    "CreatePaymentResult",
    "CreateRefundRequest",
    "PaymentStatusResult",
    "ParsedWebhookEvent",
    "ParsedRefundWebhookEvent",
    "CancelPaymentResult",
    "RefundPaymentResult",
    "RefundStatusResult",
    "ProviderPublicInfo",
    "get_payment_provider",
    "get_default_payment_provider",
    "get_default_provider_name",
    "list_available_provider_names",
    "list_provider_public_info",
    "provider_config_public_view",
    "mask_secret",
    "clear_provider_cache",
]
