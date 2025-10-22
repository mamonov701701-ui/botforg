from fastapi import APIRouter, Request, Response, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from backend.database import get_db
from backend.models.user import User
from backend.auth.password import (
    hash_password, verify_password, validate_password, normalize_email
)
from backend.auth.tokens import (
    generate_verification_token, generate_reset_token,
    verify_email_token, verify_reset_token
)
from backend.auth.email import send_verification_email, send_password_reset_email
from backend.auth.rate_limit import check_rate_limit
from backend.core.security import create_jwt_token, set_auth_cookie
from backend.settings import settings
from datetime import datetime

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


@router.post("/register")
async def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Register new user with email/password"""
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
            status_code=400,
            detail="Пользователь с таким email уже существует"
        )
    
    # Create user
    user = User(
        email=email,
        name=data.name or email.split("@")[0],
        password_hash=hash_password(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate verification token
    token = generate_verification_token(db, user.id)
    send_verification_email(email, token)
    
    return {
        "message": "Регистрация успешна. Проверьте email для подтверждения.",
        "user_id": user.id
    }


@router.post("/login")
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Login with email/password"""
    check_rate_limit(request, "login")
    
    email = normalize_email(data.email)
    
    # Find user
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=401,
            detail="Неверный email или пароль"
        )
    
    # Verify password
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Неверный email или пароль"
        )
    
    # Check email verified (if required)
    if settings.REQUIRE_EMAIL_VERIFICATION and not user.email_verified_at:
        raise HTTPException(
            status_code=403,
            detail="Email не подтвержден. Проверьте почту."
        )
    
    # Create session
    jwt_token = create_jwt_token(user.id)
    set_auth_cookie(response, jwt_token)
    
    return {"message": "Вход выполнен успешно"}


@router.get("/verify")
async def verify_email(
    token: str,
    response: Response,
    db: Session = Depends(get_db)
):
    """Verify email with token"""
    user_id = verify_email_token(db, token)
    
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Неверная или истекшая ссылка подтверждения"
        )
    
    # Mark email as verified
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.email_verified_at = datetime.utcnow()
        db.commit()
        
        # Auto-login
        jwt_token = create_jwt_token(user.id)
        set_auth_cookie(response, jwt_token)
    
    return {"message": "Email подтвержден успешно"}


@router.post("/request-reset")
async def request_reset(
    data: RequestResetRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Request password reset"""
    check_rate_limit(request, "reset")
    
    email = normalize_email(data.email)
    user = db.query(User).filter(User.email == email).first()
    
    # Always return success (security: don't reveal if email exists)
    if user and user.password_hash:
        token = generate_reset_token(db, user.id)
        send_password_reset_email(email, token)
    
    return {"message": "Если email существует, ссылка для сброса отправлена"}


@router.post("/reset")
async def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """Reset password with token"""
    # Validate new password
    is_valid, error = validate_password(data.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    user_id = verify_reset_token(db, data.token)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Неверная или истекшая ссылка сброса"
        )
    
    # Update password
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.password_hash = hash_password(data.new_password)
        db.commit()
    
    return {"message": "Пароль успешно изменен"}

