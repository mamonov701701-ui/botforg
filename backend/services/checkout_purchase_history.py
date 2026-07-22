"""
User-scoped purchase history: GET /me/checkout-intents list (Этап 8.3.1).

Каноническая сущность — CheckoutIntent. Не зависит от refund eligibility.
Без live HTTP к провайдеру; PaymentAttempt подгружается batch-запросом.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.payments.dto import NormalizedPaymentStatus


_VALID_PRODUCT_TYPES = frozenset(
    {CheckoutProductType.TARIFF.value, CheckoutProductType.ADDON.value}
)
_VALID_INTENT_STATUSES = frozenset(s.value for s in CheckoutIntentStatus)


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def resolve_purchase_status(
    *,
    intent_status: str | None,
    latest_attempt_status: str | None,
) -> str:
    """
    Краткое нормализованное состояние покупки только из локальной БД.

    Совпадает по смыслу с NormalizedPaymentStatus (без provider HTTP).
    """
    intent = (intent_status or "").strip().lower()
    attempt = (latest_attempt_status or "").strip().lower() or None

    if intent == CheckoutIntentStatus.FULFILLED.value:
        return NormalizedPaymentStatus.SUCCEEDED.value
    if intent == CheckoutIntentStatus.PAID.value:
        return NormalizedPaymentStatus.SUCCEEDED.value
    if intent == CheckoutIntentStatus.REFUNDED.value:
        return NormalizedPaymentStatus.REFUNDED.value
    if intent == CheckoutIntentStatus.CANCELLED.value:
        return NormalizedPaymentStatus.CANCELLED.value
    if intent == CheckoutIntentStatus.FAILED.value:
        return NormalizedPaymentStatus.FAILED.value

    if attempt == PaymentAttemptStatus.SUCCEEDED.value:
        return NormalizedPaymentStatus.SUCCEEDED.value
    if attempt in (
        PaymentAttemptStatus.CREATED.value,
        PaymentAttemptStatus.PENDING.value,
    ):
        return NormalizedPaymentStatus.PENDING.value
    if attempt == PaymentAttemptStatus.CANCELLED.value:
        return NormalizedPaymentStatus.CANCELLED.value
    if attempt == PaymentAttemptStatus.FAILED.value:
        return NormalizedPaymentStatus.FAILED.value
    if attempt == PaymentAttemptStatus.REFUNDED.value:
        return NormalizedPaymentStatus.REFUNDED.value

    return NormalizedPaymentStatus.PENDING.value


def _fulfillment_result_type(intent: CheckoutIntent) -> str | None:
    if intent.fulfilled_subscription_id is not None:
        return "subscription"
    if intent.fulfilled_addon_id is not None:
        return "addon"
    return None


def _latest_attempt_status_by_intent(
    db: Session, *, intent_ids: list[int]
) -> dict[int, str | None]:
    """Один batch-запрос: статус последнего PaymentAttempt по каждому intent."""
    if not intent_ids:
        return {}
    latest: dict[int, str | None] = {iid: None for iid in intent_ids}
    attempts = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id.in_(tuple(intent_ids)))
        .order_by(PaymentAttempt.id.desc())
        .all()
    )
    seen: set[int] = set()
    for attempt in attempts:
        iid = int(attempt.checkout_intent_id)
        if iid in seen:
            continue
        seen.add(iid)
        latest[iid] = attempt.status
    return latest


def list_user_checkout_intents(
    db: Session,
    *,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    product_type: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """
    Paginated purchase history for one user.

    Sorted by created_at DESC, id DESC (stable).
    """
    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    q = db.query(CheckoutIntent).filter(CheckoutIntent.user_id == int(user_id))

    if product_type is not None:
        pt = product_type.strip().lower()
        if pt not in _VALID_PRODUCT_TYPES:
            raise ValueError("invalid_product_type")
        q = q.filter(CheckoutIntent.product_type == pt)

    if status is not None:
        st = status.strip().lower()
        if st not in _VALID_INTENT_STATUSES:
            raise ValueError("invalid_status")
        q = q.filter(CheckoutIntent.status == st)

    total = q.count()
    rows = (
        q.order_by(CheckoutIntent.created_at.desc(), CheckoutIntent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    attempt_status = _latest_attempt_status_by_intent(
        db, intent_ids=[int(r.id) for r in rows]
    )

    items: list[dict[str, Any]] = []
    for intent in rows:
        latest = attempt_status.get(int(intent.id))
        items.append(
            {
                "id": intent.id,
                "created_at": intent.created_at,
                "product_type": intent.product_type,
                "product_code": intent.product_code,
                "product_name": intent.product_name,
                "amount": _money(intent.amount),
                "currency": intent.currency or "RUB",
                "intent_status": intent.status,
                "purchase_status": resolve_purchase_status(
                    intent_status=intent.status,
                    latest_attempt_status=latest,
                ),
                "paid_at": intent.paid_at,
                "fulfilled_at": intent.fulfilled_at,
                "cancelled_at": intent.cancelled_at,
                "refunded_at": intent.refunded_at,
                "failed_at": intent.failed_at,
                "payment_provider": intent.payment_provider,
                "latest_attempt_status": latest,
                "fulfilled_subscription_id": intent.fulfilled_subscription_id,
                "fulfilled_addon_id": intent.fulfilled_addon_id,
                "fulfillment_result_type": _fulfillment_result_type(intent),
            }
        )

    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }
