import logging
from datetime import datetime

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from backend.auth.email import send_password_reset_email, send_verification_email
from backend.auth.password import normalize_email, validate_password
from backend.auth.rate_limit import check_rate_limit
from backend.security import verify_password
from backend.auth.tokens import (
    generate_reset_token,
    generate_verification_token,
    verify_email_token,
    verify_reset_token,
)
from backend.core.security import create_jwt_token, set_auth_cookie
from backend.database import get_db
from backend.models.user import User
from backend.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/email", tags=["email-auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RequestResetRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def _hash_password(password: str) -> str:
    """Hash password with bcrypt. Truncate to 72 bytes to avoid ValueError."""
    pw_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


@router.post("/register")
async def register(
    data: RegisterRequest, request: Request, db: Session = Depends(get_db)
):
    """Register new user with email/password"""
    try:
        if settings.ENVIRONMENT != "development":
            check_rate_limit(request, "register")
        # Validate password
        is_valid, error = validate_password(data.password)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)

        # Normalize email
        email = normalize_email(data.email)

        # Check if user exists
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(
                status_code=400, detail="Пользователь с таким email уже существует"
            )

        # Create user
        user = User(
            email=email,
            name=data.name or email.split("@")[0],
            hashed_password=_hash_password(data.password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Generate verification token
        token = generate_verification_token(db, user.id)
        send_verification_email(email, token)

        return {
            "message": "Регистрация успешна. Проверьте email для подтверждения.",
            "user_id": user.id,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.exception("register 500: %s", e)
        if settings.ENVIRONMENT == "development":
            raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())
        raise HTTPException(status_code=500, detail="Ошибка регистрации")


@router.post("/login")
async def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    """Login with email/password"""
    try:
        # Normalize email
        email = data.email.lower().strip()
        
        # Find user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        
        if not user.hashed_password:
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        
        # Verify password
        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        
        # Create token
        jwt_token = create_jwt_token(user.id)
        
        return {
            "message": "Вход выполнен успешно",
            "access_token": jwt_token,
            "token_type": "bearer"
        }
    except HTTPException:
        raise
    except Exception as e:
        # Log the actual error
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/verify")
async def verify_email(token: str, response: Response, db: Session = Depends(get_db)):
    """Verify email with token"""
    user_id = verify_email_token(db, token)

    if not user_id:
        raise HTTPException(
            status_code=400, detail="Неверная или истекшая ссылка подтверждения"
        )

    # Mark email as verified
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.email_verified_at = datetime.utcnow()
        db.commit()

        # Auto-login
        jwt_token = create_jwt_token(user.id)
        set_auth_cookie(response, jwt_token)
        
        return {
            "message": "Регистрация успешна",
            "access_token": jwt_token,
            "token_type": "bearer",
            "user_id": user.id,
        }

    return {"message": "Email подтвержден успешно"}


@router.post("/request-reset")
async def request_reset(
    data: RequestResetRequest, request: Request, db: Session = Depends(get_db)
):
    """Request password reset"""
    check_rate_limit(request, "reset")

    email = normalize_email(data.email)
    user = db.query(User).filter(User.email == email).first()

    # Always return success (security: don't reveal if email exists)
    if user and user.hashed_password:
        token = generate_reset_token(db, user.id)
        send_password_reset_email(email, token)

    return {"message": "Если email существует, ссылка для сброса отправлена"}


@router.post("/reset")
async def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password with token"""
    # Validate new password
    is_valid, error = validate_password(data.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    user_id = verify_reset_token(db, data.token)
    if not user_id:
        raise HTTPException(
            status_code=400, detail="Неверная или истекшая ссылка сброса"
        )

    # Update password
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.hashed_password = _hash_password(data.new_password)
        db.commit()

    return {"message": "Пароль успешно изменен"}
