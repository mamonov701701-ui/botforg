"""
Права для PaymentProviderConnection (Этап 6.10A).

Просмотр безопасных статусов: owner / admin / BF Администратор.
Операции с credentials (create с секретами, replace, verify decrypt, delete):
только platform owner.

Отдельной привилегии manage_payment_credentials в текущей RBAC нет —
используется User.role == owner (документировано для будущего расширения).
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status

from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User

MSG_CREDENTIALS_FORBIDDEN = (
    "Недостаточно прав для управления секретами платёжных подключений "
    "(требуется platform owner)"
)


def require_payment_connection_viewer(
    current_user: User = Depends(require_tariff_admin),
) -> User:
    """owner / admin / BF Администратор — уже проверено require_tariff_admin."""
    return current_user


def require_payment_credentials_manager(
    current_user: User = Depends(require_tariff_admin),
) -> User:
    """Только platform owner для plaintext credentials write/verify/delete."""
    if (current_user.role or "").strip().lower() != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=MSG_CREDENTIALS_FORBIDDEN,
        )
    return current_user
