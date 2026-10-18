"""Email account entry points. All one-time actions are POST and token-hash backed."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import asyncio
import logging
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.auth.email import send_password_reset_email, send_verification_email
from backend.auth.password import normalize_email, validate_password
from backend.auth.rate_limit import check_account_rate_limit
from backend.core.security import create_jwt_token, set_auth_cookie
from backend.database import SessionLocal, get_db
from backend.models.auth import AccountActionToken, UserTotp
from backend.models.legal import LegalDocType
from backend.models.user import User
from backend.security import get_password_hash, verify_password
from backend.services.account_security import (
    audit, consume_action_token, consume_backup_code, create_session,
    issue_action_token, note_failed_login, queue_security_notice, revoke_sessions, token_digest, utcnow, verify_totp,
)
from backend.services.legal_consent import record_consent
from backend.services.legal_documents import get_published_by_type
from backend.settings import settings
from backend.services.email_transport import classify_email_error
from backend.services.usernames import UsernameError, normalize_username

router = APIRouter(prefix="/auth/email", tags=["email-auth"])
logger = logging.getLogger(__name__)
_DUMMY_PASSWORD_HASH = get_password_hash("NotAnAccountPassword123!")

REQUIRED_DOC_TYPES = (
    LegalDocType.PUBLIC_OFFER.value,
    LegalDocType.PRIVACY_POLICY.value,
    LegalDocType.PERSONAL_DATA_CONSENT.value,
)

_REGISTRATION_MESSAGE = {"message": "Если регистрация возможна, проверьте почту для подтверждения адреса"}
_REGISTRATION_MIN_SECONDS = 0.5


async def _registration_response(started_at: float) -> dict[str, str]:
    # Equalize the database/password work. SMTP happens after the HTTP response.
    await asyncio.sleep(max(0.0, _REGISTRATION_MIN_SECONDS - (time.monotonic() - started_at)))
    return _REGISTRATION_MESSAGE


def _deliver_registration_verification(email: str, token: str) -> None:
    try:
        send_verification_email(email, token)
    except Exception:
        # The public response must remain neutral. Keep a retry path through
        # resend-verification, and do not expose the recipient or raw token.
        with SessionLocal() as db:
            db.query(AccountActionToken).filter(AccountActionToken.token_hash == token_digest(token)).update({"consumed_at": utcnow()})
            db.commit()
        logger.warning("Registration verification delivery failed; recipient and token omitted")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = Field(min_length=2, max_length=100)
    username: str
    date_of_birth: date
    legal_revision_ids: dict[str, int]
    terms_accepted: bool
    privacy_acknowledged: bool
    personal_data_consent_accepted: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class EmailRequest(BaseModel):
    email: EmailStr


class CorrectEmailRequest(BaseModel):
    email: EmailStr
    password: str
    new_email: EmailStr


class TokenRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TotpLoginRequest(BaseModel):
    challenge: str | None = None
    code: str


def _adult(dob: date, today: date) -> bool:
    if dob > today or dob.year < today.year - 120:
        return False
    return (today.year - dob.year) - ((today.month, today.day) < (dob.month, dob.day)) >= 18


def _login_response(db: Session, user: User, request: Request) -> dict:
    session = create_session(db, user, request.headers.get("user-agent"))
    audit(db, user.id, "login")
    db.commit()
    return {
        "message": "Вход выполнен успешно",
        "access_token": create_jwt_token(user.id, user.token_version, session_id=session.id),
        "token_type": "bearer",
    }


@router.get("/username-availability")
async def username_availability(
    request: Request, username: str = Query(..., max_length=100), db: Session = Depends(get_db),
):
    check_account_rate_limit(request, "username_check", max_attempts=30)
    try:
        _, key = normalize_username(username)
    except UsernameError as exc:
        return {"available": False, "message": str(exc)}
    available = db.query(User.id).filter(User.username_key == key).first() is None
    return {"available": available, "message": "Ник свободен" if available else "Этот ник уже занят"}


@router.post("/register")
async def register(data: RegisterRequest, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    started_at = time.monotonic()
    check_account_rate_limit(request, "register", subject=normalize_email(str(data.email)))
    valid, error = validate_password(data.password)
    if not valid:
        raise HTTPException(400, error)
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Укажите отображаемое имя")
    try:
        username, username_key = normalize_username(data.username)
    except UsernameError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not _adult(data.date_of_birth, date.today()):
        raise HTTPException(400, "Регистрация доступна с 18 лет")
    if not (data.terms_accepted and data.privacy_acknowledged and data.personal_data_consent_accepted):
        raise HTTPException(400, "Подтвердите обязательные условия и ознакомление с документами")
    revisions = {}
    for doc_type in REQUIRED_DOC_TYPES:
        published = get_published_by_type(db, doc_type)
        if published is None:
            raise HTTPException(503, "Юридические документы временно недоступны")
        if data.legal_revision_ids.get(doc_type) != published.id:
            raise HTTPException(400, "Подтвердите актуальные юридические условия")
        revisions[doc_type] = published
    email = normalize_email(str(data.email))
    if db.query(User.id).filter(User.username_key == username_key).first():
        raise HTTPException(409, "Этот ник уже занят")
    if db.query(User.id).filter(User.email == email).first():
        # Match the password-hashing cost of a successful registration without
        # creating another account, token or email to the existing owner.
        _hash_password(data.password)
        return await _registration_response(started_at)
    is_first = db.query(User.id).first() is None
    user = User(
        email=email, name=name, username=username, username_key=username_key,
        hashed_password=_hash_password(data.password),
        date_of_birth=data.date_of_birth, email_verification_required=True,
        session_required=True, role="owner" if is_first else "user",
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if db.query(User.id).filter(User.username_key == username_key).first():
            raise HTTPException(409, "Этот ник уже занят") from exc
        if db.query(User.id).filter(User.email == email).first():
            return await _registration_response(started_at)
        raise HTTPException(503, "Регистрация временно недоступна") from exc
    for doc_type, revision in revisions.items():
        record_consent(
            db, user_id=user.id, doc_type=doc_type, source="registration",
            revision_id=revision.id,
            confirmation_result="acknowledged" if doc_type == LegalDocType.PRIVACY_POLICY.value else "accepted",
            commit=False,
        )
    token = issue_action_token(db, user, "verify_email", email)
    audit(db, user.id, "registration")
    db.commit()
    background_tasks.add_task(_deliver_registration_verification, email, token)
    return await _registration_response(started_at)


def _hash_password(password: str) -> str:
    from backend.security import get_password_hash
    return get_password_hash(password)


@router.post("/resend-verification")
async def resend_verification(data: EmailRequest, request: Request, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "resend_verification", subject=normalize_email(str(data.email)))
    email = normalize_email(str(data.email))
    user = db.query(User).filter(User.email == email).first()
    generic = {"message": "Если адрес ожидает подтверждения, новое письмо будет отправлено"}
    if not user or user.email_verified_at:
        return generic
    last = db.query(AccountActionToken).filter(
        AccountActionToken.user_id == user.id,
        AccountActionToken.purpose == "verify_email",
        AccountActionToken.consumed_at.is_(None),
    ).order_by(AccountActionToken.created_at.desc()).first()
    if last and last.created_at > utcnow() - timedelta(seconds=60):
        raise HTTPException(429, "Подождите минуту перед повторной отправкой")
    token = issue_action_token(db, user, "verify_email", email)
    db.commit()
    try:
        send_verification_email(email, token)
    except Exception:
        db.query(AccountActionToken).filter(AccountActionToken.token_hash == token_digest(token)).update({"consumed_at": utcnow()})
        db.commit()
        raise HTTPException(503, "Система доставки писем временно недоступна")
    return generic


@router.post("/correct-email")
async def correct_unverified_email(data: CorrectEmailRequest, request: Request, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "correct_email", subject=normalize_email(str(data.email)))
    old_email = normalize_email(str(data.email))
    new_email = normalize_email(str(data.new_email))
    user = db.query(User).filter(User.email == old_email).first()
    if not user or user.email_verified_at or not user.email_verification_required or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Неверные данные аккаунта")
    if db.query(User.id).filter(User.email == new_email).first():
        raise HTTPException(400, "Этот email недоступен")
    user.pending_email = new_email
    db.query(AccountActionToken).filter(
        AccountActionToken.user_id == user.id,
        AccountActionToken.purpose == "verify_email",
        AccountActionToken.consumed_at.is_(None),
    ).update({"consumed_at": utcnow()}, synchronize_session=False)
    token = issue_action_token(db, user, "change_email", new_email)
    audit(db, user.id, "unverified_email_correction_requested")
    db.commit()
    try:
        send_verification_email(new_email, token, purpose="change_email")
    except Exception:
        raise HTTPException(503, "Система доставки писем временно недоступна")
    return {"message": "Подтвердите новый адрес по ссылке в письме"}


@router.post("/verify-preview")
async def verify_preview(data: TokenRequest, db: Session = Depends(get_db)):
    """Safe preview: scanners may GET this URL without consuming the token."""
    token = data.token
    if len(token) > 256:
        raise HTTPException(400, "Недействительная ссылка")
    row = db.query(AccountActionToken).filter(
        AccountActionToken.token_hash == token_digest(token),
        AccountActionToken.purpose.in_(["verify_email", "change_email"]),
        AccountActionToken.consumed_at.is_(None), AccountActionToken.expires_at > utcnow(),
    ).first()
    if row is None:
        raise HTTPException(400, "Ссылка недействительна или истекла")
    return {"status": "ready", "action": row.purpose}


@router.post("/verify")
async def verify_email(data: TokenRequest, db: Session = Depends(get_db)):
    for purpose in ("verify_email", "change_email"):
        consumed = consume_action_token(db, data.token, purpose)
        if consumed is None:
            continue
        user, target = consumed
        if purpose == "change_email":
            old_email = user.email
            user.email = target
            user.pending_email = None
            revoke_sessions(db, user.id)
            user.token_version = int(user.token_version or 0) + 1
            audit(db, user.id, "email_change_completed")
            queue_security_notice(db, user.id, old_email, "email_change_completed")
            queue_security_notice(db, user.id, target, "email_change_completed")
        else:
            if user.pending_email:
                db.rollback()
                raise HTTPException(400, "Для этого аккаунта ожидается подтверждение нового адреса")
            old_email = None
            audit(db, user.id, "email_verified")
        user.email_verified_at = utcnow()
        db.query(AccountActionToken).filter(
            AccountActionToken.user_id == user.id,
            AccountActionToken.purpose == purpose,
            AccountActionToken.consumed_at.is_(None),
        ).update({"consumed_at": utcnow()}, synchronize_session=False)
        db.commit()
        return {"message": "Адрес подтверждён. Теперь войдите в аккаунт."}
    db.rollback()
    raise HTTPException(400, "Ссылка недействительна или истекла")


@router.post("/login")
async def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "login", subject=normalize_email(str(data.email)))
    email = normalize_email(str(data.email))
    user = db.query(User).filter(User.email == email).first()
    password_ok = verify_password(data.password, user.hashed_password if user and user.hashed_password else _DUMMY_PASSWORD_HASH)
    if not user or not user.hashed_password or not password_ok:
        if user:
            note_failed_login(db, user)
            db.commit()
        raise HTTPException(401, "Неверный email или пароль")
    if user.email_verification_required and not user.email_verified_at:
        raise HTTPException(403, "Подтвердите email перед входом")
    totp = db.get(UserTotp, user.id)
    if totp and totp.enabled_at:
        challenge = issue_action_token(db, user, "totp_login", email, hours=5 / 60)
        db.commit()
        return {"requires_2fa": True, "challenge": challenge}
    return _login_response(db, user, request)


@router.post("/complete-2fa")
async def complete_2fa(data: TotpLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "complete_2fa")
    challenge = data.challenge or request.cookies.get("totp_challenge") or ""
    if len(challenge) > 256:
        raise HTTPException(401, "Неверное подтверждение")
    row = db.query(AccountActionToken).filter(
        AccountActionToken.token_hash == token_digest(challenge),
        AccountActionToken.purpose == "totp_login",
        AccountActionToken.consumed_at.is_(None),
        AccountActionToken.expires_at > utcnow(),
    ).first()
    user = db.get(User, row.user_id) if row else None
    if not user or not (verify_totp(db, user.id, data.code) or consume_backup_code(db, user.id, data.code)):
        db.rollback()
        raise HTTPException(401, "Неверный код")
    if not consume_action_token(db, challenge, "totp_login"):
        db.rollback()
        raise HTTPException(401, "Подтверждение уже использовано")
    result = _login_response(db, user, request)
    if request.cookies.get("totp_challenge") == challenge:
        set_auth_cookie(response, result["access_token"])
        response.delete_cookie("totp_challenge")
    return result


@router.post("/request-reset")
async def request_reset(data: EmailRequest, request: Request, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "reset", subject=normalize_email(str(data.email)))
    email = normalize_email(str(data.email))
    user = db.query(User).filter(User.email == email).first()
    if user and user.email_verified_at:
        token = issue_action_token(db, user, "password_reset", email)
        try:
            send_password_reset_email(email, token)
        except Exception as exc:
            # Keep the prior usable link when SMTP did not accept the replacement.
            db.rollback()
            code, _ = classify_email_error(exc)
            logger.warning("password_reset_delivery_failed code=%s", code)
        else:
            db.commit()
    return {"message": "Если адрес подтверждён и почта доступна, новое письмо придёт в ящик"}


@router.post("/reset")
async def reset_password(data: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    check_account_rate_limit(request, "reset_confirm")
    valid, error = validate_password(data.new_password)
    if not valid:
        raise HTTPException(400, error)
    consumed = consume_action_token(db, data.token, "password_reset")
    if not consumed:
        db.rollback()
        raise HTTPException(400, "Ссылка недействительна или истекла")
    user, _ = consumed
    user.hashed_password = _hash_password(data.new_password)
    user.password_hash = user.hashed_password
    user.token_version = int(user.token_version or 0) + 1
    revoke_sessions(db, user.id)
    audit(db, user.id, "password_reset")
    queue_security_notice(db, user.id, user.email, "password_reset")
    db.commit()
    return {"message": "Пароль изменён. Войдите снова."}
