"""Graduated addon pricing: validation and authoritative quote (Этап 7.2)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.tariff import AddonPricingTier
from backend.services.addon_pricing import (
    AddonPricingError,
    quote_graduated,
    validate_active_tier_set,
)


def _tier(
    *,
    id: int,
    start: int,
    end: int | None,
    price: str,
    currency: str = "RUB",
    active: bool = True,
) -> AddonPricingTier:
    t = AddonPricingTier(
        resource_type="messages",
        range_start=start,
        range_end=end,
        unit_price=Decimal(price),
        currency=currency,
        is_active=active,
        sort_order=start,
    )
    t.id = id
    return t


def _standard_tiers() -> list[AddonPricingTier]:
    # Illustrative fixture rates only — not BotForg commercial prices.
    return [
        _tier(id=1, start=1, end=999, price="0.30"),
        _tier(id=2, start=1000, end=4999, price="0.22"),
        _tier(id=3, start=5000, end=9999, price="0.18"),
        _tier(id=4, start=10000, end=None, price="0.15"),
    ]


def test_validate_rejects_overlap():
    tiers = [
        _tier(id=1, start=1, end=1000, price="0.30"),
        _tier(id=2, start=1000, end=2000, price="0.22"),
    ]
    with pytest.raises(AddonPricingError) as exc:
        validate_active_tier_set(tiers)
    assert exc.value.code == "pricing_overlap"


def test_validate_rejects_gap():
    tiers = [
        _tier(id=1, start=1, end=999, price="0.30"),
        _tier(id=2, start=2000, end=3000, price="0.22"),
    ]
    with pytest.raises(AddonPricingError) as exc:
        validate_active_tier_set(tiers)
    assert exc.value.code == "pricing_gap"


def test_validate_rejects_start_not_one():
    with pytest.raises(AddonPricingError) as exc:
        validate_active_tier_set([_tier(id=1, start=10, end=20, price="0.30")])
    assert exc.value.code == "pricing_sequence_invalid"


def test_validate_rejects_negative_and_zero_price():
    with pytest.raises(AddonPricingError):
        validate_active_tier_set([_tier(id=1, start=1, end=10, price="0")])


def test_graduated_3450_splits_across_two_bands():
    quote = quote_graduated(
        3450,
        _standard_tiers(),
        resource_type="messages",
        validity_days=30,
    )
    assert quote.quantity == 3450
    assert quote.bands[0].units == 999
    assert quote.bands[1].units == 2451
    assert quote.bands[0].unit_price == Decimal("0.300000")
    assert quote.bands[1].unit_price == Decimal("0.220000")
    assert quote.total == Decimal("838.92")
    assert sum(b.units for b in quote.bands) == 3450


def test_boundary_999_uses_only_first_band():
    quote = quote_graduated(999, _standard_tiers(), resource_type="messages", validity_days=30)
    assert len(quote.bands) == 1
    assert quote.bands[0].units == 999
    assert quote.total == Decimal("299.70")


def test_boundary_1000_splits_one_unit_into_second_band():
    quote = quote_graduated(1000, _standard_tiers(), resource_type="messages", validity_days=30)
    assert quote.bands[0].units == 999
    assert quote.bands[1].units == 1
    assert quote.total == Decimal("299.92")


def test_boundary_matrix_standard_tiers():
    """Authoritative graduated totals for key quantities (no float)."""
    tiers = _standard_tiers()
    cases = [
        (1, Decimal("0.30")),
        (998, Decimal("299.40")),
        (999, Decimal("299.70")),
        (1000, Decimal("299.92")),
        (1001, Decimal("300.14")),
        (3450, Decimal("838.92")),
        (4999, Decimal("1179.70")),
        (5000, Decimal("1179.88")),
        (5001, Decimal("1180.06")),
        (100_000, Decimal("15579.85")),
    ]
    for qty, expected in cases:
        quote = quote_graduated(qty, tiers, resource_type="messages", validity_days=30)
        assert quote.total == expected, f"qty={qty}"
        assert sum(b.units for b in quote.bands) == qty
        assert not isinstance(quote.total, float)


def test_quantity_beyond_last_closed_band_fails_closed():
    tiers = [
        _tier(id=1, start=1, end=999, price="0.30"),
        _tier(id=2, start=1000, end=1999, price="0.22"),
    ]
    with pytest.raises(AddonPricingError) as exc:
        quote_graduated(2000, tiers, resource_type="messages", validity_days=30)
    assert exc.value.code == "pricing_incomplete"


def test_empty_tiers_unavailable():
    with pytest.raises(AddonPricingError) as exc:
        quote_graduated(10, [], resource_type="messages", validity_days=30)
    assert exc.value.code == "pricing_unavailable"
