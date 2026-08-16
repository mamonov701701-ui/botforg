"""Canonical AddonPackage.type values and admin aliases (Этап 7.2)."""
from __future__ import annotations

from typing import Any

from backend.models.tariff import AddonPackageType

# Stored / public-catalog values. `bots` is an admin alias of active_bot.
STORED_ADDON_TYPES: tuple[str, ...] = (
    AddonPackageType.MESSAGES.value,
    AddonPackageType.ACTIVE_BOT.value,
    AddonPackageType.TEAM_MEMBER.value,
    AddonPackageType.AI_CREDITS.value,
)

# Types that checkout / public catalog may sell today.
SELLABLE_ADDON_TYPES: frozenset[str] = frozenset(
    {
        AddonPackageType.MESSAGES.value,
        AddonPackageType.ACTIVE_BOT.value,
        AddonPackageType.TEAM_MEMBER.value,
    }
)

# Admin/API aliases → stored enum value. Do not persist aliases.
ADDON_TYPE_ALIASES: dict[str, str] = {
    "bots": AddonPackageType.ACTIVE_BOT.value,
    "bot": AddonPackageType.ACTIVE_BOT.value,
    "active_bots": AddonPackageType.ACTIVE_BOT.value,
    "members": AddonPackageType.TEAM_MEMBER.value,
    "team_members": AddonPackageType.TEAM_MEMBER.value,
}

ADDON_TYPE_LABELS_RU: dict[str, str] = {
    AddonPackageType.MESSAGES.value: "Сообщения",
    AddonPackageType.ACTIVE_BOT.value: "Боты",
    AddonPackageType.TEAM_MEMBER.value: "Участники команды",
    AddonPackageType.AI_CREDITS.value: "ИИ-кредиты",
}


def enum_value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value or "")


def normalize_addon_type(raw: str | None) -> str | None:
    """Lower/strip and map aliases. Unknown values returned as-is (caller validates)."""
    if raw is None:
        return None
    key = str(raw).strip().lower()
    if not key:
        return None
    return ADDON_TYPE_ALIASES.get(key, key)


def is_stored_addon_type(value: str) -> bool:
    return value in STORED_ADDON_TYPES


def is_sellable_addon_type(value: Any) -> bool:
    return enum_value(value) in SELLABLE_ADDON_TYPES
