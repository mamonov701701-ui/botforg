import logging
from datetime import datetime

from backend.database import get_db
from backend.models.token_blacklist import TokenBlacklist
from backend.models.user import User
from backend.schemas.auth import RegisterIn, Token
from backend.security import (
    create_access_token,
    get_password_hash,
    verify_password,
    verify_token,
)
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


@router.post("/register", response_model=Token)
def register(user_in: RegisterIn, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="user exists")

    user = User(
        name=user_in.name or "User",
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role or "viewer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    return {"access_token": access_token, "token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning(f"Failed login attempt for email: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    logger.info(f"Successful login: {user.email}")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Отзыв токена - добавляем в blacklist"""
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Добавляем токен в blacklist
    blacklisted_token = TokenBlacklist(
        token=token,
        user_id=int(payload["sub"]),
        expires_at=datetime.fromtimestamp(payload["exp"]),
    )
    db.add(blacklisted_token)
    db.commit()

    logger.info(f"Token blacklisted for user: {payload['sub']}")
    return {"detail": "Successfully logged out"}
