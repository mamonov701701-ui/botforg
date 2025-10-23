from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.core.security import get_token_from_cookie, verify_jwt_token
from backend.database import get_db
from backend.models.user import User


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Get current authenticated user from JWT cookie"""
    token = get_token_from_cookie(request)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    user_id = verify_jwt_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    return user


async def get_current_user_optional(
    request: Request, db: Session = Depends(get_db)
) -> User | None:
    """Get current user or None if not authenticated"""
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None
