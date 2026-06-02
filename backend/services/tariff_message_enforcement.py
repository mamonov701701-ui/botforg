"""
Enforcement лимита сообщений для нового webhook runtime (Этап 5.3).

Только POST /webhooks/{channel}/{bot_id} — legacy /webhook/{bot_id} и POST /messages/ не затрагиваются.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.channels.base import NormalizedUpdate
from backend.models.tariff import UsageCounter
from backend.services.channel_runtime import _has_real_user_input
from backend.services.tariff_limits import get_user_tariff_limits

REASON_MESSAGE_LIMIT_EXCEEDED = "message_limit_exceeded"
REASON_MISSING_STABLE_MESSAGE_ID = "missing_stable_message_id"


@dataclass
class MessageLimitResult:
    allowed: bool
    blocked: bool
    billable: bool
    consumed: bool
    reason: str | None
    messages_used: int | None
    messages_limit: int | None
    messages_remaining: int | None
    period_start: datetime | None = None
    period_end: datetime | None = None


def should_block_user_input_without_stable_id(
    normalized: NormalizedUpdate,
    external_id: str | None,
) -> bool:
    """User input без stable id нельзя безопасно dedup/тарифицировать (Этап 5.3.1)."""
    if external_id:
        return False
    return _has_real_user_input(normalized)


def is_webhook_message_billable(
    normalized: NormalizedUpdate,
    external_id: str | None,
) -> bool:
    """
    1 billable unit: реальный user input + стабильный idempotency key.
    Duplicate уже отфильтрован до вызова enforcement.
    """
    if not external_id:
        return False
    return _has_real_user_input(normalized)


def check_and_consume_message_unit(
    db: Session,
    user_id: int,
    at: datetime | None = None,
) -> MessageLimitResult:
    """
    Проверить лимит и атомарно увеличить UsageCounter.messages_used на 1.

    Вызывать только для billable webhook-событий.
    """
    summary = get_user_tariff_limits(db, user_id, at=at)
    limit = summary.messages_limit

    if limit is None:
        return MessageLimitResult(
            allowed=True,
            blocked=False,
            billable=True,
            consumed=False,
            reason=None,
            messages_used=summary.messages_used,
            messages_limit=None,
            messages_remaining=None,
            period_start=summary.period_start,
            period_end=summary.period_end,
        )

    counter = _get_or_create_usage_counter(
        db,
        user_id,
        summary.period_start,
        summary.period_end,
    )

    stmt = (
        update(UsageCounter)
        .where(
            UsageCounter.id == counter.id,
            UsageCounter.messages_used < limit,
        )
        .values(messages_used=UsageCounter.messages_used + 1)
    )
    result = db.execute(stmt)
    db.commit()

    if (result.rowcount or 0) == 1:
        db.refresh(counter)
        used = counter.messages_used
        return MessageLimitResult(
            allowed=True,
            blocked=False,
            billable=True,
            consumed=True,
            reason=None,
            messages_used=used,
            messages_limit=limit,
            messages_remaining=max(0, limit - used),
            period_start=summary.period_start,
            period_end=summary.period_end,
        )

    db.refresh(counter)
    used = counter.messages_used
    return MessageLimitResult(
        allowed=False,
        blocked=True,
        billable=True,
        consumed=False,
        reason=REASON_MESSAGE_LIMIT_EXCEEDED,
        messages_used=used,
        messages_limit=limit,
        messages_remaining=max(0, limit - used),
        period_start=summary.period_start,
        period_end=summary.period_end,
    )


def refund_message_unit(
    db: Session,
    user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> None:
    """
    Компенсация: уменьшить messages_used на 1, если счётчик был увеличен и > 0.

    Для unlimited (без prior increment) counter может отсутствовать — no-op.
    """
    counter = _find_usage_counter(db, user_id, period_start, period_end)
    if not counter:
        return
    stmt = (
        update(UsageCounter)
        .where(
            UsageCounter.id == counter.id,
            UsageCounter.messages_used > 0,
        )
        .values(messages_used=UsageCounter.messages_used - 1)
    )
    db.execute(stmt)
    db.commit()


def refund_consumed_message_unit(
    db: Session,
    user_id: int,
    limit_result: MessageLimitResult,
) -> None:
    """Refund только если consume реально увеличил счётчик."""
    if not (limit_result.allowed and limit_result.billable and limit_result.consumed):
        return
    if limit_result.period_start is None or limit_result.period_end is None:
        return
    refund_message_unit(
        db,
        user_id,
        limit_result.period_start,
        limit_result.period_end,
    )


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _periods_overlap(
    a_start: datetime,
    a_end: datetime,
    b_start: datetime,
    b_end: datetime,
) -> bool:
    return a_start < b_end and b_start < a_end


def _find_usage_counter(
    db: Session,
    user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> UsageCounter | None:
    p_start = _normalize_dt(period_start)
    p_end = _normalize_dt(period_end)
    for counter in db.query(UsageCounter).filter(UsageCounter.user_id == user_id).all():
        c_start = _normalize_dt(counter.period_start)
        c_end = _normalize_dt(counter.period_end)
        if _periods_overlap(c_start, c_end, p_start, p_end):
            return counter
    return None


def _get_or_create_usage_counter(
    db: Session,
    user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> UsageCounter:
    existing = _find_usage_counter(db, user_id, period_start, period_end)
    if existing:
        return existing

    counter = UsageCounter(
        user_id=user_id,
        period_start=_normalize_dt(period_start),
        period_end=_normalize_dt(period_end),
        messages_used=0,
        active_bots_used=0,
        team_members_used=0,
    )
    db.add(counter)
    try:
        db.commit()
        db.refresh(counter)
        return counter
    except IntegrityError:
        db.rollback()
        found = _find_usage_counter(db, user_id, period_start, period_end)
        if found:
            return found
        raise
