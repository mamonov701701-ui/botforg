"""Запросы mini-CRM по ctor-боту (без N+1 на типовых списках)."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Sequence, Set, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models.constructor_core import (
    CtorBlock,
    CtorBotTag,
    CtorBotUser,
    CtorBotUserSession,
    CtorBotUserTag,
    CtorBotVariableDefinition,
    CtorScenario,
)
from backend.services.constructor.repositories.ctor_variables_repository import (
    CtorVariablesRepository,
)

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}")
CrmEnvironment = Literal["dev", "prod"]
CrmEnvironmentFilter = Literal["dev", "prod", "all"]


def _display_name(u: CtorBotUser) -> str:
    parts = [u.first_name or "", u.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    if name:
        return name
    if u.username:
        return u.username
    return u.external_user_id


def _extract_placeholder_keys_from_value(val: Any) -> Set[str]:
    if val is None:
        return set()
    try:
        s = json.dumps(val, ensure_ascii=False)
    except (TypeError, ValueError):
        s = str(val)
    return set(_PLACEHOLDER_RE.findall(s))


def build_variable_usage_maps(
    db: Session, ctor_bot_id: int
) -> Tuple[Dict[str, Set[int]], List[Tuple[int, int, str, str, Optional[str]]]]:
    """
    key -> set(block_id). Второй элемент: (block_id, scenario_id, scenario_name, block_type, block_name).
    """
    scenario_rows = (
        db.query(CtorScenario).filter(CtorScenario.bot_id == ctor_bot_id).all()
    )
    if not scenario_rows:
        return {}, []
    scenario_by_id = {s.id: s for s in scenario_rows}
    sid_list = list(scenario_by_id.keys())
    blocks = (
        db.query(CtorBlock).filter(CtorBlock.scenario_id.in_(sid_list)).all()
    )
    key_to_blocks: Dict[str, Set[int]] = defaultdict(set)
    meta: List[Tuple[int, int, str, str, Optional[str]]] = []
    for b in blocks:
        scen = scenario_by_id.get(b.scenario_id)
        scen_name = scen.name if scen else ""
        meta.append((b.id, b.scenario_id, scen_name, b.type, b.name))
        keys = _extract_placeholder_keys_from_value(b.settings_json)
        for k in keys:
            key_to_blocks[k].add(b.id)
    return dict(key_to_blocks), meta


@dataclass
class BotUserListRowOut:
    id: int
    display_name: str
    channel: str
    phone: Optional[str]
    email: Optional[str]
    tags: List[dict]
    last_message_at: Optional[str]
    current_scenario_id: Optional[int]
    current_scenario_name: Optional[str]
    current_block_id: Optional[int]
    current_block_label: Optional[str]
    session_status: Optional[str]
    environment: str
    created_at: str


def list_bot_users(
    db: Session,
    ctor_bot_id: int,
    *,
    q: Optional[str] = None,
    channel: Optional[str] = None,
    tag_keys: Optional[List[str]] = None,
    active_since: Optional[datetime] = None,
    active_until: Optional[datetime] = None,
    environment: CrmEnvironmentFilter = "prod",
    page: int = 1,
    page_size: int = 25,
) -> Tuple[int, List[BotUserListRowOut]]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    query = db.query(CtorBotUser).filter(CtorBotUser.bot_id == ctor_bot_id)
    if environment in ("dev", "prod"):
        query = query.filter(CtorBotUser.environment == environment)

    if channel:
        query = query.filter(CtorBotUser.channel == channel.strip())
    if active_since is not None:
        query = query.filter(
            CtorBotUser.last_message_at.isnot(None),
            CtorBotUser.last_message_at >= active_since,
        )
    if active_until is not None:
        query = query.filter(
            CtorBotUser.last_message_at.isnot(None),
            CtorBotUser.last_message_at <= active_until,
        )

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                CtorBotUser.first_name.ilike(term),
                CtorBotUser.last_name.ilike(term),
                CtorBotUser.username.ilike(term),
                CtorBotUser.phone.ilike(term),
                CtorBotUser.email.ilike(term),
                CtorBotUser.external_user_id.ilike(term),
            )
        )

    if tag_keys:
        clean_keys = [k.strip() for k in tag_keys if k and k.strip()]
        if clean_keys:
            sub = (
                db.query(CtorBotUserTag.bot_user_id)
                .join(CtorBotTag, CtorBotUserTag.tag_id == CtorBotTag.id)
                .filter(
                    CtorBotTag.bot_id == ctor_bot_id,
                    CtorBotTag.key.in_(clean_keys),
                )
                .distinct()
                .subquery()
            )
            query = query.filter(CtorBotUser.id.in_(sub))

    total = query.count()
    rows: Sequence[CtorBotUser] = (
        query.order_by(CtorBotUser.last_message_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    ids = [r.id for r in rows]
    if not ids:
        return total, []

    tags_by_user: Dict[int, List[dict]] = {i: [] for i in ids}
    tag_pairs = (
        db.query(CtorBotUserTag, CtorBotTag)
        .join(CtorBotTag, CtorBotUserTag.tag_id == CtorBotTag.id)
        .filter(CtorBotUserTag.bot_user_id.in_(ids))
        .all()
    )
    for link, tag in tag_pairs:
        tags_by_user[link.bot_user_id].append(
            {"key": tag.key, "label": tag.label, "color": tag.color}
        )

    sessions = (
        db.query(CtorBotUserSession)
        .filter(CtorBotUserSession.bot_user_id.in_(ids))
        .order_by(CtorBotUserSession.updated_at.desc())
        .all()
    )
    active_pick: Dict[int, CtorBotUserSession] = {}
    latest_pick: Dict[int, CtorBotUserSession] = {}
    for s in sessions:
        if s.bot_user_id not in latest_pick:
            latest_pick[s.bot_user_id] = s
        if s.status == "active" and s.bot_user_id not in active_pick:
            active_pick[s.bot_user_id] = s

    scenario_ids: Set[int] = set()
    block_ids: Set[int] = set()
    for s in list(active_pick.values()) + list(latest_pick.values()):
        scenario_ids.add(s.scenario_id)
        if s.current_block_id:
            block_ids.add(s.current_block_id)

    scen_by_id: Dict[int, CtorScenario] = {}
    if scenario_ids:
        for sc in (
            db.query(CtorScenario).filter(CtorScenario.id.in_(scenario_ids)).all()
        ):
            scen_by_id[sc.id] = sc
    block_by_id: Dict[int, CtorBlock] = {}
    if block_ids:
        for bl in db.query(CtorBlock).filter(CtorBlock.id.in_(block_ids)).all():
            block_by_id[bl.id] = bl

    out: List[BotUserListRowOut] = []
    for u in rows:
        sess = active_pick.get(u.id) or latest_pick.get(u.id)
        scen_name = None
        block_label = None
        s_st = None
        cur_sid = None
        cur_bid = None
        if sess:
            s_st = sess.status
            cur_sid = sess.scenario_id
            cur_bid = sess.current_block_id
            sc = scen_by_id.get(sess.scenario_id)
            if sc:
                scen_name = sc.name
            bl = block_by_id.get(sess.current_block_id) if sess.current_block_id else None
            if bl:
                block_label = bl.name or bl.type or str(bl.id)
        out.append(
            BotUserListRowOut(
                id=u.id,
                display_name=_display_name(u),
                channel=u.channel,
                phone=u.phone,
                email=u.email,
                tags=tags_by_user.get(u.id, []),
                last_message_at=u.last_message_at.isoformat()
                if u.last_message_at
                else None,
                current_scenario_id=cur_sid,
                current_scenario_name=scen_name,
                current_block_id=cur_bid,
                current_block_label=block_label,
                session_status=s_st,
                environment=u.environment,
                created_at=u.created_at.isoformat(),
            )
        )
    return total, out


def get_bot_user_for_ctor(
    db: Session, ctor_bot_id: int, bot_user_id: int, *, environment: CrmEnvironmentFilter = "prod"
) -> Optional[CtorBotUser]:
    query = db.query(CtorBotUser).filter(
        CtorBotUser.id == bot_user_id,
        CtorBotUser.bot_id == ctor_bot_id,
    )
    if environment in ("dev", "prod"):
        query = query.filter(CtorBotUser.environment == environment)
    return query.first()


def get_or_create_bot_user(
    db: Session,
    *,
    ctor_bot_id: int,
    channel: str,
    external_user_id: str,
    environment: CrmEnvironment,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    language_code: Optional[str] = None,
    commit: bool = True,
) -> CtorBotUser:
    user = (
        db.query(CtorBotUser)
        .filter(
            CtorBotUser.bot_id == ctor_bot_id,
            CtorBotUser.environment == environment,
            CtorBotUser.channel == channel,
            CtorBotUser.external_user_id == external_user_id,
        )
        .first()
    )
    if user:
        if username:
            user.username = username
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        if language_code:
            user.language_code = language_code
        if commit:
            db.commit()
            db.refresh(user)
        return user
    user = CtorBotUser(
        bot_id=ctor_bot_id,
        environment=environment,
        channel=channel,
        external_user_id=external_user_id,
        username=username,
        first_name=first_name,
        last_name=last_name,
        language_code=language_code,
        status="active",
    )
    db.add(user)
    if commit:
        db.commit()
        db.refresh(user)
    else:
        db.flush()
    return user


def list_variable_definitions_rows(
    db: Session,
    ctor_bot_id: int,
    *,
    include_archived: bool = False,
) -> List[CtorBotVariableDefinition]:
    repo = CtorVariablesRepository(db)
    rows = repo.list_definitions_for_bot(ctor_bot_id)
    if include_archived:
        return list(rows)
    return [r for r in rows if not r.is_archived]
