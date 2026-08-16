"""Reserved custom-pack catalog anchors (Этап 7.2)."""
from __future__ import annotations

from typing import Any

from decimal import Decimal

from sqlalchemy.orm import Session

from backend.models.tariff import AddonPackage, AddonPackageType
from backend.services.addon_package_types import enum_value
from backend.services.addon_validity import DEFAULT_ADDON_VALIDITY_DAYS

CUSTOM_MESSAGES_CODE = "custom_messages"
CUSTOM_PACK_TITLE_RU = "Настроить пакет"
CUSTOM_PACK_DESCRIPTION_RU = (
    "Укажите нужное количество сообщений. Итоговую стоимость рассчитывает сервер."
)

# Architecture allows later custom packs; only messages is publicly buyable now.
CUSTOM_PACK_SELLABLE_RESOURCE_TYPES: frozenset[str] = frozenset(
    {AddonPackageType.MESSAGES.value}
)
PRICING_TIER_RESOURCE_TYPES: frozenset[str] = frozenset(
    {
        AddonPackageType.MESSAGES.value,
        AddonPackageType.AI_CREDITS.value,
    }
)
RESERVED_ADDON_CODES: frozenset[str] = frozenset({CUSTOM_MESSAGES_CODE})

MAX_CUSTOM_QUANTITY = 1_000_000
MIN_CUSTOM_QUANTITY = 1

CAPACITY_ADDON_TYPES: frozenset[str] = frozenset(
    {
        AddonPackageType.ACTIVE_BOT.value,
        AddonPackageType.TEAM_MEMBER.value,
    }
)


def is_reserved_addon_code(code: Any) -> bool:
    return str(code or "").strip().lower() in RESERVED_ADDON_CODES


def is_custom_messages_code(code: Any) -> bool:
    return str(code or "").strip().lower() == CUSTOM_MESSAGES_CODE


def is_capacity_addon_type(value: Any) -> bool:
    return enum_value(value) in CAPACITY_ADDON_TYPES


def is_message_addon_type(value: Any) -> bool:
    return enum_value(value) == AddonPackageType.MESSAGES.value


def get_custom_messages_package(db: Session) -> AddonPackage | None:
    return (
        db.query(AddonPackage)
        .filter(AddonPackage.code == CUSTOM_MESSAGES_CODE)
        .first()
    )


def ensure_custom_messages_package(db: Session) -> AddonPackage:
    """
    Idempotent get-or-create for the hidden ``custom_messages`` catalog anchor.

    Why runtime (not migration-only):
    - Migration 036 seeds the row on upgrade, but stamped/legacy SQLite DBs and
      incomplete test fixtures may lack it while FK still requires a package id.
    - Production traffic should already have the seed; this path is a fail-safe,
      not the primary provisioning mechanism.

    Safe under concurrent create: unique ``code`` + SAVEPOINT/IntegrityError → re-select.
    Never invents public sellable prices (price stays 0; quote is authoritative).
    """
    from sqlalchemy.exc import IntegrityError

    pkg = get_custom_messages_package(db)
    if pkg is not None:
        if not bool(pkg.is_active):
            pkg.is_active = True
            db.flush()
        return pkg
    try:
        with db.begin_nested():
            pkg = AddonPackage(
                code=CUSTOM_MESSAGES_CODE,
                name_ru=CUSTOM_PACK_TITLE_RU,
                description_ru=CUSTOM_PACK_DESCRIPTION_RU,
                type=AddonPackageType.MESSAGES,
                amount=0,
                price=Decimal("0.00"),
                currency="RUB",
                duration_type="current_period",
                validity_days=DEFAULT_ADDON_VALIDITY_DAYS,
                is_active=True,
                is_public=False,
                sort_order=10000,
            )
            db.add(pkg)
            db.flush()
        return pkg
    except IntegrityError:
        existing = get_custom_messages_package(db)
        if existing is None:
            raise
        return existing


def custom_messages_validity_days(pkg: AddonPackage | None) -> int:
    if pkg is None:
        return DEFAULT_ADDON_VALIDITY_DAYS
    try:
        days = int(pkg.validity_days or DEFAULT_ADDON_VALIDITY_DAYS)
    except (TypeError, ValueError):
        return DEFAULT_ADDON_VALIDITY_DAYS
    return days if days > 0 else DEFAULT_ADDON_VALIDITY_DAYS
