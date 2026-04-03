"""Mini-CRM: пользователи ctor-бота, переменные, теги, события."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
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
from backend.services.bot_crm.crm_service import (
    BotUserListRowOut,
    build_variable_usage_maps,
    get_bot_user_for_ctor,
    list_bot_users,
    list_variable_definitions_rows,
)
from backend.services.constructor.dto import TagDefinitionOptions, UserVariableView, VariableDefinitionOptions
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.repositories.ctor_tags_repository import CtorTagsRepository
from backend.services.constructor.repositories.ctor_variables_repository import CtorVariablesRepository
from backend.services.constructor.tag_service import TagService
from backend.services.constructor.validation import validate_snake_case_key
from backend.services.constructor.variable_service import VariableService
from backend.utils.bot_access import check_bot_access, check_bot_edit_permission
from backend.utils.ctor_bot_resolve import resolve_ctor_bot_id

router = APIRouter(prefix="/{bot_id}/crm", tags=["bot-crm"])

SNAKE_MSG = "ключ только snake_case: латиница, цифры, подчёркивание, с буквы"


def _ctor_dep(bot_id: int, db: Session, user: User) -> int:
    check_bot_access(bot_id, user.id, db)
    cid = resolve_ctor_bot_id(db, bot_id)
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Constructor bot is not linked to this platform bot",
        )
    return cid


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


class SnakeKeyMixin(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def key_snake(cls, v: str) -> str:
        msg = validate_snake_case_key(v.strip())
        if msg:
            raise ValueError(SNAKE_MSG)
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


class TagCreateBody(SnakeKeyMixin):
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


class UserTagBody(SnakeKeyMixin):
    pass


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
                created_at=r.created_at,
            )
            for r in rows
        ],
    )


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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    tk = [t.strip() for t in tag_keys.split(",")] if tag_keys else None
    total, rows = list_bot_users(
        db,
        ctor_id,
        q=q,
        channel=channel,
        tag_keys=tk,
        active_since=active_since,
        active_until=active_until,
        page=page,
        page_size=page_size,
    )
    return _user_rows_to_list_out(total, page, page_size, rows)


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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    u = get_bot_user_for_ctor(db, ctor_id, bot_user_id)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
        raise HTTPException(status_code=404, detail="User not found")
    msg = validate_snake_case_key(tag_key.strip())
    if msg:
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    if not get_bot_user_for_ctor(db, ctor_id, bot_user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return MessagesStubOut(available=False, items=[])


@router.get("/variables", response_model=List[VariableDefRowOut])
def crm_list_variable_defs(
    bot_id: int,
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    usage_map, _ = build_variable_usage_maps(db, ctor_id)
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
    return out


@router.post("/variables", response_model=VariableDefRowOut, status_code=status.HTTP_201_CREATED)
def crm_create_variable(
    bot_id: int,
    body: VariableCreateBody,
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
    usage_map, _ = build_variable_usage_maps(db, ctor_id)
    return VariableDefRowOut(
        id=r.id,
        key=r.key,
        label=r.label,
        data_type=r.data_type,
        is_system=r.is_system,
        is_archived=r.is_archived,
        used_in_blocks_count=len(usage_map.get(r.key, set())),
        updated_at=r.updated_at.isoformat(),
    )


@router.patch("/variables/{var_key:path}", response_model=VariableDefRowOut)
def crm_patch_variable(
    bot_id: int,
    var_key: str,
    body: VariablePatchBody,
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
    usage_map, _ = build_variable_usage_maps(db, ctor_id)
    return VariableDefRowOut(
        id=row.id,
        key=row.key,
        label=row.label,
        data_type=row.data_type,
        is_system=row.is_system,
        is_archived=row.is_archived,
        used_in_blocks_count=len(usage_map.get(row.key, set())),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/tags", response_model=List[TagDefRowOut])
def crm_list_tags(
    bot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ctor_id = _ctor_dep(bot_id, db, user)
    repo = CtorTagsRepository(db)
    rows = repo.list_tags_for_bot(ctor_id)
    if not rows:
        return []
    counts = (
        db.query(CtorBotUserTag.tag_id, func.count(CtorBotUserTag.id))
        .filter(CtorBotUserTag.tag_id.in_([r.id for r in rows]))
        .group_by(CtorBotUserTag.tag_id)
        .all()
    )
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(bot_id, db, user)
    ctor_id = _ctor_dep(bot_id, db, user)
    if validate_snake_case_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
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
    uc = repo.count_users_for_tag(row.id)
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
    if validate_snake_case_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
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
    return None


@router.get("/tags/{tag_key:path}/users", response_model=BotUserListOut)
def crm_users_by_tag(
    bot_id: int,
    tag_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if validate_snake_case_key(tag_key.strip()):
        raise HTTPException(status_code=400, detail=SNAKE_MSG)
    ctor_id = _ctor_dep(bot_id, db, user)
    total, rows = list_bot_users(
        db,
        ctor_id,
        tag_keys=[tag_key.strip()],
        page=page,
        page_size=page_size,
    )
    return _user_rows_to_list_out(total, page, page_size, rows)
