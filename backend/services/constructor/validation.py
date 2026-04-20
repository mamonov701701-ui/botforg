"""Валидация ключей переменных и тегов (snake_case)."""

from __future__ import annotations

import re
from typing import Optional

from backend.seeds.constructor_system_variables import SYSTEM_VARIABLE_DEFINITIONS

_SNAKE = re.compile(r"^[a-z][a-z0-9_]*$")

SYSTEM_VARIABLE_KEYS = frozenset(row[0] for row in SYSTEM_VARIABLE_DEFINITIONS)


def validate_tag_key(key: str, *, max_len: int = 128) -> Optional[str]:
    """
    Ключ тега в CRM: первая — буква (в т.ч. кириллица), далее буквы, цифры, _.
    Отличается от snake_case переменных (только латиница).
    """
    if not key or not isinstance(key, str):
        return "ключ не задан"
    k = key.strip()
    if len(k) > max_len:
        return f"ключ длиннее {max_len} символов"
    if not k:
        return "ключ не задан"
    if not k[0].isalpha():
        return "тег должен начинаться с буквы"
    for ch in k[1:]:
        if ch.isalnum() or ch == "_":
            continue
        return "тег может содержать только буквы, цифры и _"
    return None


def validate_snake_case_key(key: str, *, max_len: int = 128) -> Optional[str]:
    """
    Проверяет ключ в формате snake_case.
    Возвращает None при успехе, иначе текст ошибки.
    """
    if not key or not isinstance(key, str):
        return "ключ не задан"
    k = key.strip()
    if len(k) > max_len:
        return f"ключ длиннее {max_len} символов"
    if not _SNAKE.match(k):
        return "ключ должен быть в snake_case: строчные латинские буквы, цифры и _, с первой буквы"
    if k.endswith("_"):
        return "ключ не может заканчиваться на _"
    return None


def is_system_variable_key(key: str) -> bool:
    return key in SYSTEM_VARIABLE_KEYS
