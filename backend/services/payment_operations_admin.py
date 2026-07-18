"""
Админ-журнал платёжных операций (Этап 6.11.3).

Только безопасные поля: без credentials, ciphertext, raw webhook payload.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    PaymentAttempt,
    PaymentWebhookEvent,
)
from backend.models.payment_provider_connection import PaymentProviderConnection
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage, UserAddon, UserSubscription
from backend.models.user import User
from backend.payments.definitions.catalog import get_provider_definition


class PaymentOperationsAdminError(Exception):
    def __init__(self, message: str, *, code: str = "payment_ops_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _money(value: Any) -> str:
    return f"{Decimal(str(value)).quantize(Decimal('0.01'))}"


def _connection_summary(row: PaymentProviderConnection | None) -> dict[str, Any] | None:
    if row is None:
        return None
    definition = get_provider_definition(row.provider_code)
    adapter_status = definition.adapter_status if definition else "planned"
    return {
        "id": row.id,
        "provider_code": row.provider_code,
        "connection_name": row.connection_name,
        "mode": row.mode,
        "enabled": bool(row.enabled),
        "verified": bool(row.verified),
        "is_default": bool(row.is_default),
        "currency": row.currency,
        "public_identifier_masked": row.public_identifier_masked,
        "has_credentials": row.has_credentials(),
        "adapter_status": adapter_status,
    }


def _attempt_out(
    attempt: PaymentAttempt,
    connection: PaymentProviderConnection | None = None,
) -> dict[str, Any]:
    return {
        "id": attempt.id,
        "checkout_intent_id": attempt.checkout_intent_id,
        "user_id": attempt.user_id,
        "provider": attempt.provider,
        "connection_id": attempt.connection_id,
        "provider_payment_id": attempt.provider_payment_id,
        "amount": _money(attempt.amount),
        "currency": attempt.currency,
        "status": attempt.status,
        "idempotency_key": attempt.idempotency_key,
        "confirmation_url": attempt.confirmation_url,
        "created_at": attempt.created_at,
        "updated_at": attempt.updated_at,
        "connection": _connection_summary(connection),
    }


def _webhook_out(event: PaymentWebhookEvent) -> dict[str, Any]:
    # Never include event.payload
    return {
        "id": event.id,
        "provider": event.provider,
        "provider_event_id": event.provider_event_id,
        "event_type": event.event_type,
        "process_status": event.process_status,
        "error_message": event.error_message,
        "payment_attempt_id": event.payment_attempt_id,
        "checkout_intent_id": event.checkout_intent_id,
        "processed_at": event.processed_at,
        "created_at": event.created_at,
    }


def _subscription_out(
    sub: UserSubscription | None, *, plan_code: str | None = None
) -> dict[str, Any] | None:
    if sub is None:
        return None
    status = sub.status.value if hasattr(sub.status, "value") else str(sub.status)
    return {
        "id": sub.id,
        "user_id": sub.user_id,
        "plan_id": sub.plan_id,
        "plan_code": plan_code,
        "status": status,
        "current_period_start": sub.current_period_start,
        "current_period_end": sub.current_period_end,
        "payment_provider": sub.payment_provider,
        "provider_subscription_id": sub.provider_subscription_id,
        "created_at": sub.created_at,
    }


def _addon_out(
    addon: UserAddon | None, *, addon_code: str | None = None
) -> dict[str, Any] | None:
    if addon is None:
        return None
    status = addon.status.value if hasattr(addon.status, "value") else str(addon.status)
    source = addon.source.value if hasattr(addon.source, "value") else str(addon.source)
    return {
        "id": addon.id,
        "user_id": addon.user_id,
        "addon_package_id": addon.addon_package_id,
        "addon_code": addon_code,
        "amount": int(addon.amount or 0),
        "status": status,
        "source": source,
        "provider_ref": addon.provider_ref,
        "period_start": addon.period_start,
        "period_end": addon.period_end,
        "created_at": addon.created_at,
    }


def list_payment_operations(
    db: Session,
    *,
    user_id: int | None = None,
    status: str | None = None,
    provider: str | None = None,
    checkout_intent_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    q = db.query(CheckoutIntent)
    if user_id is not None:
        q = q.filter(CheckoutIntent.user_id == user_id)
    if checkout_intent_id is not None:
        q = q.filter(CheckoutIntent.id == checkout_intent_id)
    if status:
        q = q.filter(CheckoutIntent.status == status.strip().lower())
    if date_from is not None:
        q = q.filter(CheckoutIntent.created_at >= date_from)
    if date_to is not None:
        q = q.filter(CheckoutIntent.created_at <= date_to)
    if provider:
        prov = provider.strip().lower()
        attempt_exists = (
            db.query(PaymentAttempt.id)
            .filter(
                PaymentAttempt.checkout_intent_id == CheckoutIntent.id,
                func.lower(PaymentAttempt.provider) == prov,
            )
            .exists()
        )
        q = q.filter(
            or_(
                func.lower(CheckoutIntent.payment_provider) == prov,
                attempt_exists,
            )
        )

    total = q.count()
    rows = (
        q.order_by(CheckoutIntent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    user_ids = {r.user_id for r in rows}
    emails: dict[int, str | None] = {}
    if user_ids:
        for uid, email in (
            db.query(User.id, User.email).filter(User.id.in_(tuple(user_ids))).all()
        ):
            emails[uid] = email

    intent_ids = [r.id for r in rows]
    attempt_stats: dict[int, tuple[int, str | None]] = {
        i: (0, None) for i in intent_ids
    }
    webhook_counts: dict[int, int] = {i: 0 for i in intent_ids}
    if intent_ids:
        attempts = (
            db.query(PaymentAttempt)
            .filter(PaymentAttempt.checkout_intent_id.in_(tuple(intent_ids)))
            .order_by(PaymentAttempt.id.desc())
            .all()
        )
        seen: set[int] = set()
        counts: dict[int, int] = {}
        latest: dict[int, str] = {}
        for a in attempts:
            counts[a.checkout_intent_id] = counts.get(a.checkout_intent_id, 0) + 1
            if a.checkout_intent_id not in seen:
                seen.add(a.checkout_intent_id)
                latest[a.checkout_intent_id] = a.status
        for iid in intent_ids:
            attempt_stats[iid] = (counts.get(iid, 0), latest.get(iid))

        for iid, cnt in (
            db.query(
                PaymentWebhookEvent.checkout_intent_id,
                func.count(PaymentWebhookEvent.id),
            )
            .filter(PaymentWebhookEvent.checkout_intent_id.in_(tuple(intent_ids)))
            .group_by(PaymentWebhookEvent.checkout_intent_id)
            .all()
        ):
            if iid is not None:
                webhook_counts[int(iid)] = int(cnt)

    items: list[dict[str, Any]] = []
    for intent in rows:
        acount, astatus = attempt_stats.get(intent.id, (0, None))
        items.append(
            {
                "checkout_intent_id": intent.id,
                "user_id": intent.user_id,
                "user_email": emails.get(intent.user_id),
                "product_type": intent.product_type,
                "product_code": intent.product_code,
                "product_name": intent.product_name,
                "amount": _money(intent.amount),
                "currency": intent.currency,
                "status": intent.status,
                "payment_provider": intent.payment_provider,
                "provider_payment_id": intent.provider_payment_id,
                "latest_attempt_status": astatus,
                "attempt_count": acount,
                "webhook_event_count": webhook_counts.get(intent.id, 0),
                "fulfilled": intent.status
                == CheckoutIntentStatus.FULFILLED.value,
                "created_at": intent.created_at,
                "paid_at": intent.paid_at,
                "fulfilled_at": intent.fulfilled_at,
                "cancelled_at": intent.cancelled_at,
            }
        )

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_payment_operation_detail(
    db: Session,
    *,
    checkout_intent_id: int,
) -> dict[str, Any]:
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == checkout_intent_id)
        .first()
    )
    if intent is None:
        raise PaymentOperationsAdminError(
            "Checkout intent not found",
            code="intent_not_found",
        )

    user = db.query(User).filter(User.id == intent.user_id).first()
    attempts = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .order_by(PaymentAttempt.id.asc())
        .all()
    )
    conn_ids = {a.connection_id for a in attempts if a.connection_id}
    connections: dict[int, PaymentProviderConnection] = {}
    if conn_ids:
        for row in (
            db.query(PaymentProviderConnection)
            .filter(PaymentProviderConnection.id.in_(tuple(conn_ids)))
            .all()
        ):
            connections[row.id] = row

    events = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.checkout_intent_id == intent.id)
        .order_by(PaymentWebhookEvent.id.asc())
        .all()
    )

    subscription = None
    plan_code = None
    if intent.fulfilled_subscription_id:
        subscription = (
            db.query(UserSubscription)
            .filter(UserSubscription.id == intent.fulfilled_subscription_id)
            .first()
        )
        if subscription is not None:
            plan = db.query(Plan).filter(Plan.id == subscription.plan_id).first()
            plan_code = plan.code if plan else None

    addon = None
    addon_code = None
    if intent.fulfilled_addon_id:
        addon = (
            db.query(UserAddon)
            .filter(UserAddon.id == intent.fulfilled_addon_id)
            .first()
        )
        if addon is not None:
            pkg = (
                db.query(AddonPackage)
                .filter(AddonPackage.id == addon.addon_package_id)
                .first()
            )
            addon_code = pkg.code if pkg else None

    fulfillment = {
        "status": intent.status,
        "fulfilled": intent.status == CheckoutIntentStatus.FULFILLED.value,
        "paid_at": intent.paid_at,
        "fulfilled_at": intent.fulfilled_at,
        "failed_at": intent.failed_at,
        "cancelled_at": intent.cancelled_at,
        "fulfilled_subscription_id": intent.fulfilled_subscription_id,
        "fulfilled_addon_id": intent.fulfilled_addon_id,
        "subscription": _subscription_out(subscription, plan_code=plan_code),
        "addon": _addon_out(addon, addon_code=addon_code),
    }

    return {
        "checkout_intent_id": intent.id,
        "user_id": intent.user_id,
        "user_email": user.email if user else None,
        "product_type": intent.product_type,
        "product_code": intent.product_code,
        "product_name": intent.product_name,
        "description": intent.description,
        "amount": _money(intent.amount),
        "currency": intent.currency,
        "status": intent.status,
        "idempotency_key": intent.idempotency_key,
        "payment_provider": intent.payment_provider,
        "provider_payment_id": intent.provider_payment_id,
        "created_at": intent.created_at,
        "updated_at": intent.updated_at,
        "attempts": [
            _attempt_out(
                a,
                connections.get(a.connection_id) if a.connection_id else None,
            )
            for a in attempts
        ],
        "webhook_events": [_webhook_out(e) for e in events],
        "fulfillment": fulfillment,
    }
