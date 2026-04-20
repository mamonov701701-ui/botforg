"""Запросы mini-CRM по ctor-боту (без N+1 на типовых списках)."""

from __future__ import annotations

import json
import re
import zlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Sequence, Set, Tuple

from sqlalchemy import and_, asc, desc, func, literal, or_
from sqlalchemy.orm import Session, aliased

from backend.models.constructor_core import (
    CtorBlock,
    CtorBotTag,
    CtorBotUser,
    CtorBotUserSession,
    CtorBotUserTag,
    CtorBotUserVariable,
    CtorBotVariableDefinition,
    CtorScenario,
)
from backend.models.scenario import Scenario
from backend.services.constructor.repositories.ctor_variables_repository import (
    CtorVariablesRepository,
)
from backend.services.bot_crm.overview_aggregate_service import mark_crm_overview_dirty

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}")


def _extract_explicit_variable_keys_from_block(
    block_type: str, raw: Any
) -> Set[str]:
    """Ключи переменных из структурированных полей блока (не только {{...}} в JSON)."""
    out: Set[str] = set()
    if not isinstance(raw, dict):
        return out
    bt = (block_type or "").strip().lower()

    if bt == "input":
        for key in ("variable_key", "variableName", "name"):
            v = raw.get(key)
            if isinstance(v, str) and v.strip():
                out.add(v.strip())

    elif bt == "variable":
        v = raw.get("name")
        if isinstance(v, str) and v.strip():
            out.add(v.strip())

    elif bt == "action":
        mode = str(raw.get("mode") or "").strip()
        if mode == "field":
            fk = raw.get("fieldKey")
            if isinstance(fk, str) and fk.strip():
                out.add(fk.strip())
        sv = raw.get("setVariable")
        if isinstance(sv, str) and sv.strip():
            out.add(sv.strip())

    elif bt == "condition":
        v = raw.get("variable")
        if isinstance(v, str) and v.strip():
            out.add(v.strip())

    return out
CrmEnvironment = Literal["dev", "prod"]
CrmEnvironmentFilter = Literal["dev", "prod", "all"]
CrmUserListSort = Literal["activity", "name", "created"]
SESSION_STATUS_FILTER_NONE = "__none__"


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


def _synthetic_block_id(platform_scenario_id: int, editor_node_id: str) -> int:
    """Стабильный псевдо-id блока из редактора (не ctor_blocks). Диапазон > типичных автоинкрементов."""
    h = zlib.crc32(f"{platform_scenario_id}:{editor_node_id}".encode("utf-8")) & 0x7FFFFFFF
    return 1_000_000_000 + h


def _nodes_from_scenario_payload(content: Any) -> List[dict]:
    if not isinstance(content, dict):
        return []
    nodes = content.get("nodes")
    if not isinstance(nodes, list):
        return []
    return [n for n in nodes if isinstance(n, dict)]


