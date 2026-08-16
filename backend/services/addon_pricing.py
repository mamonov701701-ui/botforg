"""Graduated addon pricing (Этап 7.2). Authoritative Decimal math only."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy.orm import Session

from backend.models.tariff import (
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
    AddonPricingTier,
)
from backend.services.addon_custom_pack import (
    CUSTOM_MESSAGES_CODE,
    CUSTOM_PACK_SELLABLE_RESOURCE_TYPES,
    CUSTOM_PACK_TITLE_RU,
    MAX_CUSTOM_QUANTITY,
    MIN_CUSTOM_QUANTITY,
    PRICING_TIER_RESOURCE_TYPES,
    custom_messages_validity_days,
    ensure_custom_messages_package,
)
from backend.services.addon_package_types import normalize_addon_type
from backend.services.refund_invariants import round_money

UNIT_PRICE_QUANT = Decimal("0.000001")
SNAPSHOT_KIND = "graduated_addon"


class AddonPricingError(Exception):
    def __init__(self, message: str, *, code: str = "pricing_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class QuoteBand:
    tier_id: int
    range_start: int
    range_end: int | None
    units: int
    unit_price: Decimal
    subtotal: Decimal

    def as_snapshot(self) -> dict[str, Any]:
        return {
            "tier_id": self.tier_id,
            "range_start": self.range_start,
            "range_end": self.range_end,
            "units": self.units,
            "unit_price": format(self.unit_price, "f"),
            "subtotal": format(self.subtotal, "f"),
        }


@dataclass(frozen=True)
class CustomAddonQuote:
    resource_type: str
    quantity: int
    currency: str
    total: Decimal
    validity_days: int
    average_unit_price: Decimal
    bands: tuple[QuoteBand, ...] = field(default_factory=tuple)
    checkout_code: str = CUSTOM_MESSAGES_CODE
    product_name: str = CUSTOM_PACK_TITLE_RU
    pricing_grid_version_id: int | None = None

    def as_snapshot(self) -> dict[str, Any]:
        snap: dict[str, Any] = {
            "kind": SNAPSHOT_KIND,
            "resource_type": self.resource_type,
            "quantity": self.quantity,
            "currency": self.currency,
            "total": format(self.total, "f"),
            "average_unit_price": format(self.average_unit_price, "f"),
            "validity_days": self.validity_days,
            "anchor_code": self.checkout_code,
            "product_name": self.product_name,
            "bands": [band.as_snapshot() for band in self.bands],
        }
        if self.pricing_grid_version_id is not None:
            snap["pricing_grid_version_id"] = int(self.pricing_grid_version_id)
        return snap


def normalize_pricing_resource_type(raw: str | None) -> str:
    key = normalize_addon_type(raw)
    if not key or key not in PRICING_TIER_RESOURCE_TYPES:
        raise AddonPricingError(
            "Тип ресурса ценовой ступени: messages или ai_credits",
            code="invalid_resource_type",
        )
    return key


def parse_custom_quantity(raw: Any) -> int:
    try:
        quantity = int(raw)
    except (TypeError, ValueError) as exc:
        raise AddonPricingError(
            "Количество должно быть целым числом",
            code="invalid_quantity",
        ) from exc
    if quantity < MIN_CUSTOM_QUANTITY or quantity > MAX_CUSTOM_QUANTITY:
        raise AddonPricingError(
            f"Количество: от {MIN_CUSTOM_QUANTITY} до {MAX_CUSTOM_QUANTITY}",
            code="invalid_quantity",
        )
    return quantity


def parse_unit_price(raw: Any) -> Decimal:
    if raw is None or raw == "":
        raise AddonPricingError("Цена за единицу обязательна", code="invalid_unit_price")
    try:
        price = Decimal(str(raw))
    except Exception as exc:
        raise AddonPricingError("Некорректная цена за единицу", code="invalid_unit_price") from exc
    if price <= 0:
        raise AddonPricingError(
            "Цена за единицу должна быть больше 0",
            code="invalid_unit_price",
        )
    quantized = price.quantize(UNIT_PRICE_QUANT)
    if quantized != price:
        # Allow values that already fit 6 dp; reject excess precision.
        if price.as_tuple().exponent < -6:
            raise AddonPricingError(
                "Цена за единицу: не более 6 знаков после запятой",
                code="invalid_unit_price",
            )
        quantized = price.quantize(UNIT_PRICE_QUANT)
    return quantized


def parse_range_start(raw: Any) -> int:
    try:
        start = int(raw)
    except (TypeError, ValueError) as exc:
        raise AddonPricingError(
            "Начало диапазона: целое число ≥ 1",
            code="invalid_range_start",
        ) from exc
    if start < 1:
        raise AddonPricingError(
            "Начало диапазона: целое число ≥ 1",
            code="invalid_range_start",
        )
    return start


def parse_range_end(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        end = int(raw)
    except (TypeError, ValueError) as exc:
        raise AddonPricingError(
            "Конец диапазона: целое число или пусто",
            code="invalid_range_end",
        ) from exc
    if end < 1:
        raise AddonPricingError(
            "Конец диапазона: целое число ≥ 1",
            code="invalid_range_end",
        )
    return end


def _tier_sort_key(tier: AddonPricingTier) -> tuple[int, int, int]:
    return (
        int(tier.range_start or 0),
        int(tier.sort_order or 0),
        int(tier.id or 0),
    )


def validate_active_tier_set(tiers: Iterable[AddonPricingTier]) -> list[AddonPricingTier]:
    """Fail-closed integrity of the active set for one resource_type."""
    active = sorted(list(tiers), key=_tier_sort_key)
    if not active:
        return []

    currencies = {(t.currency or "RUB").strip().upper() for t in active}
    if len(currencies) > 1:
        raise AddonPricingError(
            "Активные ступени одного ресурса должны быть в одной валюте",
            code="pricing_currency_mismatch",
        )

    prev_end: int | None = None
    for index, tier in enumerate(active):
        start = int(tier.range_start)
        end = int(tier.range_end) if tier.range_end is not None else None
        if start < 1:
            raise AddonPricingError(
                "Начало диапазона должно быть ≥ 1",
                code="invalid_range_start",
            )
        if end is not None and end < start:
            raise AddonPricingError(
                "Конец диапазона не может быть меньше начала",
                code="invalid_range",
            )
        unit = Decimal(str(tier.unit_price))
        if unit <= 0:
            raise AddonPricingError(
                "Цена за единицу должна быть больше 0",
                code="invalid_unit_price",
            )
        if index == 0:
            if start != 1:
                raise AddonPricingError(
                    "Активные ступени должны начинаться с 1",
                    code="pricing_sequence_invalid",
                )
        else:
            if prev_end is None:
                raise AddonPricingError(
                    "Открытая ступень может быть только последней",
                    code="pricing_overlap",
                )
            if start <= prev_end:
                raise AddonPricingError(
                    "Диапазоны активных ступеней не должны пересекаться",
                    code="pricing_overlap",
                )
            if start != prev_end + 1:
                raise AddonPricingError(
                    "Между активными ступенями не должно быть разрывов",
                    code="pricing_gap",
                )
        prev_end = end
    return active


def load_active_tiers(
    db: Session,
    *,
    resource_type: str,
    currency: str | None = None,
) -> list[AddonPricingTier]:
    """Load tiers from the ACTIVE grid version for resource_type (fail-closed)."""
    q = db.query(AddonPricingGridVersion).filter(
        AddonPricingGridVersion.resource_type == resource_type,
        AddonPricingGridVersion.status == AddonPricingGridVersionStatus.ACTIVE.value,
    )
    if currency:
        q = q.filter(
            AddonPricingGridVersion.currency == str(currency).strip().upper()
        )
    versions = q.order_by(AddonPricingGridVersion.id.desc()).all()
    if not versions:
        raise AddonPricingError(
            "Нет активной версии ценовой сетки",
            code="pricing_unavailable",
        )
    if len(versions) > 1 and not currency:
        rub = [v for v in versions if str(v.currency or "").upper() == "RUB"]
        if len(rub) == 1:
            version = rub[0]
        else:
            raise AddonPricingError(
                "Несколько активных сеток для ресурса — укажите валюту",
                code="pricing_unavailable",
            )
    else:
        version = versions[0]
    rows = (
        db.query(AddonPricingTier)
        .filter(AddonPricingTier.grid_version_id == int(version.id))
        .all()
    )
    if not rows:
        raise AddonPricingError(
            "Нет активных ценовых ступеней для расчёта",
            code="pricing_unavailable",
        )
    validated = validate_active_tier_set(rows)
    for tier in validated:
        setattr(tier, "_pricing_grid_version_id", int(version.id))
    return validated


def quote_graduated(
    quantity: int,
    tiers: Iterable[AddonPricingTier],
    *,
    resource_type: str,
    validity_days: int,
    checkout_code: str = CUSTOM_MESSAGES_CODE,
    product_name: str = CUSTOM_PACK_TITLE_RU,
    pricing_grid_version_id: int | None = None,
) -> CustomAddonQuote:
    qty = parse_custom_quantity(quantity)
    active = validate_active_tier_set(tiers)
    if not active:
        raise AddonPricingError(
            "Нет активных ценовых ступеней для расчёта",
            code="pricing_unavailable",
        )

    currency = (active[0].currency or "RUB").strip().upper() or "RUB"
    grid_version_id = pricing_grid_version_id
    if grid_version_id is None:
        raw = getattr(active[0], "_pricing_grid_version_id", None)
        if raw is not None:
            grid_version_id = int(raw)
        elif getattr(active[0], "grid_version_id", None) is not None:
            grid_version_id = int(active[0].grid_version_id)

    bands: list[QuoteBand] = []
    priced_units = 0
    for tier in active:
        start = int(tier.range_start)
        end = int(tier.range_end) if tier.range_end is not None else qty
        lo = max(start, 1)
        hi = min(end, qty)
        if hi < lo:
            continue
        units = hi - lo + 1
        unit_price = Decimal(str(tier.unit_price)).quantize(UNIT_PRICE_QUANT)
        subtotal = round_money(Decimal(units) * unit_price)
        bands.append(
            QuoteBand(
                tier_id=int(tier.id),
                range_start=start,
                range_end=int(tier.range_end) if tier.range_end is not None else None,
                units=units,
                unit_price=unit_price,
                subtotal=subtotal,
            )
        )
        priced_units += units

    if priced_units != qty:
        raise AddonPricingError(
            "Невозможно рассчитать стоимость: нет полной ценовой конфигурации для этого количества",
            code="pricing_incomplete",
        )

    total = round_money(sum((band.subtotal for band in bands), Decimal("0.00")))
    average = (
        round_money(total / Decimal(qty)) if qty > 0 else Decimal("0.00")
    )
    return CustomAddonQuote(
        resource_type=resource_type,
        quantity=qty,
        currency=currency,
        total=total,
        validity_days=int(validity_days),
        average_unit_price=average,
        bands=tuple(bands),
        checkout_code=checkout_code,
        product_name=product_name,
        pricing_grid_version_id=grid_version_id,
    )


def quote_custom_messages(db: Session, *, quantity: int) -> CustomAddonQuote:
    qty = parse_custom_quantity(quantity)
    pkg = ensure_custom_messages_package(db)
    tiers = load_active_tiers(db, resource_type="messages")
    return quote_graduated(
        qty,
        tiers,
        resource_type="messages",
        validity_days=custom_messages_validity_days(pkg),
        checkout_code=CUSTOM_MESSAGES_CODE,
        product_name=(pkg.name_ru or CUSTOM_PACK_TITLE_RU).strip() or CUSTOM_PACK_TITLE_RU,
    )


def assert_custom_pack_sellable(resource_type: str) -> None:
    if resource_type not in CUSTOM_PACK_SELLABLE_RESOURCE_TYPES:
        raise AddonPricingError(
            "Настраиваемый пакет для этого ресурса пока недоступен",
            code="custom_pack_not_available",
        )
