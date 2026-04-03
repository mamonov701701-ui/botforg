"""Извлечение плейсхолдеров {{ ... }} без исполнения кода."""

from __future__ import annotations

import re
from typing import List

# Только идентификаторы и точки — без пробелов внутри, без | (резерв под фильтры).
PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}")


def extract_placeholder_keys(template: str) -> List[str]:
    """Возвращает список внутренних ключей в порядке появления (могут повторяться)."""
    if not template:
        return []
    return PLACEHOLDER_PATTERN.findall(template)
