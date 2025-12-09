from backend.dependencies.auth import get_current_user
from backend.database import get_db
from backend.models.user import User
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(tags=["account"])


class UserProfile(BaseModel):
    id: int
    public_id: int  # 8-значный публичный ID
    email: str
    name: str | None
    avatar: str | None
    providers: list[str]
    role: str

    class Config:
        from_attributes = True


@router.get("/me", response_model=UserProfile)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    providers = [account.provider for account in current_user.accounts]

    return UserProfile(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        providers=providers,
        role=current_user.role,
    )
