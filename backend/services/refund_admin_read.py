"""
Админский read-only просмотр возвратов (Этап 6.14.3.4).

Без мутаций статуса/данных, без provider refund и entitlement.
Snapshots — только whitelist DTO, без passthrough неизвестных полей.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, PaymentAttempt
from backend.models.refund import (
    RefundAuditEvent,
    RefundRequest,
    RefundRevision,
)
from backend.models.user import User
from backend.services.refund_api_presenters import (
    format_money,
    is_proposed_amount_undefined,
    project_entitlement_snapshot,
    project_financial_snapshot,
    project_usage_snapshot,
    recommended_refund_amount_str,
    request_has_manual_review_signal,
)
from backend.services.refund_audit_presentation import present_admin_event
from backend.services.tariff_limits import get_user_tariff_limits


class RefundAdminReadError(Exception):
    def __init__(self, message: str, *, code: str = "refund_admin_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _user_safe(db: Session, user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    effective_plan_code: str | None = None
    effective_plan_name: str | None = None
    try:
        summary = get_user_tariff_limits(db, int(user.id))
        effective_plan_code = summary.plan_code
        effective_plan_name = summary.plan_name
    except Exception:
        # Read path must not fail the whole admin detail on tariff resolution.
        effective_plan_code = None
        effective_plan_name = None
    return {
        "id": user.id,
        "public_id": user.public_id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        # Legacy column — keep for diagnostics; UI must not treat as current tariff.
        "plan_code": user.plan_code,
        "effective_plan_code": effective_plan_code,
        "effective_plan_name": effective_plan_name,
        "is_suspended": bool(user.is_suspended),
        "created_at": user.created_at,
    }


def _intent_out(intent: CheckoutIntent | None) -> dict[str, Any] | None:
    if intent is None:
        return None
    return {
        "id": intent.id,
        "user_id": intent.user_id,
        "product_type": intent.product_type,
        "product_code": intent.product_code,
        "product_name": intent.product_name,
        "description": intent.description,
        "amount": format_money(intent.amount),
        "currency": intent.currency,
        "status": intent.status,
        "idempotency_key": intent.idempotency_key,
        "payment_provider": intent.payment_provider,
        "provider_payment_id": intent.provider_payment_id,
        "paid_at": intent.paid_at,
        "fulfilled_at": intent.fulfilled_at,
        "failed_at": intent.failed_at,
        "cancelled_at": intent.cancelled_at,
        "refunded_at": intent.refunded_at,
        "fulfilled_subscription_id": intent.fulfilled_subscription_id,
        "fulfilled_addon_id": intent.fulfilled_addon_id,
        "created_at": intent.created_at,
        "updated_at": intent.updated_at,
    }


def _attempt_out(attempt: PaymentAttempt | None) -> dict[str, Any] | None:
    if attempt is None:
        return None
    return {
        "id": attempt.id,
        "checkout_intent_id": attempt.checkout_intent_id,
        "user_id": attempt.user_id,
        "provider": attempt.provider,
        "connection_id": attempt.connection_id,
        "provider_payment_id": attempt.provider_payment_id,
        "amount": format_money(attempt.amount),
        "currency": attempt.currency,
        "status": attempt.status,
        "idempotency_key": attempt.idempotency_key,
        "confirmation_url": attempt.confirmation_url,
        "created_at": attempt.created_at,
        "updated_at": attempt.updated_at,
    }


def _revision_out(
    revision: RefundRevision | None, request: RefundRequest
) -> dict[str, Any] | None:
    if revision is None:
        return None
    undefined = is_proposed_amount_undefined(revision, request)
    proposed = None if undefined else format_money(revision.proposed_refund_amount)
    final = (
        None
        if revision.final_refund_amount is None
        else format_money(revision.final_refund_amount)
    )
    return {
        "id": revision.id,
        "refund_request_id": revision.refund_request_id,
        "revision_number": revision.revision_number,
        "revision_type": revision.revision_type,
        "created_by_user_id": revision.created_by_user_id,
        "based_on_revision_id": revision.based_on_revision_id,
        "calculation_status": revision.calculation_status,
        "refund_type": revision.refund_type,
        "currency": revision.currency,
        "paid_amount": format_money(revision.paid_amount),
        "prior_refunded_amount": format_money(revision.prior_refunded_amount),
        "proposed_refund_amount": proposed,
        "final_refund_amount": final,
        "proposed_amount_undefined": undefined,
        "calculation_at": revision.calculation_at,
        "period_start": revision.period_start,
        "period_end": revision.period_end,
        "used_time_seconds": revision.used_time_seconds,
        "total_time_seconds": revision.total_time_seconds,
        "addon_total_units": revision.addon_total_units,
        "addon_used_units": revision.addon_used_units,
        "addon_revoke_units": revision.addon_revoke_units,
        "entitlement_action": revision.entitlement_action,
        "entitlement_effective_at": revision.entitlement_effective_at,
        "adjustment_reason_category": revision.adjustment_reason_category,
        "adjustment_comment": revision.adjustment_comment,
        "calculation_snapshot": project_financial_snapshot(revision.calculation_snapshot),
        "entitlement_snapshot": project_entitlement_snapshot(revision.entitlement_snapshot),
        "usage_snapshot": project_usage_snapshot(revision.usage_snapshot),
        "created_at": revision.created_at,
    }


def _audit_out(event: RefundAuditEvent) -> dict[str, Any]:
    """Admin timeline: русское title + whitelist details (не raw metadata)."""
    presented = present_admin_event(event)
    return {
        "id": presented.id,
        "refund_request_id": presented.refund_request_id,
        "refund_revision_id": presented.refund_revision_id,
        "actor_user_id": presented.actor_user_id,
        "actor_type": presented.actor_type,
        "action": presented.action,
        "title": presented.title,
        "previous_status": presented.previous_status,
        "new_status": presented.new_status,
        "changed_fields": presented.changed_fields,
        "reason": presented.reason,
        # Обратная совместимость: event_metadata = whitelist details.
        "event_metadata": presented.details,
        "details": presented.details,
        "created_at": presented.created_at,
    }


def _request_core(request: RefundRequest, revision: RefundRevision | None) -> dict[str, Any]:
    undefined = is_proposed_amount_undefined(revision, request)
    return {
        "id": request.id,
        "user_id": request.user_id,
        "checkout_intent_id": request.checkout_intent_id,
        "payment_attempt_id": request.payment_attempt_id,
        "status": request.status,
        "reason_category": request.reason_category,
        "user_comment": request.user_comment,
        "current_revision_number": int(request.current_revision_number or 0),
        "approved_revision_id": request.approved_revision_id,
        "version": int(request.version or 1),
        "recommended_refund_amount": recommended_refund_amount_str(revision, request),
        "proposed_amount_undefined": undefined,
        "manual_review_required": request_has_manual_review_signal(request, revision),
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "submitted_at": request.submitted_at,
        "completed_at": request.completed_at,
    }


def _load_current_revisions(
    db: Session, rows: list[RefundRequest]
) -> dict[int, RefundRevision]:
    req_ids = [r.id for r in rows]
    revisions_by_req: dict[int, RefundRevision] = {}
    if not req_ids:
        return revisions_by_req
    wanted = {
        r.id: int(r.current_revision_number or 0)
        for r in rows
        if r.current_revision_number
    }
    for rev in (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id.in_(tuple(req_ids)))
        .all()
    ):
        if rev.revision_number == wanted.get(rev.refund_request_id):
            revisions_by_req[rev.refund_request_id] = rev
    return revisions_by_req


def list_refund_requests_admin(
    db: Session,
    *,
    status: str | None = None,
    user_id: int | None = None,
    reason_category: str | None = None,
    manual_review: bool | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    q = db.query(RefundRequest)
    if status:
        q = q.filter(RefundRequest.status == status.strip())
    if user_id is not None:
        q = q.filter(RefundRequest.user_id == int(user_id))
    if reason_category:
        q = q.filter(RefundRequest.reason_category == reason_category.strip())

    # Manual review: фактический признак в current revision/расчёте (не только status).
    # Фильтруем в Python после загрузки current revisions — корректнее JSON/admin_edit.
    if manual_review is None:
        total = q.count()
        rows = (
            q.order_by(RefundRequest.id.desc()).offset(offset).limit(limit).all()
        )
        revisions_by_req = _load_current_revisions(db, rows)
    else:
        candidates = q.order_by(RefundRequest.id.desc()).all()
        revisions_by_req = _load_current_revisions(db, candidates)
        filtered = [
            row
            for row in candidates
            if request_has_manual_review_signal(row, revisions_by_req.get(row.id))
            is bool(manual_review)
        ]
        total = len(filtered)
        rows = filtered[offset : offset + limit]
        revisions_by_req = {
            row.id: revisions_by_req[row.id]
            for row in rows
            if row.id in revisions_by_req
        }

    user_ids = {r.user_id for r in rows}
    emails: dict[int, str | None] = {}
    if user_ids:
        for uid, email in (
            db.query(User.id, User.email).filter(User.id.in_(tuple(user_ids))).all()
        ):
            emails[int(uid)] = email

    intent_ids = {r.checkout_intent_id for r in rows}
    intents: dict[int, CheckoutIntent] = {}
    if intent_ids:
        for intent in (
            db.query(CheckoutIntent)
            .filter(CheckoutIntent.id.in_(tuple(intent_ids)))
            .all()
        ):
            intents[intent.id] = intent

    items: list[dict[str, Any]] = []
    for request in rows:
        revision = revisions_by_req.get(request.id)
        intent = intents.get(request.checkout_intent_id)
        core = _request_core(request, revision)
        items.append(
            {
                **core,
                "user_email": emails.get(request.user_id),
                "product_type": intent.product_type if intent else None,
                "product_code": intent.product_code if intent else None,
                "product_name": intent.product_name if intent else None,
                "amount": format_money(intent.amount) if intent else None,
                "currency": intent.currency
                if intent
                else (revision.currency if revision else None),
                "refund_type": revision.refund_type if revision else None,
                "calculation_status": (
                    revision.calculation_status if revision else None
                ),
            }
        )

    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


def get_refund_request_admin(db: Session, *, request_id: int) -> dict[str, Any]:
    request = (
        db.query(RefundRequest).filter(RefundRequest.id == int(request_id)).first()
    )
    if request is None:
        raise RefundAdminReadError(
            "Refund request not found",
            code="request_not_found",
        )

    user = db.query(User).filter(User.id == request.user_id).first()
    intent = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.id == request.checkout_intent_id)
        .first()
    )
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.id == request.payment_attempt_id)
        .first()
    )
    revisions = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == request.id)
        .order_by(RefundRevision.revision_number.asc())
        .all()
    )
    current = next(
        (
            r
            for r in revisions
            if r.revision_number == int(request.current_revision_number or 0)
        ),
        None,
    )
    approved = None
    if request.approved_revision_id:
        approved = next(
            (r for r in revisions if r.id == request.approved_revision_id),
            None,
        )
        if approved is None:
            approved = db.get(RefundRevision, request.approved_revision_id)

    audits = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == request.id)
        .order_by(
            RefundAuditEvent.created_at.asc(),
            RefundAuditEvent.id.asc(),
        )
        .all()
    )

    product = None
    if intent is not None:
        snap = (
            intent.price_grid_snapshot
            if isinstance(intent.price_grid_snapshot, dict)
            else {}
        )
        terms = snap.get("terms_confirmation") if isinstance(snap.get("terms_confirmation"), dict) else {}
        avg = snap.get("average_unit_price")
        if avg is None and isinstance(terms, dict):
            avg = terms.get("average_unit_price")
        validity = snap.get("validity_days")
        if validity is None and isinstance(terms, dict):
            validity = terms.get("validity_days")
        confirmed_at = terms.get("confirmed_at") if terms else None
        avg_out = None
        if avg is not None:
            try:
                avg_out = format_money(avg)
            except Exception:
                avg_out = str(avg)
        try:
            validity_out = int(validity) if validity is not None else None
        except (TypeError, ValueError):
            validity_out = None
        grid_vid = snap.get("pricing_grid_version_id")
        if grid_vid is None and isinstance(terms, dict):
            grid_vid = terms.get("pricing_grid_version_id")
        try:
            grid_vid_out = int(grid_vid) if grid_vid is not None else None
        except (TypeError, ValueError):
            grid_vid_out = None
        product = {
            "product_type": intent.product_type,
            "product_code": intent.product_code,
            "product_name": intent.product_name,
            "amount": format_money(intent.amount),
            "currency": intent.currency,
            "product_units": intent.product_units,
            "validity_days": validity_out,
            "duration_kind": (
                str(snap.get("duration_kind"))
                if snap.get("duration_kind")
                else (
                    "activation_days"
                    if validity_out is not None
                    else None
                )
            ),
            "terms_confirmed": bool(terms and terms.get("confirmed") is True),
            "terms_confirmed_at": str(confirmed_at) if confirmed_at else None,
            "purchase_kind": snap.get("kind") if isinstance(snap.get("kind"), str) else None,
            "average_unit_price": avg_out,
            "pricing_grid_version_id": grid_vid_out,
        }

    return {
        "request": _request_core(request, current),
        "user": _user_safe(db, user),
        "checkout_intent": _intent_out(intent),
        "payment_attempt": _attempt_out(attempt),
        "product": product,
        "usage_snapshot": project_usage_snapshot(
            current.usage_snapshot if current else None
        ),
        "financial_snapshot": project_financial_snapshot(
            current.calculation_snapshot if current else None
        ),
        "current_revision": _revision_out(current, request),
        "approved_revision": _revision_out(approved, request),
        "revisions": [_revision_out(r, request) for r in revisions],
        "audit_timeline": [_audit_out(e) for e in audits],
    }
