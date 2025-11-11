"""
API для управления безопасностью пользователя
Смена email, пароля с проверками безопасности
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from backend.database import get_db
from backend.models.user import User
from backend.dependencies.auth import get_current_user
from backend.security import verify_password, get_password_hash


router = APIRouter(prefix="/api/user/security", tags=["User Security"])


# === Schemas ===

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class VerifyPasswordRequest(BaseModel):
    password: str


# === Endpoints ===

@router.post("/change-email")
async def change_email(
    data: ChangeEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Изменить email пользователя
    Требует подтверждения текущим паролем
    """
    # Проверяем текущий пароль
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="Невозможно изменить email для OAuth пользователя"
        )
    
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    
    # Проверяем, не занят ли новый email
    existing_user = db.query(User).filter(User.email == data.new_email).first()
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(status_code=400, detail="Email уже используется")
    
    # Обновляем email
    old_email = current_user.email
    current_user.email = data.new_email
    current_user.email_verified_at = None  # Требуем повторной верификации
    
    db.commit()
    
    return {
        "detail": "Email успешно изменен",
        "old_email": old_email,
        "new_email": data.new_email,
        "requires_verification": True
    }


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Изменить пароль пользователя
    Требует подтверждения текущим паролем
    """
    # Проверяем текущий пароль
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="Невозможно установить пароль для OAuth пользователя"
        )
    
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    
    # Проверяем минимальную длину нового пароля
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Новый пароль должен содержать минимум 6 символов"
        )
    
    # Проверяем что новый пароль отличается от текущего
    if verify_password(data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Новый пароль должен отличаться от текущего"
        )
    
    # Обновляем пароль
    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.password_hash = current_user.hashed_password  # Alias
    
    db.commit()
    
    return {
        "detail": "Пароль успешно изменен"
    }


@router.post("/verify-password")
async def verify_user_password(
    data: VerifyPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Проверить текущий пароль пользователя
    Используется для подтверждения критичных операций
    """
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="OAuth пользователи не имеют пароля"
        )
    
    is_valid = verify_password(data.password, current_user.hashed_password)
    
    if not is_valid:
        raise HTTPException(status_code=400, detail="Неверный пароль")
    
    return {"detail": "Пароль верный", "verified": True}

