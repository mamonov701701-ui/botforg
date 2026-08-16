"""Read-only admin view of the system custom messages product (not CRUD)."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.models.tariff import (
    AddonPackageType,
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
)
from backend.services.addon_custom_pack import (
    CUSTOM_MESSAGES_CODE,
    CUSTOM_PACK_TITLE_RU,
    MAX_CUSTOM_QUANTITY,
    MIN_CUSTOM_QUANTITY,
    custom_messages_validity_days,
    ensure_custom_messages_package,
)
from backend.services.addon_validity import DEFAULT_ADDON_VALIDITY_DAYS


def get_custom_messages_system_product(db: Session) -> dict[str, Any]:
    """
    System product card for admin Packages tab.

    Not an editable AddonPackage row in CRUD — sales status follows active grid.
    """
    pkg = ensure_custom_messages_package(db)
    active = (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.resource_type == AddonPackageType.MESSAGES.value,
            AddonPricingGridVersion.status == AddonPricingGridVersionStatus.ACTIVE.value,
            AddonPricingGridVersion.currency == (pkg.currency or "RUB").strip().upper(),
        )
        .order_by(AddonPricingGridVersion.id.desc())
        .first()
    )
    # Prefer RUB messages grid if package currency mismatch / empty.
    if active is None:
        active = (
            db.query(AddonPricingGridVersion)
            .filter(
                AddonPricingGridVersion.resource_type
                == AddonPackageType.MESSAGES.value,
                AddonPricingGridVersion.status
                == AddonPricingGridVersionStatus.ACTIVE.value,
            )
            .order_by(AddonPricingGridVersion.id.desc())
            .first()
        )

    sales_enabled = active is not None
    currency = (
        str(active.currency if active is not None else (pkg.currency or "RUB"))
        .strip()
        .upper()
        or "RUB"
    )
    validity = custom_messages_validity_days(pkg)
    return {
        "code": CUSTOM_MESSAGES_CODE,
        "title": "Настраиваемый пакет сообщений",
        "public_title": CUSTOM_PACK_TITLE_RU,
        "resource_type": AddonPackageType.MESSAGES.value,
        "sales_enabled": sales_enabled,
        "sales_status_label": (
            "Продажи включены"
            if sales_enabled
            else "Продажи выключены — нет активной ценовой сетки"
        ),
        "active_grid_version_id": int(active.id) if active is not None else None,
        "active_grid_version_number": (
            int(active.version_number) if active is not None else None
        ),
        "currency": currency,
        "validity_days": int(validity) if validity else DEFAULT_ADDON_VALIDITY_DAYS,
        "min_quantity": int(MIN_CUSTOM_QUANTITY),
        "max_quantity": int(MAX_CUSTOM_QUANTITY),
        "pricing_grids_hint": "Управление ценами — во вкладке «Ценовые ступени».",
    }
