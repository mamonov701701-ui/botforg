import copy
from datetime import date
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO
import secrets
from fastapi import File, UploadFile
from backend.dependencies.auth import get_current_user
from backend.database import get_db
from backend.models.user import User, UserSettings
from backend.models.auth import DisplayNameHistory, UserTotp
from backend.models.plan import Plan
from backend.services.dev_tariff_gate import require_dev_tariff_fulfillment
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy import update
from sqlalchemy.orm import Session
from backend.services.usernames import UsernameError, normalize_username

router = APIRouter(tags=["account"])


class ChangePlanRequest(BaseModel):
    plan_code: str


class UserProfile(BaseModel):
    id: int
    public_id: int
    email: str
    name: str | None
    username: str | None = None
    avatar: str | None
    providers: list[str]
    role: str
    plan_code: str = "free"
    date_of_birth: date | None = None
    phone: str | None = None
    phone_verified: bool = False
    email_verified: bool = False
    pending_email: str | None = None

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
    date_of_birth: date | None = None
    language: str | None = None
    timezone: str | None = None


class UsernameClaim(BaseModel):
    username: str


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


def _profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id, public_id=user.public_id, email=user.email,
        name=user.name, username=user.username, avatar=user.avatar,
        providers=[a.provider for a in user.accounts], role=user.role,
        plan_code=user.plan_code or "free", date_of_birth=user.date_of_birth,
        phone=user.phone, phone_verified=bool(user.phone_verified_at),
        email_verified=bool(user.email_verified_at), pending_email=user.pending_email,
    )


def _set_display_name(db: Session, user: User, value: str) -> None:
    name = value.strip()
    if len(name) < 2 or len(name) > 100 or any(ord(ch) < 32 for ch in name):
        raise HTTPException(400, "Имя должно содержать от 2 до 100 символов")
    if name != user.name:
        db.add(DisplayNameHistory(
            user_id=user.id, old_name=user.name, new_name=name,
            changed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        user.name = name


def _set_date_of_birth(user: User, dob: date) -> None:
    today = date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if dob > today or years < 18 or years > 120:
        raise HTTPException(400, "Укажите корректную дату рождения: возраст от 18 лет")
    user.date_of_birth = dob


@router.get("/me", response_model=UserProfile)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Текущий профиль пользователя."""
    return _profile(current_user)


@router.post("/me/username", response_model=UserProfile)
async def claim_username(
    body: UsernameClaim,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username_key is not None:
        raise HTTPException(409, "Ник уже выбран и не может быть изменён")
    try:
        visible, key = normalize_username(body.username)
    except UsernameError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        changed = db.execute(
            update(User).where(User.id == current_user.id, User.username_key.is_(None))
            .values(username=visible, username_key=key)
        )
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Ник уже выбран и не может быть изменён")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Этот ник уже занят") from exc
    db.refresh(current_user)
    return _profile(current_user)


@router.patch("/me", response_model=UserProfile)
async def update_me(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Обновить имя (и при необходимости аватар) текущего пользователя."""
    if body.name is not None:
        _set_display_name(db, current_user, body.name)
    if body.date_of_birth is not None:
        _set_date_of_birth(current_user, body.date_of_birth)
    db.commit()
    db.refresh(current_user)
    return _profile(current_user)


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
            two_factor_enabled=bool((totp := db.get(UserTotp, current_user.id)) and totp.enabled_at),
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
            _set_display_name(db, current_user, body.profile.name)
        if body.profile.date_of_birth is not None:
            _set_date_of_birth(current_user, body.profile.date_of_birth)
        if body.profile.language is not None:
            settings.language = body.profile.language
        if body.profile.timezone is not None:
            settings.timezone = body.profile.timezone

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

    db.commit()
    db.refresh(settings)
    if current_user in db.dirty:
        db.refresh(current_user)

    return await get_settings(current_user=current_user, db=db)


class PhoneUpdate(BaseModel):
    phone: str


@router.put("/me/phone", response_model=UserProfile)
async def update_phone(
    body: PhoneUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import phonenumbers
    try:
        if not body.phone.startswith("+"):
            raise ValueError("International format required")
        parsed = phonenumbers.parse(body.phone, None)
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError("Invalid number")
        normalized = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except (ValueError, phonenumbers.NumberParseException):
        raise HTTPException(400, "Укажите номер в международном формате, например +79991234567")
    if current_user.phone != normalized:
        current_user.phone = normalized
        current_user.phone_verified_at = None
        db.commit()
    return _profile(current_user)


@router.delete("/me/phone", response_model=UserProfile)
async def delete_phone(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    current_user.phone = None
    current_user.phone_verified_at = None
    db.commit()
    return _profile(current_user)


_AVATAR_DIR = Path("uploads/avatars")


def _delete_own_avatar(url: str | None) -> None:
    if not url or not url.startswith("/uploads/avatars/"):
        return
    filename = url.rsplit("/", 1)[-1]
    if not filename.endswith(".png") or "/" in filename or "\\" in filename:
        return
    path = (_AVATAR_DIR / filename).resolve()
    if path.parent == _AVATAR_DIR.resolve():
        path.unlink(missing_ok=True)


@router.post("/me/avatar", response_model=UserProfile)
async def upload_avatar(
    file: UploadFile = File(...), db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from PIL import Image, UnidentifiedImageError
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(400, "Разрешены PNG, JPEG и WebP")
    content = await file.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Размер файла не должен превышать 2 МБ")
    try:
        with Image.open(BytesIO(content)) as image:
            expected_format = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}[file.content_type]
            if image.format != expected_format or image.width > 4096 or image.height > 4096:
                raise ValueError("Unsupported image")
            image.load()
            image.thumbnail((512, 512))
            sanitized = Image.new("RGBA", image.size)
            sanitized.paste(image.convert("RGBA"))
            output = BytesIO()
            sanitized.save(output, format="PNG")
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Некорректное изображение")
    _AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(24)}.png"
    path = _AVATAR_DIR / filename
    path.write_bytes(output.getvalue())
    previous = current_user.avatar
    current_user.avatar = f"/uploads/avatars/{filename}"
    try:
        db.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    _delete_own_avatar(previous)
    return _profile(current_user)


@router.delete("/me/avatar", response_model=UserProfile)
async def delete_avatar(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    previous = current_user.avatar
    current_user.avatar = None
    db.commit()
    _delete_own_avatar(previous)
    return _profile(current_user)


@router.post("/me/plan")
async def change_plan(
    body: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Смена тарифа текущего пользователя (mock, без оплаты).

    Fail-closed: только non-production + ALLOW_DEV_TARIFF_FULFILLMENT=true.
    Не создаёт UserSubscription и не имитирует оплату.
    """
    require_dev_tariff_fulfillment()
    plan = db.query(Plan).filter(Plan.code == body.plan_code).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Тариф '{body.plan_code}' не найден.",
        )
    current_user.plan_code = body.plan_code
    db.commit()
    db.refresh(current_user)
    return {"plan_code": plan.code, "name": plan.name, "limits": plan.limits}