def _merge_platform_scenario_graph_usage(
    db: Session,
    platform_bot_id: int,
    key_to_blocks: Dict[str, Set[int]],
    meta: List[Tuple[int, int, str, str, Optional[str]]],
) -> None:
    """
    Сценарии редактора лежат в scenarios.content / published_content.
    ctor_blocks часто пусты — без этого «На схеме» и usage дают 0.
    scenario_id здесь — id строки scenarios (платформа), имя — для UI.
    """
    scen_rows = db.query(Scenario).filter(Scenario.bot_id == platform_bot_id).all()
    for sc in scen_rows:
        payloads: List[dict] = []
        if isinstance(sc.content, dict) and sc.content.get("nodes"):
            payloads.append(sc.content)
        pub = sc.published_content
        if isinstance(pub, dict) and pub.get("nodes"):
            payloads.append(pub)
        nodes_by_id: Dict[str, List[dict]] = defaultdict(list)
        for content in payloads:
            for node in _nodes_from_scenario_payload(content):
                nid = str(node.get("id") or "").strip()
                if nid:
                    nodes_by_id[nid].append(node)
        for nid, variants in nodes_by_id.items():
            bid = _synthetic_block_id(sc.id, nid)
            block_type = "node"
            block_name: Optional[str] = None
            all_keys: Set[str] = set()
            for node in variants:
                data = node.get("data")
                if not isinstance(data, dict):
                    data = {}
                block_type = str(data.get("blockId") or node.get("type") or "").strip() or block_type
                for k in ("title", "label", "name"):
                    v = data.get(k)
                    if isinstance(v, str) and v.strip():
                        block_name = v.strip()
                        break
                settings = data.get("settings")
                all_keys |= _extract_placeholder_keys_from_value(settings)
                all_keys |= _extract_explicit_variable_keys_from_block(block_type, settings)
                # Текст сообщения часто лежит в data.text / title, не только в settings
                for fld in ("text", "title", "subtitle", "caption"):
                    v = data.get(fld)
                    all_keys |= _extract_placeholder_keys_from_value(v)
                all_keys |= _extract_placeholder_keys_from_value(data)
            if not all_keys:
                continue
            meta.append((bid, sc.id, sc.name or "", block_type, block_name))
            for k in all_keys:
                key_to_blocks[k].add(bid)


def build_variable_usage_maps(
    db: Session, ctor_bot_id: int
) -> Tuple[Dict[str, Set[int]], List[Tuple[int, int, str, str, Optional[str]]]]:
    """
    key -> set(block_id). Второй элемент: (block_id, scenario_id, scenario_name, block_type, block_name).
    block_id — либо ctor_blocks.id, либо синтетический id узла из scenarios.content.
    """
    key_to_blocks: Dict[str, Set[int]] = defaultdict(set)
    meta: List[Tuple[int, int, str, str, Optional[str]]] = []

    scenario_rows = (
        db.query(CtorScenario).filter(CtorScenario.bot_id == ctor_bot_id).all()
    )
    if scenario_rows:
        scenario_by_id = {s.id: s for s in scenario_rows}
        sid_list = list(scenario_by_id.keys())
        blocks = (
            db.query(CtorBlock).filter(CtorBlock.scenario_id.in_(sid_list)).all()
        )
        for b in blocks:
            scen = scenario_by_id.get(b.scenario_id)
            scen_name = scen.name if scen else ""
            meta.append((b.id, b.scenario_id, scen_name, b.type, b.name))
            keys = _extract_placeholder_keys_from_value(b.settings_json)
            keys |= _extract_explicit_variable_keys_from_block(b.type, b.settings_json)
            for k in keys:
                key_to_blocks[k].add(b.id)

    _merge_platform_scenario_graph_usage(db, ctor_bot_id, key_to_blocks, meta)

    return dict(key_to_blocks), meta


