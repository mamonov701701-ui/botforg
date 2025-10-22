from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import Response, Request
from backend.settings import settings

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
COOKIE_NAME = "session"


def create_jwt_token(user_id: int) -> str:
    """Create JWT token for user session"""
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> int | None:
    """Verify JWT and return user_id"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        return user_id
    except (JWTError, ValueError, TypeError):
        return None


def set_auth_cookie(response: Response, token: str):
    """Set HttpOnly session cookie"""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60,
        path="/"
    )


def clear_auth_cookie(response: Response):
    """Clear session cookie"""
    response.delete_cookie(key=COOKIE_NAME, path="/")


def get_token_from_cookie(request: Request) -> str | None:
    """Extract JWT from cookie"""
    return request.cookies.get(COOKIE_NAME)

