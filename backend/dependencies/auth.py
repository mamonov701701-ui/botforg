import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.token_blacklist import TokenBlacklist
from backend.models.user import User
from backend.settings import settings
from backend.core.security import get_token_from_cookie, verify_jwt_token

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/email/login", auto_error=False)


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Логируем все заголовки для отладки
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    logger.debug(f"Request path: {request.url.path}")
    logger.debug(
        f"Authorization header: {auth_header[:50] + '...' if auth_header and len(auth_header) > 50 else auth_header}"
    )
    logger.debug(f"OAuth2PasswordBearer token: {token[:20] + '...' if token and len(token) > 20 else token}")

    # Пытаемся получить токен из Authorization header или из cookie
    auth_token = None
    if token:
        # Токен из Authorization header
        auth_token = token
        logger.debug(f"Token from Authorization header: {token[:20]}...")
    else:
        # Пытаемся получить токен из cookie
        auth_token = get_token_from_cookie(request)
        if auth_token:
            logger.debug("Token from cookie")
            user_id, token_tv = verify_jwt_token(auth_token)
            if user_id is not None:
                user = db.query(User).filter(User.id == user_id).first()
                if user and getattr(user, "token_version", 0) == token_tv:
                    return user
                if user and getattr(user, "token_version", 0) != token_tv:
                    raise credentials_exception
        else:
            logger.warning("No token found in header or cookie")
            logger.warning(f"Request headers keys: {list(request.headers.keys())}")

    if not auth_token:
        raise credentials_exception

    try:
        # Проверяем, не в blacklist ли токен
        blacklisted = (
            db.query(TokenBlacklist).filter(TokenBlacklist.token == auth_token).first()
        )
        if blacklisted:
            logger.warning(f"Blacklisted token used: {auth_token[:20]}...")
            raise credentials_exception

        payload = jwt.decode(
            auth_token, settings.JWT_SECRET, algorithms=["HS256"]
        )
        token_data = payload.get("sub")
        if token_data is None:
            raise credentials_exception
    except JWTError:
        logger.warning("Invalid JWT token")
        raise credentials_exception

    user = db.query(User).filter(User.id == int(token_data)).first()
    if user is None:
        raise credentials_exception
    if getattr(user, "token_version", 0) != payload.get("tv", 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
