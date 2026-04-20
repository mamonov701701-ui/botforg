"""Mini-CRM: пользователи ctor-бота, переменные, теги, события."""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional, Set, Tuple, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.constructor_core import (
    CtorBlock,
    CtorBotTag,
    CtorBotUser,
    CtorBotUserSession,
    CtorBotUserTag,
    CtorScenario,
)
from backend.models.user import User
from backend.services.bot_crm.contact_profile_sync import apply_contact_profile_from_variables
from backend.services.bot_crm.overview_aggregate_service import (
    get_overview_aggregate_payload,
    mark_crm_overview_dirty,
    refresh_overview_aggregate,
)
from backend.services.cache.redis_cache import get_or_build_json
from backend.services.bot_crm.crm_service import (
    BotUserListRowOut,
    CrmEnvironmentFilter,
    CrmUserListSort,
    build_variable_usage_maps,
    count_users_with_nonempty_variable_by_key,
    get_or_create_bot_user,
    get_bot_user_for_ctor,
    list_bot_users,
    list_variable_definitions_rows,
)
from backend.services.constructor.dto import TagDefinitionOptions, UserVariableView, VariableDefinitionOptions
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.repositories.ctor_tags_repository import CtorTagsRepository
from backend.services.constructor.repositories.ctor_variables_repository import CtorVariablesRepository
from backend.services.constructor.tag_service import TagService
from backend.services.constructor.validation import validate_snake_case_key, validate_tag_key
from backend.services.constructor.variable_service import VariableService
from backend.utils.bot_access import check_bot_access, check_bot_edit_permission
from backend.utils.ctor_bot_resolve import ensure_ctor_bot_id, resolve_ctor_bot_id

router = APIRouter(prefix="/{bot_id}/crm", tags=["bot-crm"])
logger = logging.getLogger(__name__)


def _scenario_counts_from_usage(
    usage_map: Dict[str, Set[int]], meta: List[Tuple[int, int, str, str, Optional[str]]]
) -> Dict[str, int]:
    meta_by_block = {m[0]: m for m in meta}
    counts: Dict[str, int] = {}
    for key, bids in usage_map.items():
        sids: Set[int] = set()
        for bid in bids:
            m = meta_by_block.get(bid)
            if m:
                sids.add(m[1])
        counts[key] = len(sids)
    return counts

SNAKE_MSG = "ключ только snake_case: латиница, цифры, подчёркивание, с буквы"
TAG_KEY_MSG = "некорректный ключ тега: буква в начале, далее буквы, цифры и _"
SESSION_STATUS_FILTER_NONE = "__none__"


def _ctor_dep(bot_id: int, db: Session, user: User) -> int:
    check_bot_access(bot_id, user.id, db)
    cid = ensure_ctor_bot_id(db, bot_id) or resolve_ctor_bot_id(db, bot_id)
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Constructor bot is not linked to this platform bot",
        )
    return cid


def _ctor_dep_optional(bot_id: int, db: Session, user: User) -> Optional[int]:
    check_bot_access(bot_id, user.id, db)
    return ensure_ctor_bot_id(db, bot_id) or resolve_ctor_bot_id(db, bot_id)


