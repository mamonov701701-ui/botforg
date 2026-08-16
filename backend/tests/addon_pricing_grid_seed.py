"""Test helpers for versioned addon pricing grids (Этап 7.2)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable, Sequence

from sqlalchemy.orm import Session

from backend.models.tariff import (
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
    AddonPricingTier,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


DEFAULT_MESSAGE_TIERS: list[tuple[int, int | None, str]] = [
    (1, 999, "0.30"),
    (1000, 4999, "0.22"),
    (5000, 9999, "0.18"),
    (10000, None, "0.15"),
]


def clear_pricing_grids(db: Session, *, resource_type: str | None = None) -> None:
    """Delete tiers (and optionally only matching resource) then orphan versions."""
    if resource_type:
        versions = (
            db.query(AddonPricingGridVersion)
            .filter(AddonPricingGridVersion.resource_type == resource_type)
            .all()
        )
        vids = [int(v.id) for v in versions]
        if vids:
            db.query(AddonPricingTier).filter(
                AddonPricingTier.grid_version_id.in_(vids)
            ).delete(synchronize_session=False)
            db.query(AddonPricingGridVersion).filter(
                AddonPricingGridVersion.id.in_(vids)
            ).delete(synchronize_session=False)
    else:
        db.query(AddonPricingTier).delete()
        db.query(AddonPricingGridVersion).delete()
    db.commit()


def seed_active_message_grid(
    db: Session,
    tiers_spec: Sequence[tuple[int, int | None, str]] | None = None,
    *,
    currency: str = "RUB",
    resource_type: str = "messages",
) -> AddonPricingGridVersion:
    """
    Create one ACTIVE grid version with the given tiers.

    ``tiers_spec`` items: (range_start, range_end|None, unit_price_str)
    """
    clear_pricing_grids(db, resource_type=resource_type)
    now = _utcnow()
    version = AddonPricingGridVersion(
        resource_type=resource_type,
        currency=currency.upper(),
        status=AddonPricingGridVersionStatus.ACTIVE.value,
        version_number=1,
        based_on_version_id=None,
        created_at=now,
        published_at=now,
        note="test seed",
    )
    db.add(version)
    db.flush()

    spec = list(tiers_spec) if tiers_spec is not None else list(DEFAULT_MESSAGE_TIERS)
    for start, end, price in spec:
        db.add(
            AddonPricingTier(
                grid_version_id=int(version.id),
                resource_type=resource_type,
                range_start=int(start),
                range_end=int(end) if end is not None else None,
                unit_price=Decimal(price),
                currency=currency.upper(),
                is_active=True,
                sort_order=int(start),
            )
        )
    db.commit()
    db.refresh(version)
    return version


def seed_active_grid_from_iterable(
    db: Session,
    *,
    resource_type: str,
    currency: str,
    tiers: Iterable[AddonPricingTier],
) -> AddonPricingGridVersion:
    """Attach pre-built in-memory tier shapes into a new ACTIVE version."""
    clear_pricing_grids(db, resource_type=resource_type)
    now = _utcnow()
    version = AddonPricingGridVersion(
        resource_type=resource_type,
        currency=currency.upper(),
        status=AddonPricingGridVersionStatus.ACTIVE.value,
        version_number=1,
        created_at=now,
        published_at=now,
    )
    db.add(version)
    db.flush()
    for src in tiers:
        db.add(
            AddonPricingTier(
                grid_version_id=int(version.id),
                resource_type=resource_type,
                range_start=int(src.range_start),
                range_end=int(src.range_end) if src.range_end is not None else None,
                unit_price=src.unit_price,
                currency=currency.upper(),
                is_active=True,
                sort_order=int(src.sort_order or src.range_start or 0),
            )
        )
    db.commit()
    db.refresh(version)
    return version
