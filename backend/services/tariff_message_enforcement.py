"""
Enforcement лимита сообщений для нового webhook runtime (Этап 5.3 + 6.14.9A FIFO).

Только POST /webhooks/{channel}/{bot_id} — legacy /webhook/{bot_id} и POST /messages/ не затрагиваются.

UsageCounter и FIFO-журнал обновляются в одной транзакции (один commit).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.channels.base import NormalizedUpdate
from backend.models.tariff import (
    AddonPackageType,
    UsageCounter,
)
from backend.services.channel_runtime import _has_real_user_input
from backend.services.message_idempotency import get_whatsapp_inbound_message_type
from backend.services.tariff_addon_usage_ledger import (
    AddonUsageLedgerError,
    fifo_compensate_message_unit,
    fifo_debit_message_unit,
)
from backend.services.tariff_limits import get_user_tariff_limits

REASON_MESSAGE_LIMIT_EXCEEDED = "message_limit_exceeded"
REASON_MISSING_STABLE_MESSAGE_ID = "missing_stable_message_id"
REASON_UNSUPPORTED_MESSAGE_TYPE = "unsupported_message_type"

WHATSAPP_UNSUPPORTED_NON_TEXT_TYPES = frozenset({
    "image",
    "document",
    "audio",
    "video",
    "sticker",
    "location",
    "contacts",
    "contact",
})


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
    source_event_key: str | None = None


def should_block_user_input_without_stable_id(
    normalized: NormalizedUpdate,
    external_id: str | None,
) -> bool:
    """User input без stable id нельзя безопасно dedup/тарифицировать (Этап 5.3.1)."""
    if external_id:
        return False
    return _has_real_user_input(normalized)


def should_ignore_unsupported_inbound(
    channel_key: str,
    body: dict[str, Any],
    normalized: NormalizedUpdate,
) -> bool:
    """
    WhatsApp non-text inbound с stable id, но без поддерживаемого user input в runtime.

    Не тарифицируется и не запускает scenario runtime (Этап 5.3.2).
    """
    if channel_key != "whatsapp":
        return False
    if _has_real_user_input(normalized):
        return False
    msg_type = get_whatsapp_inbound_message_type(body)
    if not msg_type:
        return False
    return msg_type in WHATSAPP_UNSUPPORTED_NON_TEXT_TYPES


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


def _plan_base_messages_limit(summary) -> int:
    """Базовый лимит тарифа без addon/gift bonuses."""
    base = summary.messages_plan_base
    if base is None:
        return 0
    return max(0, int(base))


def check_and_consume_message_unit(
    db: Session,
    user_id: int,
    at: datetime | None = None,
    *,
    source_event_key: str | None = None,
) -> MessageLimitResult:
    """
    Проверить лимит и атомарно: UsageCounter.messages_used += 1 + FIFO ledger debit.

    Один commit на успех. Вызывать только для billable webhook-событий.
    """
    summary = get_user_tariff_limits(db, user_id, at=at)
    limit = summary.messages_limit
    event_key = (source_event_key or "").strip() or f"consume:{user_id}:{uuid4().hex}"

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
            source_event_key=None,
        )

    try:
        counter = _get_or_create_usage_counter(
            db,
            user_id,
            summary.period_start,
            summary.period_end,
            commit=False,
        )
        # Lock counter row for atomic pool + ledger.
        counter = (
            db.query(UsageCounter)
            .filter(UsageCounter.id == counter.id)
            .with_for_update()
            .one()
        )
        if int(counter.messages_used or 0) >= int(limit):
            db.commit()
            used = int(counter.messages_used or 0)
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
                source_event_key=None,
            )

        plan_base = _plan_base_messages_limit(summary)
        debit = fifo_debit_message_unit(
            db,
            user_id=int(user_id),
            source_event_key=event_key,
            period_start=summary.period_start,
            period_end=summary.period_end,
            plan_base_limit=plan_base,
            usage_counter_id=int(counter.id),
            at=at,
            pool_messages_used=int(counter.messages_used or 0),
        )

        if not debit.already_applied:
            stmt = (
                update(UsageCounter)
                .where(
                    UsageCounter.id == counter.id,
                    UsageCounter.messages_used < limit,
                )
                .values(messages_used=UsageCounter.messages_used + 1)
            )
            result = db.execute(stmt)
            if (result.rowcount or 0) != 1:
                db.rollback()
                used = int(counter.messages_used or 0)
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
                    source_event_key=None,
                )

        db.commit()
        db.refresh(counter)
        used = int(counter.messages_used or 0)
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
            source_event_key=event_key,
        )
    except AddonUsageLedgerError:
        db.rollback()
        # Fail closed: do not consume pool without ledger (or vice versa).
        summary2 = get_user_tariff_limits(db, user_id, at=at)
        used = int(summary2.messages_used or 0)
        return MessageLimitResult(
            allowed=False,
            blocked=True,
            billable=True,
            consumed=False,
            reason=REASON_MESSAGE_LIMIT_EXCEEDED,
            messages_used=used,
            messages_limit=limit,
            messages_remaining=max(0, int(limit) - used) if limit is not None else None,
            period_start=summary.period_start,
            period_end=summary.period_end,
            source_event_key=None,
        )
    except Exception:
        db.rollback()
        raise


def refund_message_unit(
    db: Session,
    user_id: int,
    period_start: datetime,
    period_end: datetime,
    *,
    source_event_key: str | None = None,
) -> None:
    """
    Компенсация: UsageCounter −1 и FIFO compensation в одной транзакции.
    """
    try:
        if source_event_key:
            fifo_compensate_message_unit(
                db, debit_source_event_key=source_event_key
            )

        counter = _find_usage_counter(db, user_id, period_start, period_end)
        if not counter:
            if source_event_key:
                db.commit()
            return
        counter = (
            db.query(UsageCounter)
            .filter(UsageCounter.id == counter.id)
            .with_for_update()
            .one()
        )
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
    except Exception:
        db.rollback()
        raise


def refund_consumed_message_unit(
    db: Session,
    user_id: int,
    limit_result: MessageLimitResult,
) -> None:
    """Refund только если consume реально увеличил счётчик (+ FIFO)."""
    if not (limit_result.allowed and limit_result.billable and limit_result.consumed):
        return
    if limit_result.period_start is None or limit_result.period_end is None:
        return
    refund_message_unit(
        db,
        user_id,
        limit_result.period_start,
        limit_result.period_end,
        source_event_key=limit_result.source_event_key,
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
    *,
    commit: bool = True,
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
        if commit:
            db.commit()
            db.refresh(counter)
            return counter
        with db.begin_nested():
            db.flush()
        db.refresh(counter)
        return counter
    except IntegrityError:
        if commit:
            db.rollback()
        found = _find_usage_counter(db, user_id, period_start, period_end)
        if found:
            return found
        raise