def count_users_with_nonempty_variable_by_key(
    db: Session,
    ctor_bot_id: int,
    *,
    environment: CrmEnvironmentFilter = "prod",
) -> Dict[str, int]:
    """Ключ переменной -> число контактов (distinct bot_user) с непустым значением."""
    text_nonempty = and_(
        CtorBotUserVariable.value_text.isnot(None),
        CtorBotUserVariable.value_text != "",
    )
    has_value = or_(
        text_nonempty,
        CtorBotUserVariable.value_number.isnot(None),
        CtorBotUserVariable.value_boolean.isnot(None),
        CtorBotUserVariable.value_date.isnot(None),
        CtorBotUserVariable.value_json.isnot(None),
    )
    q = (
        db.query(
            CtorBotVariableDefinition.key,
            func.count(func.distinct(CtorBotUserVariable.bot_user_id)),
        )
        .join(
            CtorBotUserVariable,
            CtorBotUserVariable.variable_definition_id == CtorBotVariableDefinition.id,
        )
        .join(CtorBotUser, CtorBotUser.id == CtorBotUserVariable.bot_user_id)
        .filter(CtorBotVariableDefinition.bot_id == ctor_bot_id)
        .filter(CtorBotUser.bot_id == ctor_bot_id)
        .filter(has_value)
    )
    if environment in ("dev", "prod"):
        q = q.filter(CtorBotUser.environment == environment)
    rows = q.group_by(CtorBotVariableDefinition.key).all()
    return {str(k): int(c or 0) for k, c in rows}


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
    contact_status: str
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
    contact_status: Optional[str] = None,
    session_status: Optional[str] = None,
    has_phone: Optional[bool] = None,
    has_email: Optional[bool] = None,
    sort: CrmUserListSort = "activity",
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

    if contact_status and contact_status.strip():
        query = query.filter(CtorBotUser.status == contact_status.strip())

    if has_phone is True:
        query = query.filter(
            CtorBotUser.phone.isnot(None),
            CtorBotUser.phone != "",
        )
    elif has_phone is False:
        query = query.filter(or_(CtorBotUser.phone.is_(None), CtorBotUser.phone == ""))

    if has_email is True:
        query = query.filter(
            CtorBotUser.email.isnot(None),
            CtorBotUser.email != "",
        )
    elif has_email is False:
        query = query.filter(or_(CtorBotUser.email.is_(None), CtorBotUser.email == ""))

    if q and q.strip():
        term = q.strip().lower()
        concat_expr = func.lower(
            func.coalesce(CtorBotUser.first_name, "")
            + literal(" ")
            + func.coalesce(CtorBotUser.last_name, "")
            + literal(" ")
            + func.coalesce(CtorBotUser.username, "")
            + literal(" ")
            + func.coalesce(CtorBotUser.phone, "")
            + literal(" ")
            + func.coalesce(CtorBotUser.email, "")
            + literal(" ")
            + func.coalesce(CtorBotUser.external_user_id, "")
        )
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            query = query.filter(concat_expr.op("%")(term))
        else:
            query = query.filter(concat_expr.like(f"%{term}%"))

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

    sess_join_alias = None
    mx_sub = None
    if session_status is not None and session_status.strip() != "":
        mx_sub = (
            db.query(
                CtorBotUserSession.bot_user_id.label("uid"),
                func.max(CtorBotUserSession.updated_at).label("mx"),
            )
            .group_by(CtorBotUserSession.bot_user_id)
            .subquery()
        )
        sess_join_alias = aliased(CtorBotUserSession)
        query = query.outerjoin(mx_sub, mx_sub.c.uid == CtorBotUser.id).outerjoin(
            sess_join_alias,
            and_(
                sess_join_alias.bot_user_id == mx_sub.c.uid,
                sess_join_alias.updated_at == mx_sub.c.mx,
            ),
        )
        ss = session_status.strip()
        if ss == SESSION_STATUS_FILTER_NONE:
            query = query.filter(
                or_(
                    mx_sub.c.uid.is_(None),
                    sess_join_alias.id.is_(None),
                    sess_join_alias.status.is_(None),
                    sess_join_alias.status == "",
                )
            )
        else:
            query = query.filter(sess_join_alias.status == ss)

    if sort == "name":
        query = query.order_by(
            asc(CtorBotUser.first_name).nullslast(),
            asc(CtorBotUser.username).nullslast(),
            asc(CtorBotUser.id),
        )
    elif sort == "created":
        query = query.order_by(desc(CtorBotUser.created_at))
    else:
        query = query.order_by(desc(CtorBotUser.last_message_at).nullslast(), desc(CtorBotUser.id))

    total = query.count()
    rows: Sequence[CtorBotUser] = (
        query.offset((page - 1) * page_size).limit(page_size).all()
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
                contact_status=u.status or "active",
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
        if username is not None:
            user.username = username
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if language_code is not None:
            user.language_code = language_code
        if commit:
            db.commit()
            db.refresh(user)
            mark_crm_overview_dirty(ctor_bot_id, environment)
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
        mark_crm_overview_dirty(ctor_bot_id, environment)
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
