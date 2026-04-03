"""Типы контекста и результата рендера шаблонов."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(frozen=True)
class TemplateContext:
    """
    Контекст подстановки (без исполняемого кода).
    - variables: плоские ключи переменных ctor (в т.ч. user_name, phone из определений).
    - user_profile: поля профиля ctor_bot_users для путей вида user.first_name.
    - system: системные переменные и слой session context_json (ключи после префикса system.).
    """

    variables: Dict[str, str] = field(default_factory=dict)
    user_profile: Dict[str, str] = field(default_factory=dict)
    system: Dict[str, str] = field(default_factory=dict)

    def merged_flat_preview(self) -> Dict[str, str]:
        """Для отладки: плоский вид без приоритетов (не для резолва плейсхолдеров)."""
        out = dict(self.variables)
        for k, v in self.user_profile.items():
            out[f"user.{k}"] = v
        for k, v in self.system.items():
            out[f"system.{k}"] = v
        return out


@dataclass(frozen=True)
class TemplateRenderResult:
    rendered_text: str
    used_keys: List[str]
    missing_keys: List[str]
