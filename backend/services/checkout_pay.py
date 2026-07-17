"""
Старт оплаты CheckoutIntent через default PaymentProviderConnection (Этап 6.10B).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CHECKOUT_TERMINAL_BLOCKING,
    CheckoutIntent,
    CheckoutIntentStatus,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.payments.base import PaymentProviderError
from backend.payments.dto import CreatePaymentRequest, NormalizedPaymentStatus
from backend.payments.registry import PaymentProviderRegistryError, get_payment_provider
from backend.services.payment_fulfillment import FulfillmentError, create_payment_attempt
from backend.services.payment_provider_connections import (
    ConnectionServiceError,
    decrypt_connection_credentials_for_internal_use,
    resolve_default_connection,
)
from backend.settings import settings


class CheckoutPayError(Exception):
    def __init__(self, message: str, *, code: str = "checkout_pay_error", http_status: int = 400):
        self.message = message
        self.code = code
        self.http_status = http_status
        super().__init__(message)


@dataclass
class CheckoutPayResult:
    intent: CheckoutIntent
    attempt: PaymentAttempt
    confirmation_url: str | None
    provider: str
    provider_payment_id: str | None
    already_started: bool = False


def _default_return_url() -> str:
    return (
        (getattr(settings, "YOOKASSA_REDIRECT_URL", None) or "")
        or (getattr(settings, "FRONTEND_URL", None) or "")
        or "http://localhost:5173/dashboard/billing"
    ).strip()


def start_checkout_payment(
    db: Session,
    *,
    user_id: int,
    intent_id: int,
    idempotency_key: str,
    return_url: str | None = None,
) -> CheckoutPayResult:
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == intent_id, CheckoutIntent.user_id == user_id)
        .first()
    )
    if not intent:
        raise CheckoutPayError("Checkout intent not found", code="intent_not_found", http_status=404)
    if intent.user_id != user_id:
        raise CheckoutPayError("Forbidden", code="intent_forbidden", http_status=403)
    if intent.status in CHECKOUT_TERMINAL_BLOCKING:
        raise CheckoutPayError(
            "Intent cannot accept payment",
            code="intent_not_payable",
            http_status=409,
        )
    if intent.status == CheckoutIntentStatus.FULFILLED.value:
        raise CheckoutPayError(
            "Intent already fulfilled",
            code="intent_already_fulfilled",
            http_status=409,
        )

    key = (idempotency_key or "").strip()
    if not key:
        raise CheckoutPayError("idempotency_key required", code="idempotency_required", http_status=422)

    existing = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent.id,
            PaymentAttempt.idempotency_key == key,
        )
        .first()
    )
    if existing and existing.provider_payment_id and existing.confirmation_url:
        return CheckoutPayResult(
            intent=intent,
            attempt=existing,
            confirmation_url=existing.confirmation_url,
            provider=existing.provider,
            provider_payment_id=existing.provider_payment_id,
            already_started=True,
        )

    conn = resolve_default_connection(db)
    if conn is None:
        raise CheckoutPayError(
            "Нет основной проверенной платёжной системы",
            code="no_default_connection",
            http_status=409,
        )
    if not conn.enabled or not conn.verified or not conn.has_credentials():
        raise CheckoutPayError(
            "Основная платёжная система недоступна",
            code="default_connection_not_ready",
            http_status=409,
        )

    creds: dict[str, str] = {}
    try:
        creds = decrypt_connection_credentials_for_internal_use(conn)
        provider = get_payment_provider(conn.provider_code, credentials=creds)
        amount = Decimal(str(intent.amount))
        currency = (intent.currency or "RUB").upper()
        create_req = CreatePaymentRequest(
            amount=amount,
            currency=currency,
            description=f"BotForg checkout #{intent.id}",
            idempotency_key=key,
            return_url=(return_url or _default_return_url()),
            metadata={
                "checkout_intent_id": str(intent.id),
                "user_id": str(user_id),
            },
        )
        created = provider.create_payment(create_req)
    except ConnectionServiceError as exc:
        raise CheckoutPayError(str(exc), code=exc.code, http_status=exc.http_status) from exc
    except PaymentProviderRegistryError as exc:
        raise CheckoutPayError(exc.message, code=exc.code, http_status=503) from exc
    except PaymentProviderError as exc:
        raise CheckoutPayError(exc.message, code=exc.code, http_status=502) from exc
    finally:
        for k in list(creds.keys()):
            creds[k] = ""
        creds.clear()

    try:
        attempt = create_payment_attempt(
            db,
            checkout_intent_id=intent.id,
            user_id=user_id,
            idempotency_key=key,
            provider=conn.provider_code,
            provider_payment_id=created.provider_payment_id,
            confirmation_url=created.confirmation_url,
            connection_id=conn.id,
            commit=True,
        )
    except FulfillmentError as exc:
        raise CheckoutPayError(exc.message, code=exc.code, http_status=409) from exc

    # Ensure connection_id + confirmation persisted even if attempt existed
    if attempt.connection_id is None:
        attempt.connection_id = conn.id
    if created.confirmation_url:
        attempt.confirmation_url = created.confirmation_url
    if created.provider_payment_id:
        attempt.provider_payment_id = created.provider_payment_id
    if created.status == NormalizedPaymentStatus.SUCCEEDED:
        attempt.status = PaymentAttemptStatus.SUCCEEDED.value
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    db.refresh(intent)

    return CheckoutPayResult(
        intent=intent,
        attempt=attempt,
        confirmation_url=attempt.confirmation_url,
        provider=attempt.provider,
        provider_payment_id=attempt.provider_payment_id,
        already_started=False,
    )


def get_checkout_payment_view(
    db: Session,
    *,
    user_id: int,
    intent_id: int,
) -> dict[str, Any]:
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == intent_id, CheckoutIntent.user_id == user_id)
        .first()
    )
    if not intent:
        raise CheckoutPayError("Checkout intent not found", code="intent_not_found", http_status=404)
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .order_by(PaymentAttempt.id.desc())
        .first()
    )
    return {
        "intent_id": intent.id,
        "intent_status": intent.status,
        "amount": str(intent.amount),
        "currency": intent.currency,
        "provider": attempt.provider if attempt else intent.payment_provider,
        "provider_payment_id": attempt.provider_payment_id if attempt else intent.provider_payment_id,
        "confirmation_url": attempt.confirmation_url if attempt else None,
        "attempt_status": attempt.status if attempt else None,
    }
