"""
Webhook ЮKassa + pay endpoints для CheckoutIntent (Этап 6.10B / 6.11.2A).
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.rate_limit import check_rate_limit
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.checkout import CheckoutIntent, PaymentAttempt, PaymentAttemptStatus
from backend.models.user import User
from backend.payments.base import PaymentProviderError
from backend.payments.dto import NormalizedPaymentStatus
from backend.payments.providers.yookassa import is_yookassa_webhook_ip
from backend.payments.registry import get_payment_provider
from backend.services.checkout_pay import (
    CheckoutPayError,
    get_checkout_payment_view,
    start_checkout_payment,
    validate_webhook_metadata_against_attempt,
)
from backend.services.payment_fulfillment import FulfillmentError, fulfill_paid_intent
from backend.services.payment_provider_connections import (
    decrypt_connection_credentials_for_internal_use,
    get_connection,
)
from backend.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["checkout-pay"])

_ATTEMPT_NO_DOWNGRADE = frozenset(
    {
        PaymentAttemptStatus.SUCCEEDED.value,
        PaymentAttemptStatus.REFUNDED.value,
    }
)


class PayIn(BaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=128)
    return_url: str | None = Field(default=None, max_length=2048)


class PayOut(BaseModel):
    intent_id: int
    attempt_id: int
    provider: str
    provider_payment_id: str | None
    confirmation_url: str | None
    already_started: bool = False


class PaymentStatusOut(BaseModel):
    intent_id: int
    intent_status: str
    amount: str
    currency: str
    provider: str | None = None
    provider_payment_id: str | None = None
    confirmation_url: str | None = None
    attempt_status: str | None = None
    normalized_status: str
    is_final: bool
    can_retry: bool
    message: str


def _client_ip(request: Request) -> str | None:
    if request.client and request.client.host:
        return request.client.host
    return None


def _skip_webhook_ip() -> bool:
    if bool(getattr(settings, "TESTING", False)):
        return True
    return bool(getattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False))


@router.post("/me/checkout-intents/{intent_id}/pay", response_model=PayOut)
async def pay_checkout_intent(
    intent_id: int,
    body: PayIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    check_rate_limit(request, "checkout_pay")
    try:
        result = start_checkout_payment(
            db,
            user_id=user.id,
            intent_id=intent_id,
            idempotency_key=body.idempotency_key,
            return_url=body.return_url,
        )
    except CheckoutPayError as exc:
        raise HTTPException(
            status_code=exc.http_status,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    return PayOut(
        intent_id=result.intent.id,
        attempt_id=result.attempt.id,
        provider=result.provider,
        provider_payment_id=result.provider_payment_id,
        confirmation_url=result.confirmation_url,
        already_started=result.already_started,
    )


@router.get(
    "/me/checkout-intents/{intent_id}/payment",
    response_model=PaymentStatusOut,
)
async def get_checkout_payment(
    intent_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return get_checkout_payment_view(db, user_id=user.id, intent_id=intent_id)
    except CheckoutPayError as exc:
        raise HTTPException(
            status_code=exc.http_status,
            detail={"message": exc.message, "code": exc.code},
        ) from exc


@router.post("/webhooks/payments/yookassa")
async def yookassa_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Без JWT. Подлинность: IP allowlist (официальные сети ЮKassa) +
    сверка объекта платежа через API (без HMAC — его нет в официальном API).
    """
    client_ip = _client_ip(request)
    if not _skip_webhook_ip() and not is_yookassa_webhook_ip(client_ip):
        logger.warning("YooKassa webhook rejected: bad IP")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    obj = payload.get("object") if isinstance(payload.get("object"), dict) else {}
    payment_id = str(obj.get("id") or "")
    if not payment_id:
        return {"ok": True, "ignored": True, "reason": "missing_payment_id"}

    attempt = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.provider == "yookassa",
            PaymentAttempt.provider_payment_id == payment_id,
        )
        .order_by(PaymentAttempt.id.desc())
        .first()
    )
    if not attempt:
        # Unknown payment — acknowledge to stop retries, do not fulfill
        return {"ok": True, "ignored": True, "reason": "unknown_payment"}

    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == attempt.checkout_intent_id)
        .first()
    )
    if not intent:
        return {"ok": True, "ignored": True, "reason": "intent_missing"}

    creds: dict[str, str] = {}
    try:
        if attempt.connection_id:
            conn = get_connection(db, attempt.connection_id)
            creds = decrypt_connection_credentials_for_internal_use(conn)
            provider = get_payment_provider("yookassa", credentials=creds)
        else:
            provider = get_payment_provider("yookassa")
        event = provider.verify_and_parse_webhook(
            headers={k: v for k, v in request.headers.items()},
            body=raw,
            payload=payload,
        )
    except PaymentProviderError as exc:
        logger.warning("YooKassa webhook verify failed code=%s", exc.code)
        if exc.code in ("webhook_amount_mismatch", "webhook_currency_mismatch", "invalid_webhook_ip"):
            raise HTTPException(status_code=400, detail="Invalid notification") from exc
        raise HTTPException(status_code=400, detail="Invalid notification") from exc
    except Exception:
        logger.exception("YooKassa webhook processing error")
        raise HTTPException(status_code=500, detail="Webhook error") from None
    finally:
        for k in list(creds.keys()):
            creds[k] = ""
        creds.clear()

    meta_reason = validate_webhook_metadata_against_attempt(
        metadata=event.metadata,
        attempt=attempt,
        intent=intent,
    )
    if meta_reason:
        logger.warning(
            "YooKassa webhook metadata rejected reason=%s attempt_id=%s",
            meta_reason,
            attempt.id,
        )
        return {"ok": True, "ignored": True, "reason": meta_reason}

    # Amount/currency vs attempt snapshot
    if event.amount is not None and Decimal(str(attempt.amount)) != event.amount:
        return {"ok": True, "ignored": True, "reason": "amount_mismatch"}
    if event.currency and attempt.currency and event.currency.upper() != attempt.currency.upper():
        return {"ok": True, "ignored": True, "reason": "currency_mismatch"}

    event_type = (event.event_type or "").lower()

    # Never downgrade a succeeded (or refunded) attempt / fulfilled intent.
    if attempt.status in _ATTEMPT_NO_DOWNGRADE:
        if event.status != NormalizedPaymentStatus.SUCCEEDED and not event_type.endswith(
            "succeeded"
        ):
            return {"ok": True, "ignored": True, "reason": "no_downgrade_attempt"}
    if intent.status in (
        "fulfilled",
        "paid",
    ) and (
        event.status
        in (
            NormalizedPaymentStatus.PENDING,
            NormalizedPaymentStatus.FAILED,
            NormalizedPaymentStatus.CANCELLED,
        )
        or event_type.endswith("waiting_for_capture")
        or event_type.endswith("canceled")
        or event_type.endswith("failed")
    ):
        return {"ok": True, "ignored": True, "reason": "no_downgrade_intent"}

    if event.status == NormalizedPaymentStatus.PENDING or event_type.endswith(
        "waiting_for_capture"
    ):
        if attempt.status == PaymentAttemptStatus.CREATED.value:
            attempt.status = PaymentAttemptStatus.PENDING.value
            db.add(attempt)
            db.commit()
        return {"ok": True, "ignored": True, "reason": "pending"}

    if event.status in (
        NormalizedPaymentStatus.FAILED,
        NormalizedPaymentStatus.CANCELLED,
    ) or event_type.endswith("canceled"):
        if attempt.status not in _ATTEMPT_NO_DOWNGRADE:
            attempt.status = (
                PaymentAttemptStatus.CANCELLED.value
                if event.status == NormalizedPaymentStatus.CANCELLED
                or event_type.endswith("canceled")
                else PaymentAttemptStatus.FAILED.value
            )
            db.add(attempt)
            db.commit()
        return {"ok": True, "ignored": True, "reason": "non_success"}

    if event.status != NormalizedPaymentStatus.SUCCEEDED and not event_type.endswith("succeeded"):
        return {"ok": True, "ignored": True, "reason": "ignored_event"}

    try:
        fulfill_paid_intent(
            db,
            checkout_intent_id=attempt.checkout_intent_id,
            user_id=attempt.user_id,
            provider="yookassa",
            provider_payment_id=payment_id,
            provider_event_id=event.provider_event_id,
            event_type=event.event_type or "payment.succeeded",
            amount=event.amount if event.amount is not None else attempt.amount,
            currency=event.currency or attempt.currency,
            payload={"event": event.event_type, "id": payment_id},
            payment_attempt_id=attempt.id,
        )
    except FulfillmentError as exc:
        logger.warning("fulfill failed code=%s", exc.code)
        return {"ok": True, "ignored": True, "reason": exc.code}

    return {"ok": True}
