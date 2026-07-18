"""
Старт/отмена оплаты CheckoutIntent (Этап 6.10B / 6.11.2A–C).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
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
    get_connection,
    resolve_default_connection,
)
from backend.settings import settings

# provider code → (http_status, public_code, safe Russian message). No raw/provider text.
_SAFE_PROVIDER_ERROR_MAP: dict[str, tuple[int, str, str]] = {
    "provider_timeout": (
        504,
        "provider_timeout",
        "Платёжная система не ответила вовремя. Попробуйте позже.",
    ),
    "provider_network_error": (
        502,
        "provider_unavailable",
        "Не удалось связаться с платёжной системой. Попробуйте позже.",
    ),
    "provider_http_error": (
        502,
        "provider_error",
        "Платёжная система временно недоступна. Попробуйте позже.",
    ),
    "invalid_credentials": (
        409,
        "provider_misconfigured",
        "Платёжная система настроена неверно. Обратитесь к администратору платформы.",
    ),
    "missing_credentials": (
        409,
        "provider_misconfigured",
        "Платёжная система настроена неверно. Обратитесь к администратору платформы.",
    ),
    "invalid_api_base": (
        503,
        "provider_misconfigured",
        "Платёжная система настроена неверно. Обратитесь к администратору платформы.",
    ),
    "invalid_provider_response": (
        502,
        "provider_error",
        "Платёжная система вернула некорректный ответ. Попробуйте позже.",
    ),
    "return_url_required": (
        422,
        "return_url_required",
        "Не указан адрес возврата после оплаты.",
    ),
    "payment_not_found": (
        409,
        "payment_not_found",
        "Платёж не найден в платёжной системе.",
    ),
}

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


@dataclass
class CheckoutCancelResult:
    intent: CheckoutIntent
    attempt: PaymentAttempt | None
    already_cancelled: bool = False
    message: str = "Оплата отменена"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def map_payment_provider_error(exc: PaymentProviderError) -> CheckoutPayError:
    """Безопасный маппинг ошибок провайдера — без credentials/raw/внутренних текстов."""
    mapped = _SAFE_PROVIDER_ERROR_MAP.get((exc.code or "").strip())
    if mapped is not None:
        http_status, code, message = mapped
        return CheckoutPayError(message, code=code, http_status=http_status)
    return CheckoutPayError(
        "Не удалось выполнить операцию оплаты. Попробуйте позже.",
        code="provider_error",
        http_status=502,
    )


def _map_connection_service_error(exc: ConnectionServiceError) -> CheckoutPayError:
    """Не отдаём наружу тексты расшифровки/криптографии."""
    code = (exc.code or "").strip()
    if code in {
        "master_key_missing",
        "credentials_decrypt_failed",
        "credentials_crypto_error",
        "invalid_ciphertext",
    }:
        return CheckoutPayError(
            "Платёжное подключение недоступно. Обратитесь к администратору платформы.",
            code="provider_misconfigured",
            http_status=503 if exc.http_status >= 500 else 409,
        )
    return CheckoutPayError(
        "Платёжное подключение недоступно. Обратитесь к администратору платформы.",
        code="provider_misconfigured",
        http_status=409 if exc.http_status < 500 else min(exc.http_status, 503),
    )


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


def _recover_attempt_after_conflict(
    db: Session,
    *,
    intent_id: int,
    idempotency_key: str,
    provider: str,
    provider_payment_id: str | None,
) -> PaymentAttempt | None:
    """После IntegrityError вернуть уже созданный attempt (без HTTP 500)."""
    recovered = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent_id,
            PaymentAttempt.idempotency_key == idempotency_key,
        )
        .first()
    )
    if recovered is not None:
        return recovered
    if not provider_payment_id:
        return None
    return (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.provider == provider,
            PaymentAttempt.provider_payment_id == str(provider_payment_id),
        )
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

    # Same idempotency key with provider payment → safe replay (no second charge).
    existing_same_key = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent.id,
            PaymentAttempt.idempotency_key == key,
        )
        .first()
    )
    if existing_same_key is not None and existing_same_key.provider_payment_id:
        return _result_from_attempt(intent, existing_same_key, already_started=True)

    # One active (or succeeded) attempt per intent — different key must not create another.
    # Incomplete same-key row (no provider_payment_id) may recover via provider idempotency.
    blocking = _find_blocking_attempt(db, intent.id)
    if blocking is not None:
        incomplete_same_key = (
            existing_same_key is not None
            and blocking.id == existing_same_key.id
            and not existing_same_key.provider_payment_id
        )
        if not incomplete_same_key:
            return _result_from_attempt(intent, blocking, already_started=True)

    # Retry policy (existing): only after terminal failed/cancelled attempts (or none).
    # Orphan recovery: same key reuses provider Idempotence-Key contract.

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
        raise _map_connection_service_error(exc) from exc
    except PaymentProviderRegistryError as exc:
        raise CheckoutPayError(
            "Платёжная система временно недоступна. Попробуйте позже.",
            code="provider_unavailable",
            http_status=503,
        ) from exc
    except PaymentProviderError as exc:
        raise map_payment_provider_error(exc) from exc
    finally:
        for k in list(creds.keys()):
            creds[k] = ""
        creds.clear()

    preexisting_attempt_ids = {
        row_id
        for (row_id,) in db.query(PaymentAttempt.id)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .all()
    }

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
        if exc.code == "attempt_conflict":
            recovered = _recover_attempt_after_conflict(
                db,
                intent_id=intent.id,
                idempotency_key=key,
                provider=conn.provider_code,
                provider_payment_id=created.provider_payment_id,
            )
            if recovered is not None:
                intent = (
                    db.query(CheckoutIntent)
                    .filter(CheckoutIntent.id == intent_id)
                    .first()
                    or intent
                )
                return _result_from_attempt(intent, recovered, already_started=True)
        raise CheckoutPayError(exc.message, code=exc.code, http_status=409) from exc

    # create_payment_attempt may have rolled back on IntegrityError — re-bind intent.
    intent = (
        db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).first()
        or intent
    )

    # Attach provider fields when missing. Never replace an existing provider_payment_id
    # (concurrent IntegrityError recovery / already-started winner).
    already = attempt.id in preexisting_attempt_ids or (
        bool(attempt.provider_payment_id)
        and bool(created.provider_payment_id)
        and attempt.provider_payment_id != created.provider_payment_id
    )
    if attempt.connection_id is None:
        attempt.connection_id = conn.id
    if not attempt.provider_payment_id:
        if created.provider_payment_id:
            attempt.provider_payment_id = created.provider_payment_id
        if created.confirmation_url:
            attempt.confirmation_url = created.confirmation_url
        if created.status == NormalizedPaymentStatus.SUCCEEDED:
            attempt.status = PaymentAttemptStatus.SUCCEEDED.value
    elif not attempt.confirmation_url and created.confirmation_url:
        if created.provider_payment_id in (None, attempt.provider_payment_id):
            attempt.confirmation_url = created.confirmation_url
    if intent.status in (
        CheckoutIntentStatus.PENDING.value,
        CheckoutIntentStatus.AWAITING_PAYMENT.value,
    ):
        intent.status = CheckoutIntentStatus.AWAITING_PAYMENT.value
        intent.payment_provider = conn.provider_code
        if not intent.provider_payment_id:
            intent.provider_payment_id = (
                attempt.provider_payment_id or created.provider_payment_id
            )
    db.add(attempt)
    try:
        db.commit()
        db.refresh(attempt)
        db.refresh(intent)
    except IntegrityError:
        db.rollback()
        recovered = _recover_attempt_after_conflict(
            db,
            intent_id=intent.id,
            idempotency_key=key,
            provider=conn.provider_code,
            provider_payment_id=created.provider_payment_id,
        )
        if recovered is None:
            raise CheckoutPayError(
                "Payment attempt conflict",
                code="attempt_conflict",
                http_status=409,
            ) from None
        intent = (
            db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).first()
            or intent
        )
        return _result_from_attempt(intent, recovered, already_started=True)

    return _result_from_attempt(intent, attempt, already_started=already)


def cancel_checkout_payment(
    db: Session,
    *,
    user_id: int,
    intent_id: int,
) -> CheckoutCancelResult:
    """
    Отмена неоплаченного checkout владельцем.

    Только pending / awaiting_payment. При pending attempt с provider_payment_id
    вызывается provider.cancel_payment; при timeout/неизвестном результате
    локальный статус не помечается cancelled.
    """
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == intent_id, CheckoutIntent.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not intent:
        raise CheckoutPayError(
            "Checkout intent not found", code="intent_not_found", http_status=404
        )

    if intent.status == CheckoutIntentStatus.CANCELLED.value:
        attempt = (
            db.query(PaymentAttempt)
            .filter(PaymentAttempt.checkout_intent_id == intent.id)
            .order_by(PaymentAttempt.id.desc())
            .first()
        )
        return CheckoutCancelResult(
            intent=intent,
            attempt=attempt,
            already_cancelled=True,
            message="Оплата уже отменена",
        )

    if intent.status in (
        CheckoutIntentStatus.PAID.value,
        CheckoutIntentStatus.FULFILLED.value,
    ):
        raise CheckoutPayError(
            "Оплаченный заказ нельзя отменить",
            code="intent_already_paid",
            http_status=409,
        )
    if intent.status == CheckoutIntentStatus.REFUNDED.value:
        raise CheckoutPayError(
            "Заказ уже возвращён",
            code="intent_not_cancellable",
            http_status=409,
        )
    if intent.status == CheckoutIntentStatus.FAILED.value:
        raise CheckoutPayError(
            "Неудачный заказ нельзя отменить",
            code="intent_not_cancellable",
            http_status=409,
        )
    if intent.status not in (
        CheckoutIntentStatus.PENDING.value,
        CheckoutIntentStatus.AWAITING_PAYMENT.value,
    ):
        raise CheckoutPayError(
            "Заказ нельзя отменить в текущем статусе",
            code="intent_not_cancellable",
            http_status=409,
        )

    attempt = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent.id,
            PaymentAttempt.status.in_(tuple(ATTEMPT_OPEN_STATUSES)),
        )
        .order_by(PaymentAttempt.id.desc())
        .first()
    )

    if attempt is not None and attempt.provider_payment_id:
        creds: dict[str, str] = {}
        try:
            if attempt.connection_id:
                conn = get_connection(db, attempt.connection_id)
                creds = decrypt_connection_credentials_for_internal_use(conn)
                provider = get_payment_provider(attempt.provider, credentials=creds)
            else:
                provider = get_payment_provider(attempt.provider)
            cancel_result = provider.cancel_payment(attempt.provider_payment_id)
        except ConnectionServiceError as exc:
            raise _map_connection_service_error(exc) from exc
        except PaymentProviderRegistryError as exc:
            raise CheckoutPayError(
                "Платёжная система временно недоступна. Попробуйте позже.",
                code="provider_unavailable",
                http_status=503,
            ) from exc
        except PaymentProviderError as exc:
            # Timeout / network / HTTP — do not mark local cancel as success.
            raise map_payment_provider_error(exc) from exc
        finally:
            for k in list(creds.keys()):
                creds[k] = ""
            creds.clear()

        if cancel_result.status != NormalizedPaymentStatus.CANCELLED:
            raise CheckoutPayError(
                "Не удалось подтвердить отмену платежа. Статус не изменён.",
                code="cancel_not_confirmed",
                http_status=409,
            )

    at = _utcnow()
    if attempt is not None:
        attempt.status = PaymentAttemptStatus.CANCELLED.value
        attempt.updated_at = at
        db.add(attempt)

    intent.status = CheckoutIntentStatus.CANCELLED.value
    intent.cancelled_at = at
    intent.updated_at = at
    db.add(intent)
    db.commit()
    db.refresh(intent)
    if attempt is not None:
        db.refresh(attempt)

    return CheckoutCancelResult(
        intent=intent,
        attempt=attempt,
        already_cancelled=False,
        message="Оплата отменена",
    )


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
            "message": "Оплата отменена. Для повторной оплаты создайте новый заказ.",
        }
    if intent_status == CheckoutIntentStatus.FAILED.value:
        return {
            "normalized_status": NormalizedPaymentStatus.FAILED.value,
            "is_final": True,
            "can_retry": False,
            "message": "Оплата не удалась. Создайте новый заказ или обратитесь в поддержку.",
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
            "message": "Не удалось завершить оплату через платёжную систему. Можно начать оплату заново.",
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
