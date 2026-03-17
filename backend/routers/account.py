import copy
from backend.dependencies.auth import get_current_user
from backend.database import get_db
from backend.models.user import User, UserSettings
from backend.models.plan import Plan
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(tags=["account"])


class ChangePlanRequest(BaseModel):
    plan_code: str


class UserProfile(BaseModel):
    id: int
    public_id: int
    email: str
    name: str | None
    avatar: str | None
    providers: list[str]
    role: str
    plan_code: str = "free"

    model_config = {"from_attributes": True}


# --- Settings schemas (личный кабинет — настройки) ---

class ProfileSettingsOut(BaseModel):
    name: str | None
    email: str
    language: str
    timezone: str
    two_factor_enabled: bool


class InterfaceSettingsOut(BaseModel):
    theme: str
    density: str
    font_size: str


class NotificationChannelOut(BaseModel):
    bot_errors: bool
    payments: bool
    team_changes: bool


class NotificationSettingsOut(BaseModel):
    email: NotificationChannelOut
    telegram: NotificationChannelOut


class AgentSettingsOut(BaseModel):
    enabled: bool
    mode: str
    data_policy: str
    allow_send_text_to_ai: bool = False  # 152-ФЗ: по умолчанию OFF


class SettingsOut(BaseModel):
    profile: ProfileSettingsOut
    interface: InterfaceSettingsOut
    notifications: NotificationSettingsOut
    agent: AgentSettingsOut
    demo_content_created: bool = False


class ProfileUpdate(BaseModel):
    name: str | None = None
    language: str | None = None
    timezone: str | None = None
    two_factor_enabled: bool | None = None


class InterfaceSettingsUpdate(BaseModel):
    theme: str | None = None
    density: str | None = None
    font_size: str | None = Field(None, alias="fontSize")

    model_config = {"populate_by_name": True}


class NotificationChannelUpdate(BaseModel):
    bot_errors: bool | None = None
    payments: bool | None = None
    team_changes: bool | None = None


class NotificationSettingsUpdate(BaseModel):
    email: NotificationChannelUpdate | None = None
    telegram: NotificationChannelUpdate | None = None


class AgentSettingsUpdate(BaseModel):
    enabled: bool | None = None
    mode: str | None = None
    data_policy: str | None = None
    allow_send_text_to_ai: bool | None = None


class SettingsUpdate(BaseModel):
    """Частичное обновление настроек. Передавать только нужные блоки."""
    profile: ProfileUpdate | None = None
    interface: InterfaceSettingsUpdate | None = None
    notifications: NotificationSettingsUpdate | None = None
    agent: AgentSettingsUpdate | None = None


# Defaults (совпадают с фронтом)
DEFAULT_INTERFACE = {"theme": "system", "density": "comfortable", "font_size": "medium"}
DEFAULT_NOTIFICATIONS = {
    "email": {"bot_errors": True, "payments": True, "team_changes": False},
    "telegram": {"bot_errors": False, "payments": True, "team_changes": False},
}
DEFAULT_AGENT = {"enabled": False, "mode": "advisor", "data_policy": "minimal", "allow_send_text_to_ai": False}


