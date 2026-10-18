"""Shared Stage 8 account actions. No raw action token is persisted or logged."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.auth import AccountActionToken, AccountSession, SecurityAuditEvent, UserTotp, TotpBackupCode
from backend.models.user import User
from backend.models.notification import NotificationOutbox
from backend.settings import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_action_token(db: Session, user: User, purpose: str, target_email: str, *, hours: float = 24) -> str:
    now = utcnow()
    db.query(AccountActionToken).filter(
        AccountActionToken.user_id == user.id,
        AccountActionToken.purpose == purpose,
        AccountActionToken.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.add(AccountActionToken(
        user_id=user.id, purpose=purpose, target_email=target_email,
        token_hash=token_digest(token), created_at=now,
        expires_at=now + timedelta(hours=hours),
    ))
    db.flush()
    return token


def consume_action_token(db: Session, token: str, purpose: str) -> tuple[User, str] | None:
    if not token or len(token) > 256:
        return None
    now = utcnow()
    row = db.query(AccountActionToken).filter(
        AccountActionToken.token_hash == token_digest(token),
        AccountActionToken.purpose == purpose,
        AccountActionToken.consumed_at.is_(None),
        AccountActionToken.expires_at > now,
    ).first()
    if row is None:
        return None
    user = db.get(User, row.user_id)
    if user is None:
        return None
    expected = user.pending_email if purpose == "change_email" else user.email
    if expected != row.target_email:
        return None
    changed = db.execute(
        update(AccountActionToken)
        .where(AccountActionToken.id == row.id, AccountActionToken.consumed_at.is_(None), AccountActionToken.expires_at > now)
        .values(consumed_at=now)
    )
    if changed.rowcount != 1:
        return None
    db.flush()
    return user, row.target_email


def create_session(db: Session, user: User, user_agent: str | None = None) -> AccountSession:
    now = utcnow()
    row = AccountSession(
        id=secrets.token_urlsafe(24), user_id=user.id,
        user_agent=(user_agent or "")[:255], created_at=now, last_seen_at=now,
    )
    db.add(row)
    user.session_required = True
    db.flush()
    return row


def revoke_sessions(db: Session, user_id: int, *, except_id: str | None = None) -> None:
    query = db.query(AccountSession).filter(AccountSession.user_id == user_id, AccountSession.revoked_at.is_(None))
    if except_id:
        query = query.filter(AccountSession.id != except_id)
    query.update({"revoked_at": utcnow()}, synchronize_session=False)
    db.flush()


def audit(db: Session, user_id: int, event_type: str) -> None:
    db.add(SecurityAuditEvent(user_id=user_id, event_type=event_type, created_at=utcnow()))


_NOTICE_TEXT = {
    "repeated_login_failures": "За короткое время произошло несколько неудачных попыток входа. Это само по себе не доказывает взлом.",
    "email_change_requested": "Запрошена смена адреса электронной почты.",
    "email_change_completed": "Основной адрес электронной почты изменён. Прежние сеансы завершены.",
    "password_changed": "Пароль аккаунта изменён. Прежние сеансы завершены.",
    "password_reset": "Пароль аккаунта восстановлен. Прежние сеансы завершены.",
    "totp_enabled": "Двухфакторная защита включена. Прежние сеансы завершены.",
    "totp_disabled": "Двухфакторная защита отключена. Прежние сеансы завершены.",
}


def note_failed_login(db: Session, user: User) -> None:
    """Alert after four failures in ten minutes, at most once per day."""
    now = utcnow()
    audit(db, user.id, "login_failed")
    db.flush()
    recent = db.query(SecurityAuditEvent.id).filter(
        SecurityAuditEvent.user_id == user.id,
        SecurityAuditEvent.event_type == "login_failed",
        SecurityAuditEvent.created_at >= now - timedelta(minutes=10),
    ).count()
    last_notice = db.query(SecurityAuditEvent.id).filter(
        SecurityAuditEvent.user_id == user.id,
        SecurityAuditEvent.event_type == "repeated_login_failures_notice",
        SecurityAuditEvent.created_at >= now - timedelta(days=1),
    ).first()
    if recent >= 4 and last_notice is None:
        # The outbox's unique key also deduplicates simultaneous requests that
        # passed the read above. A collision must not change the login response.
        try:
            with db.begin_nested():
                queue_security_notice(
                    db, user.id, user.email, "repeated_login_failures",
                    idempotency_key=f"account_security:login_failures:{user.id}:{now:%Y%m%d}",
                )
                db.flush()
        except IntegrityError:
            pass
        else:
            audit(db, user.id, "repeated_login_failures_notice")


def queue_security_notice(
    db: Session, user_id: int, email: str, event_type: str, *, idempotency_key: str | None = None,
) -> None:
    if event_type not in _NOTICE_TEXT:
        raise ValueError("Unsupported security event")
    now = utcnow()
    db.add(NotificationOutbox(
        notification_type="account_security", channel="email", recipient_user_id=user_id,
        recipient_email=email, aggregate_type="user", aggregate_id=str(user_id),
        event_type=event_type, idempotency_key=idempotency_key or f"account_security:{uuid.uuid4().hex}",
        payload_json={"event_type": event_type}, status="pending", available_at=now,
        created_at=now, updated_at=now,
    ))


def security_notice_text(event_type: str) -> str:
    return _NOTICE_TEXT[event_type]


def _fernet() -> Fernet:
    # Dedicated key material is derived from the existing backend secret. Never expose it.
    derived = hashlib.sha256((settings.JWT_SECRET + ":totp:v1").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def encrypt_totp(secret: str) -> str:
    return _fernet().encrypt(secret.encode("ascii")).decode("ascii")


def _hotp(secret: str, counter: int) -> str:
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff
    return f"{number % 1_000_000:06d}"


def verify_totp(db: Session, user_id: int, code: str) -> bool:
    row = db.get(UserTotp, user_id)
    if row is None or row.enabled_at is None or len(code) != 6 or not code.isascii() or not code.isdigit():
        return False
    secret = _fernet().decrypt(row.secret_ciphertext.encode("ascii")).decode("ascii")
    current = int(time.time() // 30)
    for counter in (current - 1, current, current + 1):
        if hmac.compare_digest(_hotp(secret, counter), code):
            changed = db.execute(
                update(UserTotp)
                .where(UserTotp.user_id == user_id, UserTotp.enabled_at.is_not(None))
                .where((UserTotp.last_counter.is_(None)) | (UserTotp.last_counter < counter))
                .values(last_counter=counter)
            )
            if changed.rowcount == 1:
                db.flush()
                return True
    return False


def backup_digest(code: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), code.upper().encode("ascii"), hashlib.sha256).hexdigest()


def generate_backup_codes(db: Session, user_id: int) -> list[str]:
    db.query(TotpBackupCode).filter(TotpBackupCode.user_id == user_id).delete()
    codes = [secrets.token_hex(6).upper() for _ in range(10)]
    for code in codes:
        db.add(TotpBackupCode(user_id=user_id, code_hash=backup_digest(code)))
    db.flush()
    return codes


def consume_backup_code(db: Session, user_id: int, code: str) -> bool:
    if len(code) != 12:
        return False
    try:
        digest = backup_digest(code)
    except UnicodeEncodeError:
        return False
    row = db.query(TotpBackupCode).filter(
        TotpBackupCode.user_id == user_id,
        TotpBackupCode.code_hash == digest,
        TotpBackupCode.used_at.is_(None),
    ).first()
    if row is None:
        return False
    changed = db.execute(
        update(TotpBackupCode).where(TotpBackupCode.id == row.id, TotpBackupCode.used_at.is_(None)).values(used_at=utcnow())
    )
    db.flush()
    return changed.rowcount == 1
