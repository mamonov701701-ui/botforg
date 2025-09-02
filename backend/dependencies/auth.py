from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from backend.settings import settings
from backend.models.user import User
from backend.models.token_blacklist import TokenBlacklist
from backend.database import get_db
import logging

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Проверяем, не в blacklist ли токен
        blacklisted = db.query(TokenBlacklist).filter(TokenBlacklist.token == token).first()
        if blacklisted:
            logger.warning(f"Blacklisted token used: {token[:20]}...")
            raise credentials_exception
        
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_data = payload.get("sub")
        if token_data is None:
            raise credentials_exception
    except JWTError:
        logger.warning(f"Invalid JWT token: {token[:20]}...")
        raise credentials_exception
    
    user = db.query(User).filter(User.id == int(token_data)).first()
    if user is None:
        logger.warning(f"User not found for token: {token_data}")
        raise credentials_exception
    
    logger.info(f"User authenticated: {user.email}")
    return user 