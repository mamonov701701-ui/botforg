"""
Срок действия купленных addon-пакетов (Этап 8.2).

Единый источник для fulfillment и публичного каталога GET /addons.
"""
from __future__ import annotations

from typing import Any

# Календарные дни с момента успешной активации (fulfillment).
DEFAULT_ADDON_VALIDITY_DAYS = 30


def resolve_addon_validity_days(package: Any | None = None) -> int:
    """
    Фактический срок пакета в днях.

    Если у модели появится явное поле — читать его; иначе DEFAULT_ADDON_VALIDITY_DAYS.
    """
    if package is not None:
        raw = getattr(package, "validity_days", None)
        if raw is None and isinstance(getattr(package, "__dict__", None), dict):
            raw = None
        if raw is not None:
            try:
                days = int(raw)
                if days > 0:
                    return days
            except (TypeError, ValueError):
                pass
    return DEFAULT_ADDON_VALIDITY_DAYS
