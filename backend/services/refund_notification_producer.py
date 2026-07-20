"""
Refund → notification outbox producer (Этап 6.14.10Б).

Не отправляет email. Не меняет refund status.
Использует public presentation из 6.14.10A.
Идемпотентность: unique idempotency_key.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.notification import (
    NotificationChannel,
    NotificationOutbox,
    NotificationOutboxStatus,
)
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
)
from backend.models.user import User
from backend.services.refund_api_presenters import (
    is_proposed_amount_undefined,
    recommended_refund_amount_str,
)
from backend.services.refund_audit_presentation import (
    PresentationContext,
    present_public_event,
)
from backend.services.notification_templates.refund_email import status_label_ru
from backend.settings import settings

logger = logging.getLogger(__name__)

AGGREGATE_TYPE_REFUND = "refund_request"
TEMPLATE_VERSION = "v1"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_notifiable(event: RefundAuditEvent) -> bool:
    action = str(event.action or "")
    new = event.new_status
    meta = event.event_metadata if isinstance(event.event_metadata, dict) else {}
    outcome = str(meta.get("outcome") or "")

    if action == RefundAuditAction.CREATED.value:
        return True
    if action == RefundAuditAction.APPROVED_REVISION_SET.value:
        return True
    if action in {
        RefundAuditAction.ENTITLEMENT_APPLIED.value,
        RefundAuditAction.ENTITLEMENT_ALREADY_APPLIED.value,
        RefundAuditAction.ENTITLEMENT_NOT_REQUIRED.value,
        RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value,
    }:
        return True
    if action == RefundAuditAction.STATUS_CHANGED.value:
        if new in {
            RefundRequestStatus.NEEDS_INFORMATION.value,
            RefundRequestStatus.REJECTED.value,
            RefundRequestStatus.APPROVED.value,
            RefundRequestStatus.REFUND_PROCESSING.value,
            RefundRequestStatus.REFUNDED.value,
            RefundRequestStatus.PARTIALLY_REFUNDED.value,
            RefundRequestStatus.REFUND_FAILED.value,
            RefundRequestStatus.PROVIDER_UNKNOWN.value,
            RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
            RefundRequestStatus.COMPLETED.value,
        }:
            return True
        if outcome in {"pending", "succeeded", "canceled", "failed", "provider_unknown"}:
            return True
    return False


def build_idempotency_key(
    *,
    refund_id: int,
    audit_event_id: int,
    user_id: int,
    channel: str = NotificationChannel.EMAIL.value,
    template_version: str | None = None,
) -> str:
    ver = template_version or getattr(settings, "NOTIFICATION_TEMPLATE_VERSION", TEMPLATE_VERSION)
    return f"refund:{int(refund_id)}:{int(audit_event_id)}:{channel}:{int(user_id)}:{ver}"


def enqueue_refund_notification_from_audit(
    db: Session,
    *,
    request: RefundRequest,
    audit_event: RefundAuditEvent,
) -> NotificationOutbox | None:
    """
    Создать outbox-запись для ключевого audit event.
    Вызывать в той же транзакции после db.add(audit) + flush (нужен audit.id).
    """
    if audit_event.id is None:
        db.flush()
    if not _is_notifiable(audit_event):
        return None

    user = db.get(User, int(request.user_id))
    if user is None or not (user.email or "").strip():
        logger.info(
            "refund_notify_skip_no_email refund_id=%s audit_id=%s",
            request.id,
            audit_event.id,
        )
        return None

    # Сумма только из безопасного DTO ревизии заявки (не из metadata).
    revision = None
    if request.current_revision_number:
        from backend.models.refund import RefundRevision

        revision = (
            db.query(RefundRevision)
            .filter(
                RefundRevision.refund_request_id == request.id,
                RefundRevision.revision_number == request.current_revision_number,
            )
            .first()
        )
    undefined = is_proposed_amount_undefined(revision, request)
    amount = None if undefined else recommended_refund_amount_str(revision, request)
    currency = revision.currency if revision else None

    ctx = PresentationContext(
        recommended_refund_amount=amount,
        currency=currency,
        proposed_amount_undefined=undefined,
    )
    public = present_public_event(audit_event, ctx=ctx)
    if public is None:
        return None

    channel = NotificationChannel.EMAIL.value
    key = build_idempotency_key(
        refund_id=int(request.id),
        audit_event_id=int(audit_event.id),
        user_id=int(request.user_id),
        channel=channel,
    )
    existing = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.idempotency_key == key)
        .first()
    )
    if existing is not None:
        return existing

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    detail_url = f"{frontend}/dashboard/finance/refunds/{int(request.id)}"
    amount_line = None
    if amount and public.category in {"calculation", "decision", "completed", "processing"}:
        cur = f" {currency}" if currency else ""
        amount_line = f"Сумма: {amount}{cur}"

    payload: dict[str, Any] = {
        "notification_type": "refund_status",
        "title": public.title,
        "description": public.description,
        "category": public.category,
        "status": public.status,
        "status_label": status_label_ru(public.status),
        "request_id": int(request.id),
        "detail_url": detail_url,
        "amount_line": amount_line,
        "template_version": getattr(
            settings, "NOTIFICATION_TEMPLATE_VERSION", TEMPLATE_VERSION
        ),
    }

    now = _utcnow()
    row = NotificationOutbox(
        notification_type="refund_status",
        channel=channel,
        recipient_user_id=int(request.user_id),
        recipient_email=str(user.email).strip(),
        aggregate_type=AGGREGATE_TYPE_REFUND,
        aggregate_id=str(int(request.id)),
        event_type=str(audit_event.action or "status"),
        idempotency_key=key,
        payload_json=payload,
        status=NotificationOutboxStatus.PENDING.value,
        attempts=0,
        available_at=now,
        created_at=now,
        updated_at=now,
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        existing = (
            db.query(NotificationOutbox)
            .filter(NotificationOutbox.idempotency_key == key)
            .first()
        )
        return existing
    logger.info(
        "refund_notify_enqueued outbox_id=%s refund_id=%s audit_id=%s",
        row.id,
        request.id,
        audit_event.id,
    )
    return row


def after_refund_audit_written(
    db: Session,
    *,
    request: RefundRequest,
    audit_event: RefundAuditEvent,
) -> None:
    """Хук после db.add(audit). Ошибки producer не должны ломать refund (кроме Integrity)."""
    try:
        db.flush()
        enqueue_refund_notification_from_audit(
            db, request=request, audit_event=audit_event
        )
    except Exception:
        # Не откатываем refund: логируем; outbox можно догнать позже по audit (вне scope).
        logger.exception(
            "refund_notify_enqueue_failed refund_id=%s audit_id=%s",
            getattr(request, "id", None),
            getattr(audit_event, "id", None),
        )
