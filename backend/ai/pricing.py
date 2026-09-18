"""Versioned, provider-neutral pricing helpers; no real provider prices live here."""
from __future__ import annotations

from decimal import Decimal


class AiPricingError(ValueError):
    pass


def maximum_reservation(rule: dict) -> int:
    amount = int((rule or {}).get("maximum_ai_credits", 0))
    if amount <= 0:
        raise AiPricingError("model_has_no_reservable_price")
    return amount


def calculate_charge(rule: dict, usage: dict) -> int:
    """Generic unit-rate calculator, deliberately not token-only.

    Rules can contain a fixed ``ai_credits_per_request`` and/or
    ``ai_credits_per_<usage-dimension>`` values, e.g. images or seconds.
    """
    rule, usage = rule or {}, usage or {}
    total = Decimal(str(rule.get("ai_credits_per_request", 0)))
    for unit, value in usage.items():
        rate = rule.get(f"ai_credits_per_{unit}")
        if rate is not None:
            total += Decimal(str(rate)) * Decimal(str(value))
    if total != total.to_integral_value():
        raise AiPricingError("ai_credit_pricing_must_resolve_to_whole_credits")
    return int(total)
