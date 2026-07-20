"""
Notification outbox worker (Этап 6.14.10Б).

Claim → send → mark sent/retry/failed.
PostgreSQL: FOR UPDATE SKIP LOCKED.
SQLite: claim через UPDATE по id (тест/dev).
"""
from __future__ import annotations

import logging
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, or_, text, update
from sqlalchemy.orm import Session

from backend.models.notification import NotificationOutbox, NotificationOutboxStatus
from backend.services.email_transport import (
    EmailMessagePayload,
    EmailTransport,
    classify_email_error,
    get_email_transport,
)
from backend.services.notification_templates.refund_email import build_refund_email
from backend.settings import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_backoff_seconds(attempts: int, *, base: int | None = None) -> int:
    base_s = int(base if base is not None else settings.NOTIFICATION_OUTBOX_BASE_RETRY_SECONDS)
    # exponential: base * 2^(attempts-1), capped
    exp = max(0, int(attempts) - 1)
    delay = base_s * (2**exp)
    return int(min(delay, 3600 * 6))


def recover_stale_processing(db: Session, *, now: datetime | None = None) -> int:
    """Вернуть зависшие processing → retry (attempts не сбрасываем)."""
    now = now or _utcnow()
    lease = int(settings.NOTIFICATION_OUTBOX_LEASE_SECONDS or 300)
    cutoff = now - timedelta(seconds=lease)
    rows = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.status == NotificationOutboxStatus.PROCESSING.value,
            NotificationOutbox.locked_at.isnot(None),
            NotificationOutbox.locked_at < cutoff,
        )
        .all()
    )
    count = 0
    for row in rows:
        row.status = NotificationOutboxStatus.RETRY.value
        row.locked_at = None
        row.locked_by = None
        row.available_at = now
        row.updated_at = now
        row.last_error_code = row.last_error_code or "stale_processing"
        row.last_error_message = "Processing lease expired; requeued"
        count += 1
    if count:
        db.flush()
    return count


def claim_outbox_batch(
    db: Session,
    *,
    worker_id: str,
    batch_size: int | None = None,
    now: datetime | None = None,
) -> list[NotificationOutbox]:
    now = now or _utcnow()
    limit = int(batch_size or settings.NOTIFICATION_OUTBOX_BATCH_SIZE or 20)
    limit = max(1, min(limit, 100))
    recover_stale_processing(db, now=now)

    bind = db.get_bind()
    dialect = bind.dialect.name if bind is not None else "sqlite"

    if dialect == "postgresql":
        sql = text(
            """
            SELECT id FROM notification_outbox
            WHERE status IN ('pending', 'retry')
              AND available_at <= :now
            ORDER BY available_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT :lim
            """
        )
        ids = [int(r[0]) for r in db.execute(sql, {"now": now, "lim": limit}).fetchall()]
    else:
        # SQLite / tests: без SKIP LOCKED — берём кандидатов и атомарно claim через UPDATE.
        candidates = (
            db.query(NotificationOutbox.id)
            .filter(
                NotificationOutbox.status.in_(
                    [
                        NotificationOutboxStatus.PENDING.value,
                        NotificationOutboxStatus.RETRY.value,
                    ]
                ),
                NotificationOutbox.available_at <= now,
            )
            .order_by(NotificationOutbox.available_at.asc(), NotificationOutbox.id.asc())
            .limit(limit)
            .all()
        )
        ids = [int(r[0]) for r in candidates]

    if not ids:
        return []

    claimed: list[NotificationOutbox] = []
    for oid in ids:
        result = db.execute(
            update(NotificationOutbox)
            .where(
                NotificationOutbox.id == oid,
                NotificationOutbox.status.in_(
                    [
                        NotificationOutboxStatus.PENDING.value,
                        NotificationOutboxStatus.RETRY.value,
                    ]
                ),
            )
            .values(
                status=NotificationOutboxStatus.PROCESSING.value,
                locked_at=now,
                locked_by=worker_id,
                updated_at=now,
            )
        )
        if result.rowcount:
            row = db.get(NotificationOutbox, oid)
            if row is not None:
                claimed.append(row)
    db.flush()
    return claimed


