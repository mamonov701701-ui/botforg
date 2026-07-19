"""
Список покупок пользователя, доступных для заявки на возврат (Этап 6.14.4).

Только fulfilled CheckoutIntent + succeeded PaymentAttempt текущего пользователя.
Без credentials / raw provider payload.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.refund import (
    REFUND_TERMINAL_STATUSES,
    RefundRequest,
    RefundRequestStatus,
)
from backend.services.refund_api_presenters import format_money


# Refund finished for this purchase (cannot submit another request).
_REFUND_DONE_STATUSES = frozenset(
    {
        RefundRequestStatus.COMPLETED.value,
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
    }
)

# Terminal statuses that free the purchase for a new request.
_REFUND_REOPENABLE_STATUSES = frozenset(
    {
        RefundRequestStatus.REJECTED.value,
        RefundRequestStatus.CANCELED.value,
    }
)


def _latest_refund_for_intent(
    db: Session, *, checkout_intent_id: int, user_id: int
) -> RefundRequest | None:
    return (
        db.query(RefundRequest)
        .filter(
            RefundRequest.checkout_intent_id == int(checkout_intent_id),
            RefundRequest.user_id == int(user_id),
        )
        .order_by(RefundRequest.id.desc())
        .first()
    )


def _resolve_succeeded_attempt(
    db: Session, *, intent_id: int
) -> PaymentAttempt | None:
    return (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == int(intent_id),
            PaymentAttempt.status == PaymentAttemptStatus.SUCCEEDED.value,
        )
        .order_by(PaymentAttempt.id.desc())
        .first()
    )


def _availability(
    *,
    intent: CheckoutIntent,
    refund: RefundRequest | None,
) -> tuple[bool, str | None, str | None]:
    """
    Returns (can_request_refund, unavailable_reason, current_refund_status).
    """
    current_status = refund.status if refund is not None else None

    if intent.status == CheckoutIntentStatus.REFUNDED.value:
        return False, "purchase_refunded", current_status

    if refund is not None:
        st = refund.status or ""
        if st in _REFUND_DONE_STATUSES:
            return False, "refund_completed", st
        if st in _REFUND_REOPENABLE_STATUSES:
            return True, None, st
        if st not in REFUND_TERMINAL_STATUSES:
            # Active / open request (including approved until later stages).
            return False, "active_refund_request", st
        return True, None, st

    return True, None, None


def list_refundable_purchases(
    db: Session,
    *,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    base = (
        db.query(CheckoutIntent)
        .filter(
            CheckoutIntent.user_id == int(user_id),
            CheckoutIntent.status == CheckoutIntentStatus.FULFILLED.value,
        )
        .order_by(CheckoutIntent.id.desc())
    )

    # Filter to intents that have at least one succeeded attempt.
    intent_ids_with_success = {
        int(row[0])
        for row in (
            db.query(PaymentAttempt.checkout_intent_id)
            .join(
                CheckoutIntent,
                CheckoutIntent.id == PaymentAttempt.checkout_intent_id,
            )
            .filter(
                CheckoutIntent.user_id == int(user_id),
                CheckoutIntent.status == CheckoutIntentStatus.FULFILLED.value,
                PaymentAttempt.status == PaymentAttemptStatus.SUCCEEDED.value,
            )
            .distinct()
            .all()
        )
    }

    if not intent_ids_with_success:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}

    q = base.filter(CheckoutIntent.id.in_(tuple(intent_ids_with_success)))
    total = q.count()
    intents = q.offset(offset).limit(limit).all()

    items: list[dict[str, Any]] = []
    for intent in intents:
        attempt = _resolve_succeeded_attempt(db, intent_id=intent.id)
        if attempt is None:
            continue
        refund = _latest_refund_for_intent(
            db, checkout_intent_id=intent.id, user_id=user_id
        )
        can_request, reason, refund_status = _availability(intent=intent, refund=refund)
        paid_at = intent.paid_at or attempt.updated_at or attempt.created_at
        items.append(
            {
                "checkout_intent_id": intent.id,
                "payment_attempt_id": attempt.id,
                "product_type": intent.product_type,
                "product_code": intent.product_code,
                "product_name": intent.product_name,
                "amount": format_money(intent.amount),
                "currency": intent.currency or "RUB",
                "paid_at": paid_at,
                "current_refund_status": refund_status,
                "current_refund_request_id": refund.id if refund else None,
                "can_request_refund": can_request,
                "unavailable_reason": reason,
            }
        )

    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }
