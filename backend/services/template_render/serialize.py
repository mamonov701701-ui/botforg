"""Строковое представление значений для подстановки в шаблоны."""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Mapping


def stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, Decimal):
        return format(value, "f").rstrip("0").rstrip(".") if "." in format(value, "f") else str(value)
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value != value:  # NaN
            return ""
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(value)
    return str(value)


def stringify_map(m: Mapping[str, Any]) -> Dict[str, str]:
    return {str(k): stringify(m[k]) for k in m}