def _render_email(row: NotificationOutbox) -> EmailMessagePayload:
    payload = row.payload_json if isinstance(row.payload_json, dict) else {}
    title = str(payload.get("title") or "Обновление заявки на возврат")
    description = str(payload.get("description") or "")
    status_label = payload.get("status_label")
    if status_label is not None:
        status_label = str(status_label)
    request_id = int(payload.get("request_id") or row.aggregate_id or 0)
    detail_url = str(payload.get("detail_url") or "")
    amount_line = payload.get("amount_line")
    if amount_line is not None:
        amount_line = str(amount_line)
    if not title or not description:
        raise ValueError("malformed_payload")
    subject, body = build_refund_email(
        title=title,
        description=description,
        status_label=status_label,
        request_id=request_id,
        detail_url=detail_url,
        amount_line=amount_line,
    )
    return EmailMessagePayload(
        to_email=row.recipient_email,
        subject=subject,
        body_text=body,
    )


def process_outbox_row(
    db: Session,
    row: NotificationOutbox,
    *,
    transport: EmailTransport | None = None,
) -> str:
    """Обработать одну claimed запись. Возвращает итоговый статус."""
    transport = transport or get_email_transport()
    now = _utcnow()
    max_attempts = int(settings.NOTIFICATION_OUTBOX_MAX_ATTEMPTS or 8)

    if row.status == NotificationOutboxStatus.SENT.value:
        return NotificationOutboxStatus.SENT.value

    started = time.monotonic()
    try:
        message = _render_email(row)
        transport.send(message)
        row.status = NotificationOutboxStatus.SENT.value
        row.sent_at = now
        row.locked_at = None
        row.locked_by = None
        row.last_error_code = None
        row.last_error_message = None
        row.updated_at = now
        row.attempts = int(row.attempts or 0) + 1
        db.flush()
        logger.info(
            "outbox_sent id=%s type=%s aggregate=%s/%s attempt=%s duration_ms=%s",
            row.id,
            row.notification_type,
            row.aggregate_type,
            row.aggregate_id,
            row.attempts,
            int((time.monotonic() - started) * 1000),
        )
        return NotificationOutboxStatus.SENT.value
    except Exception as exc:
        code, temporary = classify_email_error(exc)
        if isinstance(exc, ValueError) and "malformed" in str(exc):
            code, temporary = "malformed_payload", False
        row.attempts = int(row.attempts or 0) + 1
        row.locked_at = None
        row.locked_by = None
        row.last_error_code = code[:64]
        row.last_error_message = (str(getattr(exc, "message", None) or exc))[:1000]
        row.updated_at = now

        if not temporary or row.attempts >= max_attempts:
            row.status = NotificationOutboxStatus.FAILED_PERMANENT.value
            result = NotificationOutboxStatus.FAILED_PERMANENT.value
        else:
            row.status = NotificationOutboxStatus.RETRY.value
            row.available_at = now + timedelta(
                seconds=compute_backoff_seconds(row.attempts)
            )
            result = NotificationOutboxStatus.RETRY.value
        db.flush()
        logger.info(
            "outbox_failed id=%s result=%s code=%s attempt=%s duration_ms=%s",
            row.id,
            result,
            code,
            row.attempts,
            int((time.monotonic() - started) * 1000),
        )
        return result


def run_outbox_once(
    db: Session,
    *,
    worker_id: str | None = None,
    batch_size: int | None = None,
    transport: EmailTransport | None = None,
    commit: bool = True,
) -> dict[str, Any]:
    """
    Claim batch → commit (release row locks) → SMTP → commit results.

    Разделение claim/send: FOR UPDATE SKIP LOCKED не удерживается на время SMTP.
    """
    worker_id = worker_id or f"worker-{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
    claimed = claim_outbox_batch(db, worker_id=worker_id, batch_size=batch_size)
    claimed_ids = [int(r.id) for r in claimed]
    stats = {
        "claimed": len(claimed_ids),
        "sent": 0,
        "retry": 0,
        "failed_permanent": 0,
    }
    if not claimed_ids:
        return stats

    # Зафиксировать claim до SMTP, чтобы не держать DB-lock на время сети.
    if commit:
        db.commit()

    for oid in claimed_ids:
        row = db.get(NotificationOutbox, oid)
        if row is None:
            continue
        if row.status != NotificationOutboxStatus.PROCESSING.value:
            continue
        if row.locked_by and row.locked_by != worker_id:
            continue
        result = process_outbox_row(db, row, transport=transport)
        if result == NotificationOutboxStatus.SENT.value:
            stats["sent"] += 1
        elif result == NotificationOutboxStatus.RETRY.value:
            stats["retry"] += 1
        elif result == NotificationOutboxStatus.FAILED_PERMANENT.value:
            stats["failed_permanent"] += 1
    if commit:
        db.commit()
    return stats
