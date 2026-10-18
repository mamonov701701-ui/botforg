"""Optional authentication using the same rules as protected routes."""

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.core.security import get_token_from_cookie
from backend.database import get_db
from backend.dependencies.auth import resolve_current_user
from backend.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/email/login", auto_error=False)


async def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    return resolve_current_user(db, token or get_token_from_cookie(request))
