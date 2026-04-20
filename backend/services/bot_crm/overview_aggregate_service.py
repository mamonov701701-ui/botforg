from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Literal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from backend.models.constructor_core import (
    CtorBotTag,
    CtorBotUser,
    CtorBotUserSession,
    CtorBotUserTag,
    CtorCrmOverviewAggregate,
)
from backend.services.cache.redis_cache import add_dirty_aggregate

CrmEnv = Literal["dev", "prod", "all"]


def _apply_env_filter(query, environment: CrmEnv):
    if environment in ("dev", "prod"):
        return query.filter(CtorBotUser.environment == environment)
    return query


def mark_crm_overview_dirty(bot_id: int, environment: str) -> None:
    env = (environment or "").strip().lower()
    if env not in ("dev", "prod"):
        return
    add_dirty_aggregate(int(bot_id), env)
    add_dirty_aggregate(int(bot_id), "all")


def _trend(current: int, previous: int) -> dict:
    return {
        "current": int(current),
        "previous": int(previous),
        "delta": int(current) - int(previous),
    }


def compute_overview_payload(db: Session, *, bot_id: int, environment: CrmEnv) -> dict:
    now = datetime.utcnow()
    since_7d = now.replace(microsecond=0) - timedelta(days=7)
    since_30d = now.replace(microsecond=0) - timedelta(days=30)
    prev_since_7d = now.replace(microsecond=0) - timedelta(days=14)
    prev_since_30d = now.replace(microsecond=0) - timedelta(days=37)
    prev_until = since_7d

    users_q = db.query(CtorBotUser).filter(CtorBotUser.bot_id == bot_id)
    users_q = _apply_env_filter(users_q, environment)
    total_contacts = users_q.count()
    new_contacts_7d = users_q.filter(CtorBotUser.created_at >= since_7d).count()
    active_contacts_7d = users_q.filter(
        CtorBotUser.last_message_at.isnot(None),
        CtorBotUser.last_message_at >= since_7d,
    ).count()
    sleeping_contacts_7d = users_q.filter(
        or_(CtorBotUser.last_message_at.is_(None), CtorBotUser.last_message_at < since_7d)
    ).count()
    sleeping_contacts_30d = users_q.filter(
        or_(CtorBotUser.last_message_at.is_(None), CtorBotUser.last_message_at < since_30d)
    ).count()
    total_contacts_prev = users_q.filter(CtorBotUser.created_at < prev_until).count()
    new_contacts_7d_prev = users_q.filter(
        CtorBotUser.created_at >= prev_since_7d,
        CtorBotUser.created_at < prev_until,
    ).count()
    active_contacts_7d_prev = users_q.filter(
        CtorBotUser.last_message_at.isnot(None),
        CtorBotUser.last_message_at >= prev_since_7d,
        CtorBotUser.last_message_at < prev_until,
    ).count()
    sleeping_contacts_7d_prev = users_q.filter(
        CtorBotUser.created_at < prev_until,
        or_(CtorBotUser.last_message_at.is_(None), CtorBotUser.last_message_at < prev_since_7d),
    ).count()
    sleeping_contacts_30d_prev = users_q.filter(
        CtorBotUser.created_at < prev_until,
        or_(CtorBotUser.last_message_at.is_(None), CtorBotUser.last_message_at < prev_since_30d),
    ).count()

    non_empty_name = and_(CtorBotUser.first_name.isnot(None), CtorBotUser.first_name != "")
    non_empty_phone = and_(CtorBotUser.phone.isnot(None), CtorBotUser.phone != "")
    non_empty_email = and_(CtorBotUser.email.isnot(None), CtorBotUser.email != "")
    with_name = users_q.filter(non_empty_name).count()
    with_phone = users_q.filter(non_empty_phone).count()
    with_email = users_q.filter(non_empty_email).count()
    fully_filled = users_q.filter(non_empty_name, non_empty_phone, non_empty_email).count()

    tag_counts_q = (
        db.query(
            CtorBotTag.key,
            CtorBotTag.label,
            func.count(func.distinct(CtorBotUserTag.bot_user_id)).label("contacts_count"),
        )
        .join(CtorBotUserTag, CtorBotUserTag.tag_id == CtorBotTag.id)
        .join(CtorBotUser, CtorBotUser.id == CtorBotUserTag.bot_user_id)
        .filter(CtorBotTag.bot_id == bot_id, CtorBotUser.bot_id == bot_id)
    )
    if environment in ("dev", "prod"):
        tag_counts_q = tag_counts_q.filter(CtorBotUser.environment == environment)
    top_tags_rows = (
        tag_counts_q.group_by(CtorBotTag.id, CtorBotTag.key, CtorBotTag.label)
        .order_by(func.count(func.distinct(CtorBotUserTag.bot_user_id)).desc(), CtorBotTag.key.asc())
        .limit(5)
        .all()
    )
    top_tags = [
        {"key": str(key), "label": label, "contacts_count": int(c or 0)}
        for key, label, c in top_tags_rows
    ]

    status_q = db.query(CtorBotUser.status, func.count(CtorBotUser.id)).filter(
        CtorBotUser.bot_id == bot_id
    )
    status_q = _apply_env_filter(status_q, environment)
    status_rows = (
        status_q.group_by(CtorBotUser.status)
        .order_by(func.count(CtorBotUser.id).desc(), CtorBotUser.status.asc())
        .all()
    )
    statuses = [
        {"status": (status or "active"), "contacts_count": int(c or 0)}
        for status, c in status_rows
    ]

    scoped_user_subq = db.query(CtorBotUser.id).filter(CtorBotUser.bot_id == bot_id)
    if environment in ("dev", "prod"):
        scoped_user_subq = scoped_user_subq.filter(CtorBotUser.environment == environment)
    scoped_user_subq = scoped_user_subq.subquery()

    latest_session_subq = (
        db.query(
            CtorBotUserSession.bot_user_id.label("uid"),
            func.max(CtorBotUserSession.updated_at).label("mx"),
        )
        .filter(CtorBotUserSession.bot_user_id.in_(scoped_user_subq))
        .group_by(CtorBotUserSession.bot_user_id)
        .subquery()
    )
    latest_session_rows = (
        db.query(CtorBotUserSession.status, func.count(CtorBotUserSession.id))
        .join(
            latest_session_subq,
            and_(
                CtorBotUserSession.bot_user_id == latest_session_subq.c.uid,
                CtorBotUserSession.updated_at == latest_session_subq.c.mx,
            ),
        )
        .group_by(CtorBotUserSession.status)
        .all()
    )
    session_statuses = []
    in_progress = 0
    completed = 0
    for status, count in latest_session_rows:
        name = (status or "").strip() or "—"
        c = int(count or 0)
        session_statuses.append(
            {
                "name": name,
                "count": c,
                "dialog_param": "__none__" if name == "—" else name,
            }
        )
        ss = name.lower()
        if ss in ("active", "in_progress", "running"):
            in_progress += c
        elif ss in ("completed", "done", "finished", "closed"):
            completed += c
    session_statuses.sort(key=lambda row: (-int(row.get("count") or 0), str(row.get("name") or "")))

    return {
        "computed_at": now.replace(microsecond=0).isoformat(),
        "total_contacts": int(total_contacts),
        "new_contacts_7d": int(new_contacts_7d),
        "active_contacts_7d": int(active_contacts_7d),
        "sleeping_contacts_7d": int(sleeping_contacts_7d),
        "sleeping_contacts_30d": int(sleeping_contacts_30d),
        "profile_completeness": {
            "total_contacts": int(total_contacts),
            "with_name": int(with_name),
            "with_phone": int(with_phone),
            "with_email": int(with_email),
            "fully_filled": int(fully_filled),
        },
        "top_tags": top_tags,
        "statuses": statuses,
        "session_statuses": session_statuses,
        "scenario_progress": {
            "in_progress": int(in_progress),
            "completed": int(completed),
        },
        "trends": {
            "total_contacts": _trend(int(total_contacts), int(total_contacts_prev)),
            "new_contacts_7d": _trend(int(new_contacts_7d), int(new_contacts_7d_prev)),
            "active_contacts_7d": _trend(int(active_contacts_7d), int(active_contacts_7d_prev)),
            "sleeping_contacts_7d": _trend(
                int(sleeping_contacts_7d), int(sleeping_contacts_7d_prev)
            ),
            "sleeping_contacts_30d": _trend(
                int(sleeping_contacts_30d), int(sleeping_contacts_30d_prev)
            ),
        },
    }


