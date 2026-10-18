"""Canonical access-token validation for bearer and cookie sessions."""

from datetime import timedelta

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from urllib.parse import urlsplit
from sqlalchemy.orm import Session

from backend.core.security import get_token_from_cookie, read_access_payload
from backend.database import get_db
from backend.models.auth import AccountSession
from backend.models.token_blacklist import TokenBlacklist
from backend.models.user import User
from backend.services.account_security import utcnow
from backend.settings import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/email/login", auto_error=False)


def resolve_current_user(db: Session, auth_token: str | None) -> User | None:
    if not auth_token:
        return None
    payload = read_access_payload(auth_token)
    if not payload:
        return None
    try:
        user_id = int(payload["sub"])
        token_version = int(payload.get("tv", 0))
    except (KeyError, TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or int(user.token_version or 0) != token_version:
        return None
    if db.query(TokenBlacklist.id).filter(TokenBlacklist.token == auth_token).first():
        return None
    if user.email_verification_required and user.email_verified_at is None:
        return None
    sid = payload.get("sid")
    if user.session_required and not sid:
        return None
    if sid:
        session = db.get(AccountSession, sid)
        if session is None or session.user_id != user.id or session.revoked_at is not None:
            return None
        now = utcnow()
        if session.last_seen_at < now - timedelta(minutes=5):
            session.last_seen_at = now
            db.commit()
    return user


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cookie_token = get_token_from_cookie(request)
    if not token and cookie_token and request.method.upper() not in {"GET", "HEAD", "OPTIONS"} and settings.ENVIRONMENT == "production":
        origin = request.headers.get("origin")
        frontend = urlsplit(settings.FRONTEND_URL)
        request_origin = f"{request.url.scheme}://{request.url.netloc}"
        allowed = {f"{frontend.scheme}://{frontend.netloc}", request_origin}
        if origin not in allowed:
            raise HTTPException(status_code=403, detail="Недопустимый источник запроса")
    user = resolve_current_user(db, token or cookie_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Необходим вход в аккаунт",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
