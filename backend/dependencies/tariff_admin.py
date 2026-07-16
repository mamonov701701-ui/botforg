"""
Доступ к admin API тарифных подарков (Этап 6.4).

Разрешено:
- User.role in {owner, admin};
- либо активная BF-роль «BF Администратор».
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.platform_role import PlatformRole
from backend.models.user import User

TARIFF_ADMIN_USER_ROLES = frozenset({"owner", "admin"})
TARIFF_ADMIN_PLATFORM_ROLES = frozenset({"BF Администратор"})

MSG_TARIFF_ADMIN_FORBIDDEN = (
    "Недостаточно прав для управления подарочными начислениями тарифов"
)


def require_tariff_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if (current_user.role or "").strip().lower() in TARIFF_ADMIN_USER_ROLES:
        return current_user

    roles = (
        db.query(PlatformRole)
        .filter(
            PlatformRole.user_id == current_user.id,
            PlatformRole.is_active.is_(True),
            PlatformRole.role_name.in_(tuple(TARIFF_ADMIN_PLATFORM_ROLES)),
        )
        .all()
    )
    for role in roles:
        if role.is_valid():
            return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=MSG_TARIFF_ADMIN_FORBIDDEN,
    )