def upsert_overview_aggregate(
    db: Session, *, bot_id: int, environment: CrmEnv, payload: dict
) -> CtorCrmOverviewAggregate:
    row = (
        db.query(CtorCrmOverviewAggregate)
        .filter(
            CtorCrmOverviewAggregate.bot_id == bot_id,
            CtorCrmOverviewAggregate.environment == environment,
        )
        .first()
    )
    if row is None:
        row = CtorCrmOverviewAggregate(
            bot_id=bot_id,
            environment=environment,
            payload_json=payload,
            computed_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.payload_json = payload
        row.computed_at = datetime.utcnow()
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def refresh_overview_aggregate(db: Session, *, bot_id: int, environment: CrmEnv) -> dict:
    payload = compute_overview_payload(db, bot_id=bot_id, environment=environment)
    upsert_overview_aggregate(db, bot_id=bot_id, environment=environment, payload=payload)
    return payload


def get_overview_aggregate_payload(
    db: Session, *, bot_id: int, environment: CrmEnv
) -> Dict | None:
    row = (
        db.query(CtorCrmOverviewAggregate)
        .filter(
            CtorCrmOverviewAggregate.bot_id == bot_id,
            CtorCrmOverviewAggregate.environment == environment,
        )
        .first()
    )
    if not row:
        return None
    payload = dict(row.payload_json or {})
    if "computed_at" not in payload:
        payload["computed_at"] = row.computed_at.isoformat()
    return payload
