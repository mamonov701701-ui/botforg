"""
Provider-agnostic payment fulfillment (Этап 6.7).

fulfill_paid_intent — одна транзакция: webhook event + attempt + entitlement + intent.
Без HTTP провайдера и без публичных /pay endpoints.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CHECKOUT_TERMINAL_BLOCKING,
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage, UserAddonSource
from backend.services.tariff_entitlements import (
    EntitlementError,
    activate_subscription,
    create_user_addon,
)


class FulfillmentError(Exception):
    def __init__(self, message: str, *, code: str = "fulfillment_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class FulfillmentResult:
    intent: CheckoutIntent
    attempt: PaymentAttempt | None
    event: PaymentWebhookEvent
    already_fulfilled: bool = False
    ignored: bool = False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _money_equal(a: Decimal | Any, b: Decimal | Any) -> bool:
    return Decimal(str(a)).quantize(Decimal("0.01")) == Decimal(str(b)).quantize(
        Decimal("0.01")
    )


def _currency_equal(a: str | None, b: str | None) -> bool:
    return (a or "RUB").strip().upper() == (b or "RUB").strip().upper()


def create_payment_attempt(
    db: Session,
    *,
    checkout_intent_id: int,
    user_id: int,
    provider: str,
    idempotency_key: str,
    provider_payment_id: str | None = None,
    confirmation_url: str | None = None,
    commit: bool = True,
) -> PaymentAttempt:
    """
    Создать PaymentAttempt и перевести intent в awaiting_payment.
    Для тестов и будущего /pay adapter.
    """
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == checkout_intent_id)
        .first()
    )
    if not intent:
        raise FulfillmentError("Checkout intent not found", code="intent_not_found")
    if intent.user_id != user_id:
        raise FulfillmentError("Checkout intent ownership mismatch", code="intent_forbidden")
    if intent.status in CHECKOUT_TERMINAL_BLOCKING:
        raise FulfillmentError(
            f"Checkout intent status={intent.status} cannot accept payment",
            code="intent_not_payable",
        )
    if intent.status == CheckoutIntentStatus.FULFILLED.value:
        raise FulfillmentError(
            "Checkout intent already fulfilled",
            code="intent_already_fulfilled",
        )

    key = (idempotency_key or "").strip()
    if not key:
        raise FulfillmentError("idempotency_key required", code="idempotency_required")

    existing = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == checkout_intent_id,
            PaymentAttempt.idempotency_key == key,
        )
        .first()
    )
    if existing:
        return existing

    now = _utcnow()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider=provider,
        provider_payment_id=provider_payment_id,
        amount=intent.amount,
        currency=intent.currency,
        status=PaymentAttemptStatus.PENDING.value,
        idempotency_key=key,
        confirmation_url=confirmation_url,
    )
    db.add(attempt)

    if intent.status in (
        CheckoutIntentStatus.PENDING.value,
        CheckoutIntentStatus.AWAITING_PAYMENT.value,
    ):
        intent.status = CheckoutIntentStatus.AWAITING_PAYMENT.value
        intent.payment_provider = provider
        if provider_payment_id:
            intent.provider_payment_id = provider_payment_id
        intent.updated_at = now

    if commit:
        db.commit()
        db.refresh(attempt)
        db.refresh(intent)
    else:
        db.flush()
    return attempt


def fulfill_paid_intent(
    db: Session,
    *,
    checkout_intent_id: int,
    user_id: int,
    provider: str,
    provider_payment_id: str,
    provider_event_id: str,
    event_type: str,
    amount: Decimal | str | int | float,
    currency: str,
    payload: dict[str, Any] | None = None,
    payment_attempt_id: int | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    now: datetime | None = None,
) -> FulfillmentResult:
    """
    Идемпотентно выполнить paid→fulfilled для checkout intent.

    Одна транзакция: webhook event, attempt, entitlement, intent.
    """
    at = _normalize_dt(now or _utcnow())
    provider_event_id = (provider_event_id or "").strip()
    provider_payment_id = (provider_payment_id or "").strip()
    if not provider_event_id:
        raise FulfillmentError("provider_event_id required", code="event_id_required")
    if not provider_payment_id:
        raise FulfillmentError(
            "provider_payment_id required", code="payment_id_required"
        )

    # --- idempotent webhook replay ---
    existing_event = (
        db.query(PaymentWebhookEvent)
        .filter(
            PaymentWebhookEvent.provider == provider,
            PaymentWebhookEvent.provider_event_id == provider_event_id,
        )
        .first()
    )
    if existing_event and existing_event.process_status in (
        PaymentWebhookProcessStatus.PROCESSED.value,
        PaymentWebhookProcessStatus.IGNORED.value,
    ):
        intent = (
            db.query(CheckoutIntent)
            .filter(CheckoutIntent.id == checkout_intent_id)
            .first()
        )
        attempt = None
        if existing_event.payment_attempt_id:
            attempt = (
                db.query(PaymentAttempt)
                .filter(PaymentAttempt.id == existing_event.payment_attempt_id)
                .first()
            )
        return FulfillmentResult(
            intent=intent,
            attempt=attempt,
            event=existing_event,
            already_fulfilled=bool(
                intent and intent.status == CheckoutIntentStatus.FULFILLED.value
            ),
            ignored=existing_event.process_status
            == PaymentWebhookProcessStatus.IGNORED.value,
        )

    event = existing_event
    if event is None:
        event = PaymentWebhookEvent(
            provider=provider,
            provider_event_id=provider_event_id,
            event_type=event_type,
            payload=payload,
            checkout_intent_id=checkout_intent_id,
            process_status=PaymentWebhookProcessStatus.RECEIVED.value,
        )
        db.add(event)
        db.flush()
    else:
        # retry after error: reuse same event row
        event.event_type = event_type
        event.payload = payload
        event.error_message = None
        event.checkout_intent_id = checkout_intent_id

    # Out-of-order non-success events: ignore if already fulfilled later.
    success_types = {
        "payment.succeeded",
        "succeeded",
        "paid",
        "success",
    }
    is_success = (event_type or "").strip().lower() in success_types

    try:
        intent = (
            db.query(CheckoutIntent)
            .filter(CheckoutIntent.id == checkout_intent_id)
            .first()
        )
        if not intent:
            raise FulfillmentError("Checkout intent not found", code="intent_not_found")
        if intent.user_id != user_id:
            raise FulfillmentError(
                "Checkout intent ownership mismatch", code="intent_forbidden"
            )

        if not is_success:
            # out-of-order pending/failed after fulfill → ignore, do not downgrade
            if intent.status == CheckoutIntentStatus.FULFILLED.value:
                event.process_status = PaymentWebhookProcessStatus.IGNORED.value
                event.processed_at = at
                event.error_message = "out_of_order_after_fulfilled"
                db.commit()
                return FulfillmentResult(
                    intent=intent, attempt=None, event=event, ignored=True
                )
            if (event_type or "").lower() in {"payment.failed", "failed"}:
                if intent.status not in (
                    CheckoutIntentStatus.FULFILLED.value,
                    CheckoutIntentStatus.PAID.value,
                ):
                    intent.status = CheckoutIntentStatus.FAILED.value
                    intent.failed_at = at
                    intent.updated_at = at
                event.process_status = PaymentWebhookProcessStatus.PROCESSED.value
                event.processed_at = at
                db.commit()
                return FulfillmentResult(intent=intent, attempt=None, event=event)
            event.process_status = PaymentWebhookProcessStatus.IGNORED.value
            event.processed_at = at
            event.error_message = f"unsupported_event_type:{event_type}"
            db.commit()
            return FulfillmentResult(
                intent=intent, attempt=None, event=event, ignored=True
            )

        if intent.status in CHECKOUT_TERMINAL_BLOCKING:
            raise FulfillmentError(
                f"Checkout intent status={intent.status} cannot be fulfilled",
                code="intent_not_fulfillable",
            )

        if not _money_equal(intent.amount, amount):
            raise FulfillmentError(
                "Payment amount does not match checkout intent snapshot",
                code="amount_mismatch",
            )
        if not _currency_equal(intent.currency, currency):
            raise FulfillmentError(
                "Payment currency does not match checkout intent snapshot",
                code="currency_mismatch",
            )

        # Already fulfilled → no second entitlement
        if intent.status == CheckoutIntentStatus.FULFILLED.value:
            event.process_status = PaymentWebhookProcessStatus.PROCESSED.value
            event.processed_at = at
            event.checkout_intent_id = intent.id
            db.commit()
            attempt = (
                db.query(PaymentAttempt)
                .filter(PaymentAttempt.checkout_intent_id == intent.id)
                .order_by(PaymentAttempt.id.desc())
                .first()
            )
            return FulfillmentResult(
                intent=intent,
                attempt=attempt,
                event=event,
                already_fulfilled=True,
            )

        attempt: PaymentAttempt | None = None
        if payment_attempt_id is not None:
            attempt = (
                db.query(PaymentAttempt)
                .filter(
                    PaymentAttempt.id == payment_attempt_id,
                    PaymentAttempt.checkout_intent_id == intent.id,
                )
                .first()
            )
        if attempt is None and provider_payment_id:
            attempt = (
                db.query(PaymentAttempt)
                .filter(
                    PaymentAttempt.provider == provider,
                    PaymentAttempt.provider_payment_id == provider_payment_id,
                )
                .first()
            )
        if attempt is None:
            attempt = (
                db.query(PaymentAttempt)
                .filter(PaymentAttempt.checkout_intent_id == intent.id)
                .order_by(PaymentAttempt.id.desc())
                .first()
            )
        if attempt is None:
            attempt = PaymentAttempt(
                checkout_intent_id=intent.id,
                user_id=intent.user_id,
                provider=provider,
                provider_payment_id=provider_payment_id,
                amount=intent.amount,
                currency=intent.currency,
                status=PaymentAttemptStatus.PENDING.value,
                idempotency_key=f"auto:{provider_payment_id}",
            )
            db.add(attempt)
            db.flush()
        else:
            if attempt.provider_payment_id is None:
                attempt.provider_payment_id = provider_payment_id
            attempt.provider = provider

        attempt.status = PaymentAttemptStatus.SUCCEEDED.value
        attempt.updated_at = at
        event.payment_attempt_id = attempt.id
        event.checkout_intent_id = intent.id

        intent.status = CheckoutIntentStatus.PAID.value
        intent.paid_at = intent.paid_at or at
        intent.payment_provider = provider
        intent.provider_payment_id = provider_payment_id
        intent.updated_at = at

        p_start = _normalize_dt(period_start or at)
        p_end = _normalize_dt(period_end or (p_start + timedelta(days=30)))
        provider_ref = f"{provider}:{provider_payment_id}"

        if intent.product_type == CheckoutProductType.TARIFF.value:
            plan = db.query(Plan).filter(Plan.code == intent.product_code).first()
            if not plan:
                raise FulfillmentError(
                    f"Plan code={intent.product_code!r} not found",
                    code="plan_not_found",
                )
            sub = activate_subscription(
                db,
                user_id=intent.user_id,
                plan_id=plan.id,
                period_start=p_start,
                period_end=p_end,
                payment_provider=provider,
                provider_subscription_id=provider_ref,
                replace_active=True,
                commit=False,
            )
            intent.fulfilled_subscription_id = sub.id
            intent.fulfilled_addon_id = None
        elif intent.product_type == CheckoutProductType.ADDON.value:
            pkg = (
                db.query(AddonPackage)
                .filter(AddonPackage.code == intent.product_code)
                .first()
            )
            if not pkg:
                raise FulfillmentError(
                    f"Addon code={intent.product_code!r} not found",
                    code="addon_not_found",
                )
            addon = create_user_addon(
                db,
                user_id=intent.user_id,
                addon_package_id=pkg.id,
                period_start=p_start,
                period_end=p_end,
                source=UserAddonSource.PURCHASE,
                provider_ref=provider_ref,
                commit=False,
            )
            intent.fulfilled_addon_id = addon.id
            intent.fulfilled_subscription_id = None
        else:
            raise FulfillmentError(
                f"Unsupported product_type={intent.product_type!r}",
                code="invalid_product_type",
            )

        intent.status = CheckoutIntentStatus.FULFILLED.value
        intent.fulfilled_at = at
        intent.updated_at = at

        event.process_status = PaymentWebhookProcessStatus.PROCESSED.value
        event.processed_at = at
        event.error_message = None

        db.commit()
        db.refresh(intent)
        db.refresh(attempt)
        db.refresh(event)
        return FulfillmentResult(
            intent=intent, attempt=attempt, event=event, already_fulfilled=False
        )

    except (FulfillmentError, EntitlementError) as exc:
        db.rollback()
        # Re-attach / recreate event for error status after rollback
        event_row = (
            db.query(PaymentWebhookEvent)
            .filter(
                PaymentWebhookEvent.provider == provider,
                PaymentWebhookEvent.provider_event_id == provider_event_id,
            )
            .first()
        )
        code = getattr(exc, "code", "fulfillment_error")
        message = getattr(exc, "message", str(exc))
        if event_row is None:
            event_row = PaymentWebhookEvent(
                provider=provider,
                provider_event_id=provider_event_id,
                event_type=event_type,
                payload=payload,
                checkout_intent_id=checkout_intent_id,
                process_status=PaymentWebhookProcessStatus.ERROR.value,
                error_message=f"{code}: {message}",
            )
            db.add(event_row)
        else:
            event_row.process_status = PaymentWebhookProcessStatus.ERROR.value
            event_row.error_message = f"{code}: {message}"
            event_row.payload = payload
            event_row.checkout_intent_id = checkout_intent_id
        db.commit()
        if isinstance(exc, EntitlementError):
            raise FulfillmentError(exc.message, code=exc.code) from exc
        raise