def _get_or_create_settings(db: Session, user_id: int) -> UserSettings:
    row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not row:
        row = UserSettings(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _merge_dict(base: dict, update: dict | None) -> dict:
    if not update:
        return base
    out = dict(base)
    for k, v in update.items():
        if v is not None:
            if isinstance(v, dict) and k in out and isinstance(out[k], dict):
                out[k] = _merge_dict(out[k], v)
            else:
                out[k] = v
    return out


@router.get("/me", response_model=UserProfile)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Текущий профиль пользователя."""
    providers = [a.provider for a in current_user.accounts]
    return UserProfile(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        providers=providers,
        role=current_user.role,
        plan_code=current_user.plan_code or "free",
    )


@router.patch("/me", response_model=UserProfile)
async def update_me(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Обновить имя (и при необходимости аватар) текущего пользователя."""
    if body.name is not None:
        current_user.name = body.name
    db.commit()
    db.refresh(current_user)
    providers = [a.provider for a in current_user.accounts]
    return UserProfile(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        providers=providers,
        role=current_user.role,
        plan_code=current_user.plan_code or "free",
    )


@router.get("/me/settings", response_model=SettingsOut)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить все настройки личного кабинета (профиль, интерфейс, уведомления, BF Agent)."""
    settings = _get_or_create_settings(db, current_user.id)
    interface = settings.interface_settings or DEFAULT_INTERFACE
    notifications = settings.notification_settings or DEFAULT_NOTIFICATIONS
    agent = settings.agent_settings or DEFAULT_AGENT

    interface_dict = settings.interface_settings or {}
    demo_created = bool(interface_dict.get("demo_content_created", False))

    return SettingsOut(
        profile=ProfileSettingsOut(
            name=current_user.name,
            email=current_user.email,
            language=settings.language or "ru",
            timezone=settings.timezone or "Europe/Moscow",
            two_factor_enabled=settings.two_factor_enabled or False,
        ),
        interface=InterfaceSettingsOut(
            theme=interface.get("theme", "system"),
            density=interface.get("density", "comfortable"),
            font_size=interface.get("font_size", "medium"),
        ),
        notifications=NotificationSettingsOut(
            email=NotificationChannelOut(**(notifications.get("email") or DEFAULT_NOTIFICATIONS["email"])),
            telegram=NotificationChannelOut(**(notifications.get("telegram") or DEFAULT_NOTIFICATIONS["telegram"])),
        ),
        agent=AgentSettingsOut(
            enabled=agent.get("enabled", False),
            mode=agent.get("mode", "advisor"),
            data_policy=agent.get("data_policy", "minimal"),
            allow_send_text_to_ai=agent.get("allow_send_text_to_ai", False),
        ),
        demo_content_created=demo_created,
    )


@router.put("/me/settings", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Обновить настройки личного кабинета. Можно передать только нужные блоки."""
    settings = _get_or_create_settings(db, current_user.id)

    if body.profile is not None:
        if body.profile.name is not None:
            current_user.name = body.profile.name
        if body.profile.language is not None:
            settings.language = body.profile.language
        if body.profile.timezone is not None:
            settings.timezone = body.profile.timezone
        if body.profile.two_factor_enabled is not None:
            settings.two_factor_enabled = body.profile.two_factor_enabled

    if body.interface is not None:
        cur = copy.deepcopy(settings.interface_settings or DEFAULT_INTERFACE)
        cur = _merge_dict(cur, body.interface.model_dump(exclude_none=True))
        settings.interface_settings = cur

    if body.notifications is not None:
        cur = copy.deepcopy(settings.notification_settings or DEFAULT_NOTIFICATIONS)
        upd = body.notifications.model_dump(exclude_none=True)
        if "email" in upd and upd["email"]:
            cur.setdefault("email", {}).update({k: v for k, v in upd["email"].items() if v is not None})
        if "telegram" in upd and upd["telegram"]:
            cur.setdefault("telegram", {}).update({k: v for k, v in upd["telegram"].items() if v is not None})
        settings.notification_settings = cur

    if body.agent is not None:
        cur = copy.deepcopy(settings.agent_settings or DEFAULT_AGENT)
        cur = _merge_dict(cur, body.agent.model_dump(exclude_none=True))
        settings.agent_settings = cur

    # profile: language, timezone, two_factor в UserSettings (пока не в ProfileUpdate — можно добавить)
    # для единообразия с фронтом добавим в SettingsUpdate отдельно profile.language, profile.timezone, profile.two_factor
    # но в текущем SettingsUpdate profile имеет только ProfileUpdate с name. Расширим ProfileUpdate.
    # Фронт шлёт: profileData { name, email, language, timezone, twoFactorEnabled }. Email не меняем через settings.
    # Добавим в ProfileUpdate: language, timezone, two_factor_enabled.
    # Уже сделал только name в ProfileUpdate. Добавлю поля в ProfileUpdate и обработаю ниже.
    db.commit()
    db.refresh(settings)
    if current_user in db.dirty:
        db.refresh(current_user)

    return await get_settings(current_user=current_user, db=db)


@router.post("/me/plan")
async def change_plan(
    body: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Смена тарифа текущего пользователя (mock, без оплаты).
    Для тестов и ручного назначения.
    """
    plan = db.query(Plan).filter(Plan.code == body.plan_code).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Тариф '{body.plan_code}' не найден. Доступные: free, pro, team.",
        )
    current_user.plan_code = body.plan_code
    db.commit()
    db.refresh(current_user)
    return {"plan_code": plan.code, "name": plan.name, "limits": plan.limits}
