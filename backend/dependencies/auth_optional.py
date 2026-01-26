"""
Optional authentication dependency for public endpoints
"""
import logging
from typing import Optional
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from backend.database import get_db
from backend.models.user import User
from backend.models.token_blacklist import TokenBlacklist
from backend.settings import settings
from backend.core.security import get_token_from_cookie, verify_jwt_token

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/email/login", auto_error=False)


async def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Опциональная аутентификация - возвращает пользователя если есть токен,
    иначе None. Не выбрасывает исключение.
    """
    # Пытаемся получить токен из Authorization header или из cookie
    auth_token = None
    if token:
        auth_token = token
    else:
        try:
            auth_token = get_token_from_cookie(request)
        except:
            pass
        
        if auth_token:
            try:
                user_id = verify_jwt_token(auth_token)
                if user_id:
                    user = db.query(User).filter(User.id == user_id).first()
                    if user:
                        return user
            except:
                pass
    
    if not auth_token:
        return None
    
    try:
        # Проверяем, не в blacklist ли токен
        blacklisted = (
            db.query(TokenBlacklist).filter(TokenBlacklist.token == auth_token).first()
        )
        if blacklisted:
            return None
        
        payload = jwt.decode(
            auth_token, settings.JWT_SECRET, algorithms=["HS256"]
        )
        token_data = payload.get("sub")
        if token_data is None:
            return None
        
        user = db.query(User).filter(User.id == int(token_data)).first()
        return user
    except (JWTError, ValueError, TypeError):
        return None
