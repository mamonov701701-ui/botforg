"""
Fail-closed gate for mock tariff / legacy quota writes (Этап 6.3).

Allowed only when ENVIRONMENT is not production AND ALLOW_DEV_TARIFF_FULFILLMENT=true.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from backend.settings import settings

MSG_DEV_TARIFF_FULFILLMENT_FORBIDDEN = (
    "Смена тарифа и квот через mock API отключена. "
    "Доступно только в non-production при ALLOW_DEV_TARIFF_FULFILLMENT=true."
)


def allow_dev_tariff_fulfillment() -> bool:
    env = (getattr(settings, "ENVIRONMENT", "") or "").strip().lower()
    if env == "production":
        return False
    return bool(getattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", False))


def require_dev_tariff_fulfillment() -> None:
    if not allow_dev_tariff_fulfillment():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=MSG_DEV_TARIFF_FULFILLMENT_FORBIDDEN,
        )
