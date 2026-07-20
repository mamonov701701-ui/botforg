"""
Refund → notification outbox producer (Этап 6.14.10Б).

Не отправляет email. Не меняет refund status.
Обязательный enqueue атомарен с audit/status transition:
реальная ошибка producer → exception → rollback транзакции.
Duplicate idempotency — успех. Нет recipient — контролируемый skip.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
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

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RefundNotificationEnqueueError(Exception):
    """Системная ошибка обязательного enqueue — должна откатить refund-транзакцию."""

    def __init__(self, message: str, *, code: str = "enqueue_failed") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class RefundNotificationResultKind(str, Enum):
    ENQUEUED = "enqueued"
    DUPLICATE = "duplicate"
    SKIPPED_NOT_REQUIRED = "skipped_not_required"
    SKIPPED_NO_RECIPIENT = "skipped_no_recipient"


@dataclass(frozen=True)
class RefundNotificationResult:
    kind: RefundNotificationResultKind
    outbox: NotificationOutbox | None = None

    @property
    def ok(self) -> bool:
        return True


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


def _is_valid_recipient_email(email: str | None) -> bool:
    value = (email or "").strip()
    if not value or len(value) > 320:
        return False
    return bool(_EMAIL_RE.match(value))


def build_idempotency_key(
    *,
    refund_id: int,
    audit_event_id: int,
    user_id: int,
    channel: str = NotificationChannel.EMAIL.value,
    template_version: str | None = None,
) -> str:
    if refund_id is None or audit_event_id is None or user_id is None:
        raise RefundNotificationEnqueueError(
            "Missing ids for idempotency key",
            code="idempotency_key_invalid",
        )
    ver = template_version or getattr(settings, "NOTIFICATION_TEMPLATE_VERSION", TEMPLATE_VERSION)
    return f"refund:{int(refund_id)}:{int(audit_event_id)}:{channel}:{int(user_id)}:{ver}"


def enqueue_refund_notification_from_audit(
    db: Session,
    *,
    request: RefundRequest,
    audit_event: RefundAuditEvent,
) -> RefundNotificationResult:
    """
    Создать outbox-запись для ключевого audit event в той же транзакции.

    Возвращает типизированный результат (enqueued/duplicate/skipped_*).
    Системные ошибки — исключение (caller должен rollback).
    """
    if audit_event.id is None:
        db.flush()
    if audit_event.id is None:
        raise RefundNotificationEnqueueError(
            "Audit event id missing after flush",
            code="audit_id_missing",
        )

    if not _is_notifiable(audit_event):
        return RefundNotificationResult(
            kind=RefundNotificationResultKind.SKIPPED_NOT_REQUIRED
        )

    try:
        user = db.get(User, int(request.user_id))
    except Exception as exc:
        raise RefundNotificationEnqueueError(
            "Failed to load recipient user",
            code="recipient_lookup_failed",
        ) from exc

    if user is None:
        raise RefundNotificationEnqueueError(
            "Recipient user not found",
            code="recipient_user_missing",
        )

    email = (user.email or "").strip()
    if not _is_valid_recipient_email(email):
        logger.info(
            "refund_notify_skipped_no_recipient refund_id=%s audit_id=%s reason=invalid_or_missing_email",
            request.id,
            audit_event.id,
        )
        return RefundNotificationResult(
            kind=RefundNotificationResultKind.SKIPPED_NO_RECIPIENT
        )

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
        raise RefundNotificationEnqueueError(
            "Required notification presentation returned empty",
            code="malformed_payload",
        )
    title = (public.title or "").strip()
    description = (public.description or "").strip()
    if not title or not description:
        raise RefundNotificationEnqueueError(
            "Required notification payload missing title/description",
            code="malformed_payload",
        )

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
        return RefundNotificationResult(
            kind=RefundNotificationResultKind.DUPLICATE,
            outbox=existing,
        )

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    detail_url = f"{frontend}/dashboard/finance/refunds/{int(request.id)}"
    amount_line = None
    if amount and public.category in {"calculation", "decision", "completed", "processing"}:
        cur = f" {currency}" if currency else ""
        amount_line = f"Сумма: {amount}{cur}"

    payload: dict[str, Any] = {
        "notification_type": "refund_status",
        "title": title,
        "description": description,
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
        recipient_email=email,
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
    except IntegrityError as exc:
        existing = (
            db.query(NotificationOutbox)
            .filter(NotificationOutbox.idempotency_key == key)
            .first()
        )
        if existing is not None:
            return RefundNotificationResult(
                kind=RefundNotificationResultKind.DUPLICATE,
                outbox=existing,
            )
        # Произвольный IntegrityError без записи по ключу — не идемпотентный дубль.
        raise RefundNotificationEnqueueError(
            "Outbox insert integrity error without idempotent row",
            code="enqueue_integrity_error",
        ) from exc

    logger.info(
        "refund_notify_enqueued outbox_id=%s refund_id=%s audit_id=%s",
        row.id,
        request.id,
        audit_event.id,
    )
    return RefundNotificationResult(
        kind=RefundNotificationResultKind.ENQUEUED,
        outbox=row,
    )


def after_refund_audit_written(
    db: Session,
    *,
    request: RefundRequest,
    audit_event: RefundAuditEvent,
) -> RefundNotificationResult:
    """
    Хук после db.add(audit), до commit.

    Обязательный enqueue: ошибки поднимаются (rollback caller-транзакции).
    Duplicate / skipped_* — успех без exception.
    """
    db.flush()
    return enqueue_refund_notification_from_audit(
        db, request=request, audit_event=audit_event
    )
