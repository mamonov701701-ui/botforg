"""
API для получения своих BF-ролей
"""
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from backend.database import get_db
from backend.models.user import User
from backend.models.platform_role import PlatformRole
from backend.dependencies.auth import get_current_user


router = APIRouter(prefix="/api/my-roles", tags=["My Roles"])


class MyPlatformRole(BaseModel):
    role_name: str
    granted_at: datetime
    expires_at: datetime | None
    is_active: bool
    
    class Config:
        from_attributes = True


@router.get("", response_model=List[MyPlatformRole])
async def get_my_platform_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить свои BF-роли"""
    roles = db.query(PlatformRole).filter(
        PlatformRole.user_id == current_user.id,
        PlatformRole.is_active == True
    ).all()
    
    # Фильтруем только активные и не истекшие
    valid_roles = [role for role in roles if role.is_valid()]
    
    return valid_roles