def _require_write(bot_id: int, db: Session, user: User) -> None:
    bot = check_bot_access(bot_id, user.id, db)
    if not check_bot_edit_permission(bot, user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No edit access")


def _serialize_variable_value(v: UserVariableView) -> Any:
    if v.value_text is not None:
        return v.value_text
    if v.value_number is not None:
        return float(v.value_number)
    if v.value_boolean is not None:
        return v.value_boolean
    if v.value_date is not None:
        return v.value_date.isoformat()
    if v.value_json is not None:
        return v.value_json
    return None


class TagBrief(BaseModel):
    key: str
    label: Optional[str] = None
    color: Optional[str] = None


class BotUserListItemOut(BaseModel):
    id: int
    display_name: str
    channel: str
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: List[TagBrief] = Field(default_factory=list)
    last_message_at: Optional[str] = None
    current_scenario_id: Optional[int] = None
    current_scenario_name: Optional[str] = None
    current_block_id: Optional[int] = None
    current_block_label: Optional[str] = None
    session_status: Optional[str] = None
    contact_status: str = "active"
    environment: str
    created_at: str


class BotUserListOut(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[BotUserListItemOut]


class SessionOut(BaseModel):
    id: int
    scenario_id: int
    scenario_name: Optional[str] = None
    current_block_id: Optional[int] = None
    current_block_label: Optional[str] = None
    status: str
    updated_at: str
    started_at: str


class BotUserDetailOut(BaseModel):
    id: int
    bot_id: int
    channel: str
    external_user_id: str
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    language_code: Optional[str] = None
    status: str
    environment: str
    last_message_at: Optional[str] = None
    created_at: str
    updated_at: str
    display_name: str
    session: Optional[SessionOut] = None


class UserVariableRowOut(BaseModel):
    key: str
    definition_id: int
    data_type: str
    scope: str
    is_system: bool
    value: Any = None


class EventRowOut(BaseModel):
    id: int
    event_type: str
    created_at: str
    session_id: Optional[int] = None
    scenario_id: Optional[int] = None
    block_id: Optional[int] = None
    payload_json: Optional[dict] = None


class MessagesStubOut(BaseModel):
    available: bool = False
    items: List[dict] = Field(default_factory=list)


class VariableDefRowOut(BaseModel):
    id: int
    key: str
    label: Optional[str] = None
    data_type: str
    is_system: bool
    is_archived: bool
    used_in_blocks_count: int = 0
    used_in_scenarios_count: int = 0
    contacts_with_value_count: int = 0
    updated_at: str


class VariableUsageRef(BaseModel):
    block_id: int
    scenario_id: int
    scenario_name: str
    block_type: str
    block_name: Optional[str] = None


class TagDefRowOut(BaseModel):
    id: int
    key: str
    label: Optional[str] = None
    color: Optional[str] = None
    users_count: int = 0
    updated_at: str


class CrmOverviewTagRow(BaseModel):
    key: str
    label: Optional[str] = None
    contacts_count: int


class CrmOverviewStatusRow(BaseModel):
    status: str
    contacts_count: int


class CrmOverviewProfileCompleteness(BaseModel):
    total_contacts: int
    with_name: int
    with_phone: int
    with_email: int
    fully_filled: int


class CrmOverviewScenarioProgress(BaseModel):
    in_progress: int
    completed: int


class CrmOverviewTrendValue(BaseModel):
    current: int
    previous: int
    delta: int


class CrmOverviewTrends(BaseModel):
    total_contacts: CrmOverviewTrendValue
    new_contacts_7d: CrmOverviewTrendValue
    active_contacts_7d: CrmOverviewTrendValue
    sleeping_contacts_7d: CrmOverviewTrendValue
    sleeping_contacts_30d: CrmOverviewTrendValue


class CrmOverviewOut(BaseModel):
    total_contacts: int
    new_contacts_7d: int
    active_contacts_7d: int
    sleeping_contacts_7d: int
    sleeping_contacts_30d: int
    profile_completeness: CrmOverviewProfileCompleteness
    top_tags: List[CrmOverviewTagRow] = Field(default_factory=list)
    statuses: List[CrmOverviewStatusRow] = Field(default_factory=list)
    session_statuses: List["CrmStatusSummaryRow"] = Field(default_factory=list)
    scenario_progress: CrmOverviewScenarioProgress
    trends: CrmOverviewTrends


class CrmStatusSummaryRow(BaseModel):
    name: str
    count: int
    dialog_param: Optional[str] = None


class CrmStatusesSummaryOut(BaseModel):
    contact_statuses: List[CrmStatusSummaryRow] = Field(default_factory=list)
    session_statuses: List[CrmStatusSummaryRow] = Field(default_factory=list)


class SnakeKeyMixin(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def key_snake(cls, v: str) -> str:
        msg = validate_snake_case_key(v.strip())
        if msg:
            raise ValueError(SNAKE_MSG)
        return v.strip()


class TagKeyMixin(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def key_tag(cls, v: str) -> str:
        msg = validate_tag_key(v.strip())
        if msg:
            raise ValueError(TAG_KEY_MSG)
        return v.strip()


class VariableCreateBody(SnakeKeyMixin):
    label: Optional[str] = None
    data_type: str = "string"
    scope: str = "session"
    description: Optional[str] = None


class VariablePatchBody(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    data_type: Optional[str] = None
    is_archived: Optional[bool] = None


class TagCreateBody(TagKeyMixin):
    label: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class TagPatchBody(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class UserVariableSetBody(BaseModel):
    key: str
    value: Any

    @field_validator("key")
    @classmethod
    def key_snake(cls, v: str) -> str:
        msg = validate_snake_case_key(v.strip())
        if msg:
            raise ValueError(SNAKE_MSG)
        return v.strip()


class UserTagBody(TagKeyMixin):
    pass


class PreviewSyncBody(BaseModel):
    external_user_id: str
    channel: str = "preview"
    first_name: Optional[str] = None
    username: Optional[str] = None
    last_input: Optional[str] = None
    variables: dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    status_value: Optional[str] = None
    """Если True — применить status_value к полю контакта (в т.ч. пустая строка → active)."""
    status_patch: bool = False


def _user_rows_to_list_out(
    total: int, page: int, page_size: int, rows: List[BotUserListRowOut]
) -> BotUserListOut:
    return BotUserListOut(
        total=total,
        page=page,
        page_size=page_size,
        items=[
            BotUserListItemOut(
                id=r.id,
                display_name=r.display_name,
                channel=r.channel,
                phone=r.phone,
                email=r.email,
                tags=[TagBrief.model_validate(t) for t in r.tags],
                last_message_at=r.last_message_at,
                current_scenario_id=r.current_scenario_id,
                current_scenario_name=r.current_scenario_name,
                current_block_id=r.current_block_id,
                current_block_label=r.current_block_label,
                session_status=r.session_status,
                contact_status=r.contact_status,
                environment=r.environment,
                created_at=r.created_at,
            )
            for r in rows
        ],
    )


def _apply_environment_filter(query, environment: CrmEnvironmentFilter):
    if environment in ("dev", "prod"):
        query = query.filter(CtorBotUser.environment == environment)
    return query


@router.get("/users", response_model=BotUserListOut)
def crm_list_users(
    bot_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: Optional[str] = None,
    channel: Optional[str] = None,
    tag_keys: Optional[str] = Query(
        None, description="Список ключей тегов через запятую"
    ),
    active_since: Optional[datetime] = None,
    active_until: Optional[datetime] = None,
    contact_status: Optional[str] = Query(
        None, description="Точное значение статуса контакта (CtorBotUser.status)"
    ),
    session_status: Optional[str] = Query(
        None,
        description="Статус последней сессии; для «без статуса» передайте __none__",
    ),
    has_phone: Optional[bool] = Query(None, description="true — только с телефоном"),
    has_email: Optional[bool] = Query(None, description="true — только с email"),
    sort: str = Query(
        "activity",
        description="activity | name | created",
    ),
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep_optional(bot_id, db, user)
    if not ctor_id:
        return BotUserListOut(total=0, page=page, page_size=page_size, items=[])
    tk = [t.strip() for t in tag_keys.split(",")] if tag_keys else None
    sort_norm = cast(
        CrmUserListSort, sort if sort in ("activity", "name", "created") else "activity"
    )
    total, rows = list_bot_users(
        db,
        ctor_id,
        q=q,
        channel=channel,
        tag_keys=tk,
        active_since=active_since,
        active_until=active_until,
        environment=environment,
        page=page,
        page_size=page_size,
        contact_status=contact_status.strip() if contact_status and contact_status.strip() else None,
        session_status=session_status.strip() if session_status and session_status.strip() else None,
        has_phone=has_phone,
        has_email=has_email,
        sort=sort_norm,
    )
    return _user_rows_to_list_out(total, page, page_size, rows)


@router.get("/overview", response_model=CrmOverviewOut)
def crm_overview(
    bot_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep_optional(bot_id, db, user)
    if not ctor_id:
        return CrmOverviewOut(
            total_contacts=0,
            new_contacts_7d=0,
            active_contacts_7d=0,
            sleeping_contacts_7d=0,
            sleeping_contacts_30d=0,
            profile_completeness=CrmOverviewProfileCompleteness(
                total_contacts=0,
                with_name=0,
                with_phone=0,
                with_email=0,
                fully_filled=0,
            ),
            top_tags=[],
            statuses=[],
            scenario_progress=CrmOverviewScenarioProgress(in_progress=0, completed=0),
            trends=CrmOverviewTrends(
                total_contacts=CrmOverviewTrendValue(current=0, previous=0, delta=0),
                new_contacts_7d=CrmOverviewTrendValue(current=0, previous=0, delta=0),
                active_contacts_7d=CrmOverviewTrendValue(current=0, previous=0, delta=0),
                sleeping_contacts_7d=CrmOverviewTrendValue(current=0, previous=0, delta=0),
                sleeping_contacts_30d=CrmOverviewTrendValue(current=0, previous=0, delta=0),
            ),
        )
    env = environment if environment in ("dev", "prod", "all") else "prod"
    cache_key = f"crm:overview:v2:{ctor_id}:{env}"

    def _load_payload() -> dict:
        payload = get_overview_aggregate_payload(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]
        if payload is None:
            logger.info(
                "crm_overview_build_path event=on_demand_build bot_id=%s environment=%s cache_key=%s",
                ctor_id,
                env,
                cache_key,
            )
            mark_crm_overview_dirty(ctor_id, "dev")
            mark_crm_overview_dirty(ctor_id, "prod")
            payload = refresh_overview_aggregate(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]
        else:
            logger.info(
                "crm_overview_build_path event=snapshot_hit bot_id=%s environment=%s cache_key=%s",
                ctor_id,
                env,
                cache_key,
            )
        return payload

    try:
        payload = get_or_build_json(
            cache_key,
            ttl_seconds=45,
            lock_ttl_seconds=8,
            builder=_load_payload,
        )
    except Exception:
        # Runtime fail-safe: never mask overview by a temporary cache/build issue.
        logger.exception(
            "crm_overview_build_path event=builder_failure bot_id=%s environment=%s cache_key=%s",
            ctor_id,
            env,
            cache_key,
        )
        payload = refresh_overview_aggregate(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]
    return CrmOverviewOut.model_validate(payload)


def _pick_session(db: Session, bot_user_id: int) -> Optional[CtorBotUserSession]:
    active = (
        db.query(CtorBotUserSession)
        .filter(
            CtorBotUserSession.bot_user_id == bot_user_id,
            CtorBotUserSession.status == "active",
        )
        .order_by(CtorBotUserSession.updated_at.desc())
        .first()
    )
    if active:
        return active
    return (
        db.query(CtorBotUserSession)
        .filter(CtorBotUserSession.bot_user_id == bot_user_id)
        .order_by(CtorBotUserSession.updated_at.desc())
        .first()
    )


@router.get("/users/{bot_user_id}", response_model=BotUserDetailOut)
def crm_user_detail(
    bot_id: int,
    bot_user_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    u = get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    from backend.services.bot_crm.crm_service import _display_name

    sess = _pick_session(db, bot_user_id)
    sess_out = None
    if sess:
        scen = db.query(CtorScenario).filter(CtorScenario.id == sess.scenario_id).first()
        bl = (
            db.query(CtorBlock).filter(CtorBlock.id == sess.current_block_id).first()
            if sess.current_block_id
            else None
        )
        sess_out = SessionOut(
            id=sess.id,
            scenario_id=sess.scenario_id,
            scenario_name=scen.name if scen else None,
            current_block_id=sess.current_block_id,
            current_block_label=((bl.name or bl.type) if bl else None),
            status=sess.status,
            updated_at=sess.updated_at.isoformat(),
            started_at=sess.started_at.isoformat(),
        )
    return BotUserDetailOut(
        id=u.id,
        bot_id=u.bot_id,
        channel=u.channel,
        external_user_id=u.external_user_id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        phone=u.phone,
        email=u.email,
        language_code=u.language_code,
        status=u.status,
        environment=u.environment,
        last_message_at=u.last_message_at.isoformat() if u.last_message_at else None,
        created_at=u.created_at.isoformat(),
        updated_at=u.updated_at.isoformat(),
        display_name=_display_name(u),
        session=sess_out,
    )


@router.get("/users/{bot_user_id}/variables", response_model=List[UserVariableRowOut])
def crm_user_variables(
    bot_id: int,
    bot_user_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    vs = VariableService(db)
    res = vs.get_user_variables(bot_user_id)
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=res.error or "variables")
    out = []
    for v in res.data:
        out.append(
            UserVariableRowOut(
                key=v.key,
                definition_id=v.definition_id,
                data_type=v.data_type,
                scope=v.scope,
                is_system=v.is_system,
                value=_serialize_variable_value(v),
            )
        )
    return out


@router.put("/users/{bot_user_id}/variables", response_model=UserVariableRowOut)
def crm_set_user_variable(
    bot_id: int,
    bot_user_id: int,
    body: UserVariableSetBody,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    vs = VariableService(db)
    res = vs.set_user_variable(bot_user_id, body.key, body.value, commit=True)
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=getattr(res, "error", None) or "set variable")
    v = res.data
    return UserVariableRowOut(
        key=v.key,
        definition_id=v.definition_id,
        data_type=v.data_type,
        scope=v.scope,
        is_system=v.is_system,
        value=_serialize_variable_value(v),
    )


@router.get("/users/{bot_user_id}/tags", response_model=List[dict])
def crm_user_tags(
    bot_id: int,
    bot_user_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    ts = TagService(db)
    res = ts.get_user_tags(bot_user_id)
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=res.error)
    return [
        {"id": t.id, "key": t.key, "label": t.label, "color": t.color}
        for t in res.data
    ]


@router.post("/users/{bot_user_id}/tags", status_code=status.HTTP_204_NO_CONTENT)
def crm_add_user_tag(
    bot_id: int,
    bot_user_id: int,
    body: UserTagBody,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    ts = TagService(db)
    res = ts.add_tag_to_user(
        bot_user_id, body.key, assigned_by=f"user:{user.id}", commit=True
    )
    if not res.ok:
        raise HTTPException(status_code=400, detail=res.error)
    return None


@router.delete("/users/{bot_user_id}/tags/{tag_key:path}", status_code=status.HTTP_204_NO_CONTENT)
def crm_remove_user_tag(
    bot_id: int,
    bot_user_id: int,
    tag_key: str,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    msg = validate_tag_key(tag_key.strip())
    if msg:
        raise HTTPException(status_code=400, detail=TAG_KEY_MSG)
    ts = TagService(db)
    res = ts.remove_tag_from_user(bot_user_id, tag_key.strip(), commit=True)
    if not res.ok:
        code = 404 if res.error and "нет" in str(res.error) else 400
        raise HTTPException(status_code=code, detail=res.error)
    return None


@router.get("/users/{bot_user_id}/events", response_model=List[EventRowOut])
def crm_user_events(
    bot_id: int,
    bot_user_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    ev = EventLogService(db)
    from backend.services.constructor.dto import EventFilters

    res = ev.get_user_events(
        bot_user_id,
        EventFilters(limit=limit, offset=offset),
    )
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=res.error)
    return [
        EventRowOut(
            id=e.id,
            event_type=e.event_type,
            created_at=e.created_at.isoformat(),
            session_id=e.session_id,
            scenario_id=e.scenario_id,
            block_id=e.block_id,
            payload_json=e.payload_json,
        )
        for e in res.data
    ]


@router.get("/users/{bot_user_id}/messages", response_model=MessagesStubOut)
def crm_user_messages(
    bot_id: int,
    bot_user_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id, environment=environment):
        raise HTTPException(status_code=404, detail="User not found")
    return MessagesStubOut(available=False, items=[])


@router.get("/statuses/summary", response_model=CrmStatusesSummaryOut)
def crm_statuses_summary(
    bot_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep_optional(bot_id, db, user)
    if not ctor_id:
        return CrmStatusesSummaryOut(contact_statuses=[], session_statuses=[])
    env = environment if environment in ("dev", "prod", "all") else "prod"
    payload = get_overview_aggregate_payload(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]
    if payload is None:
        mark_crm_overview_dirty(ctor_id, "dev")
        mark_crm_overview_dirty(ctor_id, "prod")
        payload = refresh_overview_aggregate(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]
    elif not isinstance(payload, dict):
        payload = refresh_overview_aggregate(db, bot_id=ctor_id, environment=env)  # type: ignore[arg-type]

    contact_rows = payload.get("statuses") or []
    contact_statuses = [
        CrmStatusSummaryRow(
            name=(str(row.get("status") or "active")),
            count=int(row.get("contacts_count") or 0),
        )
        for row in contact_rows
    ]
    session_rows = payload.get("session_statuses") or []
    session_statuses = [
        CrmStatusSummaryRow(
            name=str(row.get("name") or "—"),
            count=int(row.get("count") or 0),
            dialog_param=(
                str(row.get("dialog_param"))
                if row.get("dialog_param") is not None
                else (SESSION_STATUS_FILTER_NONE if str(row.get("name") or "—") == "—" else str(row.get("name") or "—"))
            ),
        )
        for row in session_rows
    ]
    return CrmStatusesSummaryOut(contact_statuses=contact_statuses, session_statuses=session_statuses)


@router.get("/variables", response_model=List[VariableDefRowOut])
def crm_list_variable_defs(
    bot_id: int,
    include_archived: bool = Query(False),
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep_optional(bot_id, db, user)
    if not ctor_id:
        return []
    usage_map, meta = build_variable_usage_maps(db, ctor_id)
    scen_counts = _scenario_counts_from_usage(usage_map, meta)
    value_counts = count_users_with_nonempty_variable_by_key(
        db, ctor_id, environment=environment
    )
    rows = list_variable_definitions_rows(db, ctor_id, include_archived=include_archived)
    return [
        VariableDefRowOut(
            id=r.id,
            key=r.key,
            label=r.label,
            data_type=r.data_type,
            is_system=r.is_system,
            is_archived=r.is_archived,
            used_in_blocks_count=len(usage_map.get(r.key, set())),
            used_in_scenarios_count=int(scen_counts.get(r.key, 0)),
            contacts_with_value_count=int(value_counts.get(r.key, 0)),
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


@router.get("/variables/{var_key:path}/usage", response_model=List[VariableUsageRef])
def crm_variable_usage(
    bot_id: int,
    var_key: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_snake_case_key(var_key.strip()):
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
    usage_map, meta = build_variable_usage_maps(db, ctor_id)
    bids = usage_map.get(var_key.strip(), set())
    if not bids:
        return []
    meta_by_block = {m[0]: m for m in meta}
    out = []
    for bid in sorted(bids):
        m = meta_by_block.get(bid)
        if m:
            out.append(
                VariableUsageRef(
                    block_id=m[0],
                    scenario_id=m[1],
                    scenario_name=m[2],
                    block_type=m[3],
                    block_name=m[4],
                )
            )
    out.sort(key=lambda r: (r.scenario_name.lower(), str(r.block_type), r.block_name or ""))
    return out


@router.post("/variables", response_model=VariableDefRowOut, status_code=status.HTTP_201_CREATED)
def crm_create_variable(
    bot_id: int,
    body: VariableCreateBody,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    vs = VariableService(db)
    res = vs.ensure_variable_definition(
        ctor_id,
        body.key,
        VariableDefinitionOptions(
            label=body.label,
            data_type=body.data_type,
            scope=body.scope,
            description=body.description,
        ),
        commit=True,
    )
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=getattr(res, "error", None) or "create")
    r = res.data
    usage_map, meta = build_variable_usage_maps(db, ctor_id)
    scen_counts = _scenario_counts_from_usage(usage_map, meta)
    vc = count_users_with_nonempty_variable_by_key(db, ctor_id, environment=environment)
    return VariableDefRowOut(
        id=r.id,
        key=r.key,
        label=r.label,
        data_type=r.data_type,
        is_system=r.is_system,
        is_archived=r.is_archived,
        used_in_blocks_count=len(usage_map.get(r.key, set())),
        used_in_scenarios_count=int(scen_counts.get(r.key, 0)),
        contacts_with_value_count=int(vc.get(r.key, 0)),
        updated_at=r.updated_at.isoformat(),
    )


@router.patch("/variables/{var_key:path}", response_model=VariableDefRowOut)
def crm_patch_variable(
    bot_id: int,
    var_key: str,
    body: VariablePatchBody,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_snake_case_key(var_key.strip()):
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
    repo = CtorVariablesRepository(db)
    row = repo.get_definition_by_bot_and_key(ctor_id, var_key.strip())
    if not row:
        raise HTTPException(status_code=404, detail="Variable definition not found")
    if body.label is not None:
        row.label = body.label
    if body.description is not None:
        row.description = body.description
    if body.data_type is not None:
        if row.is_system:
            raise HTTPException(status_code=400, detail="Cannot change data_type of system variable")
        row.data_type = body.data_type
    if body.is_archived is not None:
        if row.is_system and body.is_archived:
            raise HTTPException(status_code=400, detail="Cannot archive system variable")
        row.is_archived = body.is_archived
    db.commit()
    db.refresh(row)
    usage_map, meta = build_variable_usage_maps(db, ctor_id)
    scen_counts = _scenario_counts_from_usage(usage_map, meta)
    vc = count_users_with_nonempty_variable_by_key(db, ctor_id, environment=environment)
    return VariableDefRowOut(
        id=row.id,
        key=row.key,
        label=row.label,
        data_type=row.data_type,
        is_system=row.is_system,
        is_archived=row.is_archived,
        used_in_blocks_count=len(usage_map.get(row.key, set())),
        used_in_scenarios_count=int(scen_counts.get(row.key, 0)),
        contacts_with_value_count=int(vc.get(row.key, 0)),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/tags", response_model=List[TagDefRowOut])
def crm_list_tags(
    bot_id: int,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep_optional(bot_id, db, user)
    if not ctor_id:
        return []
    repo = CtorTagsRepository(db)
    rows = repo.list_tags_for_bot(ctor_id)
    if not rows:
        return []
    counts_query = (
        db.query(CtorBotUserTag.tag_id, func.count(CtorBotUserTag.id))
        .join(CtorBotUser, CtorBotUser.id == CtorBotUserTag.bot_user_id)
        .filter(CtorBotUser.bot_id == ctor_id)
        .filter(CtorBotUserTag.tag_id.in_([r.id for r in rows]))
    )
    if environment in ("dev", "prod"):
        counts_query = counts_query.filter(CtorBotUser.environment == environment)
    counts = counts_query.group_by(CtorBotUserTag.tag_id).all()
    cnt_map = {tid: c for tid, c in counts}
    return [
        TagDefRowOut(
            id=r.id,
            key=r.key,
            label=r.label,
            color=r.color,
            users_count=int(cnt_map.get(r.id, 0)),
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/tags", response_model=TagDefRowOut, status_code=status.HTTP_201_CREATED)
def crm_create_tag(
    bot_id: int,
    body: TagCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    ts = TagService(db)
    res = ts.ensure_tag_definition(
        ctor_id,
        body.key,
        TagDefinitionOptions(
            label=body.label, color=body.color, description=body.description
        ),
        commit=True,
    )
    if not res.ok or res.data is None:
        raise HTTPException(status_code=400, detail=getattr(res, "error", None) or "create tag")
    r = res.data
    mark_crm_overview_dirty(ctor_id, "dev")
    mark_crm_overview_dirty(ctor_id, "prod")
    return TagDefRowOut(
        id=r.id,
        key=r.key,
        label=r.label,
        color=r.color,
        users_count=0,
        updated_at=r.updated_at.isoformat(),
    )


@router.patch("/tags/{tag_key:path}", response_model=TagDefRowOut)
def crm_patch_tag(
    bot_id: int,
    tag_key: str,
    body: TagPatchBody,
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_tag_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=TAG_KEY_MSG)
    repo = CtorTagsRepository(db)
    row = repo.get_tag_by_bot_and_key(ctor_id, tag_key.strip())
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if body.label is not None:
        row.label = body.label
    if body.color is not None:
        row.color = body.color
    if body.description is not None:
        row.description = body.description
    db.commit()
    db.refresh(row)
    mark_crm_overview_dirty(ctor_id, "dev")
    mark_crm_overview_dirty(ctor_id, "prod")
    uc = repo.count_users_for_tag(row.id, environment=environment)
    return TagDefRowOut(
        id=row.id,
        key=row.key,
        label=row.label,
        color=row.color,
        users_count=uc,
        updated_at=row.updated_at.isoformat(),
    )


@router.delete("/tags/{tag_key:path}", status_code=status.HTTP_204_NO_CONTENT)
def crm_delete_tag(
    bot_id: int,
    tag_key: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_tag_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=TAG_KEY_MSG)
    repo = CtorTagsRepository(db)
    row = repo.get_tag_by_bot_and_key(ctor_id, tag_key.strip())
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if repo.count_users_for_tag(row.id) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tag is assigned to users; remove from users first",
        )
    repo.delete_tag_row(row)
    db.commit()
    mark_crm_overview_dirty(ctor_id, "dev")
    mark_crm_overview_dirty(ctor_id, "prod")
    return None


@router.get("/tags/{tag_key:path}/users", response_model=BotUserListOut)
def crm_users_by_tag(
    bot_id: int,
    tag_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    environment: CrmEnvironmentFilter = Query("prod"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_tag_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=TAG_KEY_MSG)
    total, rows = list_bot_users(
        db,
        ctor_id,
        tag_keys=[tag_key.strip()],
        environment=environment,
        page=page,
        page_size=page_size,
    )
    return _user_rows_to_list_out(total, page, page_size, rows)


@router.post("/preview-sync", status_code=status.HTTP_204_NO_CONTENT)
def crm_preview_sync(
    bot_id: int,
    body: PreviewSyncBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    external = body.external_user_id.strip()
    if not external:
        raise HTTPException(status_code=400, detail="external_user_id is required")
    channel = (body.channel or "preview").strip() or "preview"
    bu = get_or_create_bot_user(
        db,
        ctor_bot_id=ctor_id,
        channel=channel,
        external_user_id=external,
        environment="dev",
        username=body.username,
        first_name=body.first_name,
        commit=True,
    )
    vs = VariableService(db)
    if body.last_input is not None:
        vs.set_user_variable(bu.id, "last_input", body.last_input, commit=True)
        db.commit()
    merged_vars: dict[str, Any] = dict(body.variables or {})
    for key, value in (body.variables or {}).items():
        if not isinstance(key, str):
            continue
        k = key.strip()
        if not k:
            continue
        if validate_snake_case_key(k):
            continue
        vs.set_user_variable(bu.id, k, value, commit=True)
    if apply_contact_profile_from_variables(
        bu, merged_vars, explicit_first_name=body.first_name
    ):
        db.add(bu)
    if body.status_patch:
        s = (body.status_value or "").strip()
        bu.status = s if s else "active"
        db.add(bu)
    db.commit()
    db.refresh(bu)
    mark_crm_overview_dirty(ctor_id, "dev")
    ts = TagService(db)
    for tag in body.tags or []:
        t = (tag or "").strip()
        if not t:
            continue
        if validate_tag_key(t):
            continue
        ts.add_tag_to_user(bu.id, t, assigned_by=f"user:{user.id}", commit=True)
    return None
