"""
Старт оплаты CheckoutIntent через default PaymentProviderConnection (Этап 6.10B / 6.11.2A).
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

# Активные (non-terminal) попытки: второй /pay не создаёт новый provider payment.
ATTEMPT_OPEN_STATUSES = frozenset(
    {
        PaymentAttemptStatus.CREATED.value,
        PaymentAttemptStatus.PENDING.value,
    }
)

# Успешная попытка тоже блокирует новый charge (пока intent не terminal failed/cancelled).
ATTEMPT_SUCCESS_STATUSES = frozenset(
    {
        PaymentAttemptStatus.SUCCEEDED.value,
    }
)

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


def _result_from_attempt(
    intent: CheckoutIntent, attempt: PaymentAttempt, *, already_started: bool
) -> CheckoutPayResult:
    return CheckoutPayResult(
        intent=intent,
        attempt=attempt,
        confirmation_url=attempt.confirmation_url,
        provider=attempt.provider,
        provider_payment_id=attempt.provider_payment_id,
        already_started=already_started,
    )


def _find_blocking_attempt(db: Session, intent_id: int) -> PaymentAttempt | None:
    """Open или already-succeeded attempt — нельзя создавать новый provider payment."""
    return (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent_id,
            PaymentAttempt.status.in_(
                tuple(ATTEMPT_OPEN_STATUSES | ATTEMPT_SUCCESS_STATUSES)
            ),
        )
        .order_by(PaymentAttempt.id.desc())
        .first()
    )


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
        .with_for_update()
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
    if intent.status == CheckoutIntentStatus.PAID.value:
        raise CheckoutPayError(
            "Intent already paid",
            code="intent_already_paid",
            http_status=409,
        )

    key = (idempotency_key or "").strip()
    if not key:
        raise CheckoutPayError("idempotency_key required", code="idempotency_required", http_status=422)

    # Same idempotency key → always return existing attempt (idempotent replay).
    existing_same_key = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent.id,
            PaymentAttempt.idempotency_key == key,
        )
        .first()
    )
    if existing_same_key is not None:
        if existing_same_key.provider_payment_id:
            return _result_from_attempt(intent, existing_same_key, already_started=True)
        # Incomplete same-key row without provider id — do not open a second charge;
        # treat as already started / conflict rather than creating another payment.
        return _result_from_attempt(intent, existing_same_key, already_started=True)

    # One active (or succeeded) attempt per intent — different key must not create another.
    blocking = _find_blocking_attempt(db, intent.id)
    if blocking is not None:
        return _result_from_attempt(intent, blocking, already_started=True)

    # Retry policy (existing): only after terminal failed/cancelled attempts (or none).
    # No new UX — simply allow create when no open/succeeded attempt remains.

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

    return _result_from_attempt(intent, attempt, already_started=False)


def _normalized_payment_view(
    intent: CheckoutIntent, attempt: PaymentAttempt | None
) -> dict[str, Any]:
    """Безопасные поля для polling — без raw provider payload и внутренних ошибок."""
    intent_status = (intent.status or "").strip().lower()
    attempt_status = (attempt.status or "").strip().lower() if attempt else None

    if intent_status == CheckoutIntentStatus.FULFILLED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.SUCCEEDED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата подтверждена",
        }
    if intent_status == CheckoutIntentStatus.PAID.value:
        return {
            "normalized_status": NormalizedPaymentStatus.SUCCEEDED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата получена",
        }
    if intent_status == CheckoutIntentStatus.REFUNDED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.REFUNDED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата возвращена",
        }
    if intent_status == CheckoutIntentStatus.CANCELLED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.CANCELLED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата отменена",
        }
    if intent_status == CheckoutIntentStatus.FAILED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.FAILED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата не удалась",
        }

    if attempt_status == PaymentAttemptStatus.SUCCEEDED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.SUCCEEDED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата подтверждена",
        }
    if attempt_status in ATTEMPT_OPEN_STATUSES:
        return {
            "normalized_status": NormalizedPaymentStatus.PENDING.value,
            "is_final": False,
            "can_retry": False,
            "message": "Ожидаем подтверждение оплаты",
        }
    if attempt_status == PaymentAttemptStatus.CANCELLED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.CANCELLED.value,
            "is_final": True,
            "can_retry": True,
            "message": "Оплата отменена. Можно начать оплату заново.",
        }
    if attempt_status == PaymentAttemptStatus.FAILED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.FAILED.value,
            "is_final": True,
            "can_retry": True,
            "message": "Оплата не завершена. Можно начать оплату заново.",
        }
    if attempt_status == PaymentAttemptStatus.REFUNDED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.REFUNDED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата возвращена",
        }

    # Intent pending, no attempt yet — user may call /pay.
    return {
        "normalized_status": NormalizedPaymentStatus.PENDING.value,
        "is_final": False,
        "can_retry": True,
        "message": "Ожидает оплаты",
    }


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
    view = {
        "intent_id": intent.id,
        "intent_status": intent.status,
        "amount": str(intent.amount),
        "currency": intent.currency,
        "provider": attempt.provider if attempt else intent.payment_provider,
        "provider_payment_id": attempt.provider_payment_id if attempt else intent.provider_payment_id,
        "confirmation_url": attempt.confirmation_url if attempt else None,
        "attempt_status": attempt.status if attempt else None,
    }
    view.update(_normalized_payment_view(intent, attempt))
    return view


def validate_webhook_metadata_against_attempt(
    *,
    metadata: dict[str, Any] | None,
    attempt: PaymentAttempt,
    intent: CheckoutIntent,
) -> str | None:
    """
    Сверка metadata webhook с attempt/intent.
    Возвращает reason при mismatch/missing, иначе None.
    """
    meta = metadata if isinstance(metadata, dict) else {}
    raw_intent = meta.get("checkout_intent_id")
    raw_user = meta.get("user_id")
    if raw_intent is None or str(raw_intent).strip() == "":
        return "metadata_missing_checkout_intent_id"
    if raw_user is None or str(raw_user).strip() == "":
        return "metadata_missing_user_id"
    if str(raw_intent).strip() != str(attempt.checkout_intent_id):
        return "metadata_intent_mismatch"
    if str(raw_intent).strip() != str(intent.id):
        return "metadata_intent_mismatch"
    if str(raw_user).strip() != str(attempt.user_id):
        return "metadata_user_mismatch"
    if str(raw_user).strip() != str(intent.user_id):
        return "metadata_user_mismatch"
    return None
