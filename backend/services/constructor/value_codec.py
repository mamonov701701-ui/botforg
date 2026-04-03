"""Сериализация значений переменных в колонки ctor_bot_user_variables."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional, Tuple

from backend.services.constructor.types import (
    ERR_VALIDATION,
    ServiceResult,
    err_result,
    ok_result,
)


def normalize_for_definition(
    data_type: str,
    value: Any,
) -> ServiceResult[
    Tuple[
        Optional[str],
        Optional[Decimal],
        Optional[bool],
        Optional[datetime],
        Optional[Any],
    ]
]:
    """
    Возвращает кортеж (value_text, value_number, value_boolean, value_date, value_json)
    — неиспользуемые компоненты обнуляются на вызывающей стороне.
    """
    dt = (data_type or "string").lower().strip()

    if dt in ("string", "str", "text"):
        if value is None:
            return ok_result((None, None, None, None, None))
        return ok_result((str(value), None, None, None, None))

    if dt in ("number", "numeric", "float", "integer", "int", "decimal"):
        if value is None:
            return ok_result((None, None, None, None, None))
        try:
            if isinstance(value, bool):
                return err_result(
                    ERR_VALIDATION,
                    "логическое значение нельзя записать в числовую переменную",
                )
            dec = Decimal(str(value))
            return ok_result((None, dec, None, None, None))
        except (InvalidOperation, ValueError, TypeError):
            return err_result(ERR_VALIDATION, "некорректное числовое значение")

    if dt in ("boolean", "bool", "да_или_нет"):
        if value is None:
            return ok_result((None, None, None, None, None))
        if isinstance(value, bool):
            return ok_result((None, None, value, None, None))
        if isinstance(value, str):
            s = value.strip().lower()
            if s in ("true", "1", "yes", "да", "on"):
                return ok_result((None, None, True, None, None))
            if s in ("false", "0", "no", "нет", "off"):
                return ok_result((None, None, False, None, None))
        return err_result(ERR_VALIDATION, "ожидалось логическое значение")

    if dt in ("date", "datetime"):
        if value is None:
            return ok_result((None, None, None, None, None))
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return ok_result((None, None, None, value, None))
        if isinstance(value, date) and not isinstance(value, datetime):
            return ok_result(
                (None, None, None, datetime(value.year, value.month, value.day, tzinfo=timezone.utc), None)
            )
        if isinstance(value, str):
            try:
                raw = value.strip().replace("Z", "+00:00")
                parsed = datetime.fromisoformat(raw)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return ok_result((None, None, None, parsed, None))
            except ValueError:
                return err_result(ERR_VALIDATION, "некорректная дата или время")
        return err_result(ERR_VALIDATION, "ожидалась дата или время")

    if dt in ("json", "object", "array", "dict"):
        if value is None:
            return ok_result((None, None, None, None, None))
        if isinstance(value, (dict, list)):
            return ok_result((None, None, None, None, value))
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, (dict, list)):
                    return ok_result((None, None, None, None, parsed))
            except json.JSONDecodeError:
                pass
        return err_result(
            ERR_VALIDATION,
            "ожидался объект или массив в формате с разметкой",
        )

    return err_result(ERR_VALIDATION, f"неизвестный data_type: {data_type}")
