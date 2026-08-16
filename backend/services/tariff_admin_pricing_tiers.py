"""Admin CRUD for AddonPricingTier — thin compat over grid versions (Этап 7.2)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.tariff import (
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
    AddonPricingTier,
)
from backend.services.addon_custom_pack import PRICING_TIER_RESOURCE_TYPES
from backend.services.addon_pricing import AddonPricingError, load_active_tiers
from backend.services.tariff_admin_pricing_grids import (
    _tier_row,
    _used_map,
    tier_snapshot,
)

ENTITY_PRICING_TIER = "addon_pricing_tier"
ACTION_TIER_CREATED = "addon_pricing_tier_created"
ACTION_TIER_UPDATED = "addon_pricing_tier_updated"
ACTION_TIER_ARCHIVED = "addon_pricing_tier_archived"
ACTION_TIER_REACTIVATED = "addon_pricing_tier_reactivated"
ACTION_TIER_DELETED = "addon_pricing_tier_deleted"

PRICING_TIER_AUDIT_ACTIONS: tuple[str, ...] = (
    ACTION_TIER_CREATED,
    ACTION_TIER_UPDATED,
    ACTION_TIER_ARCHIVED,
    ACTION_TIER_REACTIVATED,
    ACTION_TIER_DELETED,
)

_GONE_DETAIL = {
    "code": "use_pricing_grid_api",
    "message": (
        "Плоское редактирование ступеней отключено. "
        "Используйте /api/admin/tariffs/addon-pricing-grids"
    ),
}


def _gone() -> HTTPException:
    return HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


def get_admin_tier_or_404(db: Session, tier_id: int) -> AddonPricingTier:
    tier = db.query(AddonPricingTier).filter(AddonPricingTier.id == tier_id).first()
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tier_not_found", "message": "Ценовая ступень не найдена"},
        )
    return tier


def list_admin_pricing_tiers(db: Session) -> list[dict[str, Any]]:
    """Return tiers belonging to all ACTIVE grid versions (compat list)."""
    active_versions = (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.status
            == AddonPricingGridVersionStatus.ACTIVE.value
        )
        .all()
    )
    version_ids = [int(v.id) for v in active_versions]
    if not version_ids:
        return []
    tiers = (
        db.query(AddonPricingTier)
        .filter(AddonPricingTier.grid_version_id.in_(version_ids))
        .order_by(
            AddonPricingTier.resource_type.asc(),
            AddonPricingTier.range_start.asc(),
            AddonPricingTier.id.asc(),
        )
        .all()
    )
    used = _used_map(db, tiers)
    rows: list[dict[str, Any]] = []
    for t in tiers:
        row = _tier_row(t, used_in_purchases=used.get(int(t.id), False))
        row["grid_version_id"] = int(t.grid_version_id) if t.grid_version_id else None
        rows.append(row)
    return rows


def create_admin_pricing_tier(
    db: Session,
    *,
    payload: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    raise _gone()


def update_admin_pricing_tier(
    db: Session,
    *,
    tier_id: int,
    patch: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    raise _gone()


def archive_admin_pricing_tier(
    db: Session,
    *,
    tier_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    raise _gone()


def reactivate_admin_pricing_tier(
    db: Session,
    *,
    tier_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    raise _gone()


def delete_admin_pricing_tier(
    db: Session,
    *,
    tier_id: int,
    admin_user_id: int,
) -> None:
    raise _gone()


def preview_active_tiers(db: Session, *, resource_type: str) -> list[AddonPricingTier]:
    if resource_type not in PRICING_TIER_RESOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_resource_type", "message": "Неизвестный тип ресурса"},
        )
    try:
        return load_active_tiers(db, resource_type=resource_type)
    except AddonPricingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


# Re-export for any callers that imported tier_snapshot from this module.
__all__ = [
    "ENTITY_PRICING_TIER",
    "PRICING_TIER_AUDIT_ACTIONS",
    "archive_admin_pricing_tier",
    "create_admin_pricing_tier",
    "delete_admin_pricing_tier",
    "get_admin_tier_or_404",
    "list_admin_pricing_tiers",
    "preview_active_tiers",
    "reactivate_admin_pricing_tier",
    "tier_snapshot",
    "update_admin_pricing_tier",
]
