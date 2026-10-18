"""Sensitive account settings. Identity checks are enforced by the backend."""

from __future__ import annotations

import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from backend.auth.email import send_verification_email
from backend.auth.password import normalize_email, validate_password
from backend.auth.rate_limit import check_account_rate_limit
from backend.core.security import get_token_from_cookie, read_access_payload
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.auth import AccountSession, UserTotp
from backend.models.user import User
from backend.security import get_password_hash, verify_password
from backend.services.account_security import (
    _fernet, _hotp, audit, consume_backup_code, encrypt_totp,
    generate_backup_codes, generate_totp_secret, issue_action_token, queue_security_notice,
    revoke_sessions, utcnow, verify_totp,
)

router = APIRouter(prefix="/api/user/security", tags=["User Security"])


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class VerifyPasswordRequest(BaseModel):
    password: str


class TotpCodeRequest(BaseModel):
    code: str


class TotpDisableRequest(BaseModel):
    current_password: str
    code: str


def _check_password(user: User, password: str) -> None:
    if not user.hashed_password or not verify_password(password, user.hashed_password):
        raise HTTPException(401, "Неверный текущий пароль")


def _current_sid(request: Request) -> str | None:
    token = get_token_from_cookie(request)
    if not token:
        header = request.headers.get("authorization", "")
        token = header[7:] if header.lower().startswith("bearer ") else None
    payload = read_access_payload(token) if token else None
    return payload.get("sid") if payload else None


@router.post("/change-email")
async def change_email(
    data: ChangeEmailRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "change_email", subject=str(current_user.id))
    _check_password(current_user, data.current_password)
    new_email = normalize_email(str(data.new_email))
    if new_email == current_user.email or db.query(User.id).filter(
        (User.email == new_email) | (User.pending_email == new_email)
    ).first():
        raise HTTPException(400, "Этот email недоступен")
    current_user.pending_email = new_email
    token = issue_action_token(db, current_user, "change_email", new_email)
    audit(db, current_user.id, "email_change_requested")
    queue_security_notice(db, current_user.id, current_user.email, "email_change_requested")
    db.commit()
    try:
        send_verification_email(new_email, token, purpose="change_email")
    except Exception:
        raise HTTPException(503, "Система доставки писем временно недоступна")
    return {"detail": "Подтвердите новый адрес по ссылке в письме", "pending_email": new_email}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "change_password", subject=str(current_user.id))
    _check_password(current_user, data.current_password)
    valid, error = validate_password(data.new_password)
    if not valid:
        raise HTTPException(400, error)
    if verify_password(data.new_password, current_user.hashed_password):
        raise HTTPException(400, "Новый пароль должен отличаться от прежнего")
    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.password_hash = current_user.hashed_password
    current_user.token_version = int(current_user.token_version or 0) + 1
    current_user.session_required = True
    revoke_sessions(db, current_user.id)
    audit(db, current_user.id, "password_changed")
    queue_security_notice(db, current_user.id, current_user.email, "password_changed")
    db.commit()
    return {"detail": "Пароль изменён. Войдите снова."}


@router.post("/verify-password")
async def verify_user_password(
    data: VerifyPasswordRequest, request: Request,
    current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "verify_password", subject=str(current_user.id))
    _check_password(current_user, data.password)
    return {"detail": "Пароль верный", "verified": True}


@router.get("/sessions")
async def list_sessions(
    request: Request, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sid = _current_sid(request)
    rows = db.query(AccountSession).filter(
        AccountSession.user_id == current_user.id, AccountSession.revoked_at.is_(None)
    ).order_by(AccountSession.created_at.desc()).all()
    return [{
        "id": row.id, "current": row.id == sid, "client": row.user_agent or "Неизвестное устройство",
        "created_at": row.created_at, "last_seen_at": row.last_seen_at,
    } for row in rows]


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(AccountSession, session_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(404, "Сессия не найдена")
    row.revoked_at = utcnow()
    audit(db, current_user.id, "session_revoked")
    db.commit()
    return {"ok": True}


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    request: Request, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sid = _current_sid(request)
    if not sid:
        raise HTTPException(400, "Для управления сессиями войдите снова")
    revoke_sessions(db, current_user.id, except_id=sid)
    audit(db, current_user.id, "other_sessions_revoked")
    db.commit()
    return {"ok": True}


@router.post("/totp/setup")
async def setup_totp(
    data: VerifyPasswordRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "totp_setup", subject=str(current_user.id))
    _check_password(current_user, data.password)
    existing = db.get(UserTotp, current_user.id)
    if existing and existing.enabled_at:
        raise HTTPException(409, "Двухфакторная защита уже включена")
    secret = generate_totp_secret()
    if existing:
        existing.secret_ciphertext = encrypt_totp(secret)
        existing.last_counter = None
    else:
        db.add(UserTotp(user_id=current_user.id, secret_ciphertext=encrypt_totp(secret)))
    db.commit()
    # Secret is shown once in this authenticated, reauthenticated response.
    return {"secret": secret, "otpauth_uri": f"otpauth://totp/BotForg:{current_user.email}?secret={secret}&issuer=BotForg&digits=6&period=30"}


@router.post("/totp/confirm")
async def confirm_totp(
    data: TotpCodeRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "totp_confirm", subject=str(current_user.id))
    row = db.get(UserTotp, current_user.id)
    if row is None or row.enabled_at:
        raise HTTPException(400, "Начните подключение защиты заново")
    try:
        secret = _fernet().decrypt(row.secret_ciphertext.encode("ascii")).decode("ascii")
    except Exception:
        raise HTTPException(400, "Настройка повреждена")
    current = int(time.time() // 30)
    matched_counter = next((counter for counter in (current - 1, current, current + 1)
        if len(data.code) == 6 and data.code.isascii() and data.code.isdigit()
        and _hotp(secret, counter) == data.code), None)
    if matched_counter is None:
        raise HTTPException(400, "Неверный код")
    row.enabled_at = utcnow()
    row.last_counter = matched_counter
    codes = generate_backup_codes(db, current_user.id)
    current_user.token_version = int(current_user.token_version or 0) + 1
    current_user.session_required = True
    revoke_sessions(db, current_user.id)
    audit(db, current_user.id, "totp_enabled")
    queue_security_notice(db, current_user.id, current_user.email, "totp_enabled")
    db.commit()
    return {"backup_codes": codes, "message": "Защита включена. Сохраните резервные коды."}


@router.post("/totp/cancel")
async def cancel_totp_setup(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    row = db.get(UserTotp, current_user.id)
    if row is not None and row.enabled_at is None:
        db.delete(row)
        audit(db, current_user.id, "totp_setup_cancelled")
        db.commit()
    return {"ok": True}


@router.post("/totp/disable")
async def disable_totp(
    data: TotpDisableRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    check_account_rate_limit(request, "totp_disable", subject=str(current_user.id))
    _check_password(current_user, data.current_password)
    row = db.get(UserTotp, current_user.id)
    if row is None or row.enabled_at is None or not (
        verify_totp(db, current_user.id, data.code) or consume_backup_code(db, current_user.id, data.code)
    ):
        db.rollback()
        raise HTTPException(401, "Неверный код")
    db.delete(row)
    current_user.token_version = int(current_user.token_version or 0) + 1
    revoke_sessions(db, current_user.id)
    audit(db, current_user.id, "totp_disabled")
    queue_security_notice(db, current_user.id, current_user.email, "totp_disabled")
    db.commit()
    return {"message": "Двухфакторная защита отключена. Войдите снова."}
