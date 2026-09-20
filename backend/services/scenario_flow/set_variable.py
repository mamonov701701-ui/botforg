"""Canonical Set Variable settings and execution semantics."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

from backend.services.constructor.validation import validate_snake_case_key


class SetVariableSettingsError(ValueError):
    pass


@dataclass(frozen=True)
class SetVariableSettings:
    key: str
    value: Any
    value_type: str = "string"
    interpolation: bool = False
    overwrite: bool = True


def settings_from_node(block_code: str, raw: Any) -> SetVariableSettings | None:
    """Read canonical and safe legacy variable shapes without rewriting them."""
    if not isinstance(raw, dict):
        return None
    code = str(block_code or "").lower()
    if code == "set_variable":
        data = raw
    elif code == "variable":
        data = {"key": raw.get("key", raw.get("name")), "value": raw.get("value"), "value_type": raw.get("value_type", raw.get("type", "string")), "interpolation": raw.get("interpolation", False), "overwrite": raw.get("overwrite", True)}
    elif code == "action" and raw.get("setVariable") and not any(raw.get(key) for key in ("mode", "actionType", "tag", "status", "message", "text")):
        data = {"key": raw.get("setVariable"), "value": raw.get("value"), "value_type": raw.get("value_type", "string"), "interpolation": raw.get("interpolation", False), "overwrite": raw.get("overwrite", True)}
    else:
        return None
    key = str(data.get("key") or "").strip()
    value_type = str(data.get("value_type") or "string").strip().lower()
    if value_type not in {"string", "number", "boolean", "json"}:
        raise SetVariableSettingsError("unsupported_value_type")
    if validate_snake_case_key(key):
        raise SetVariableSettingsError("invalid_key")
    return SetVariableSettings(
        key=key,
        value=data.get("value", ""),
        value_type=value_type,
        interpolation=data.get("interpolation") is True,
        overwrite=data.get("overwrite") is not False,
    )


def convert_value(settings: SetVariableSettings, interpolate: Callable[[str], str] | None = None) -> Any:
    raw = settings.value
    if settings.interpolation and isinstance(raw, str) and interpolate:
        raw = interpolate(raw)
    if settings.value_type == "string":
        return raw if isinstance(raw, str) else str(raw)
    if settings.value_type == "number":
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise SetVariableSettingsError("invalid_number") from None
        if not value == value or value in (float("inf"), float("-inf")):
            raise SetVariableSettingsError("invalid_number")
        return int(value) if value.is_integer() else value
    if settings.value_type == "boolean":
        if raw is True or raw is False:
            return raw
        if isinstance(raw, str) and raw.strip().lower() in {"true", "false"}:
            return raw.strip().lower() == "true"
        raise SetVariableSettingsError("invalid_boolean")
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        raise SetVariableSettingsError("invalid_json") from None


def validate_set_variable_settings(raw: Any) -> list[str]:
    try:
        settings = settings_from_node("set_variable", raw)
        if settings is None:
            return ["malformed_settings"]
        convert_value(settings)
    except SetVariableSettingsError as exc:
        return [str(exc)]
    return []
