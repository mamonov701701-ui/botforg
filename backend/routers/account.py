from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth.deps import get_current_user
from backend.models.user import User
from pydantic import BaseModel

router = APIRouter(tags=["account"])


class UserProfile(BaseModel):
    id: int
    email: str
    name: str | None
    avatar: str | None
    providers: list[str]
    
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
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        providers=providers
    )

