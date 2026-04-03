"""Безопасная подстановка: только regex replace, без eval/jinja."""

from __future__ import annotations

import re
from typing import List, Set, Tuple

from backend.services.template_render.placeholders import PLACEHOLDER_PATTERN
from backend.services.template_render.types import TemplateContext, TemplateRenderResult


def _resolve_token(token: str, ctx: TemplateContext) -> Tuple[str, bool]:
    """
    Возвращает (строка для подстановки, найдено ли значение).
    Не найдено: пустая строка и False.
    """
    key = token.strip()
    if not key:
        return "", False

    if "." in key:
        ns, _, rest = key.partition(".")
        rest = rest.strip()
        if not rest:
            return "", False
        if ns == "user":
            if rest in ctx.user_profile:
                return ctx.user_profile[rest], True
            return "", False
        if ns == "system":
            if rest in ctx.system:
                return ctx.system[rest], True
            if rest == "last_input" and "last_input" in ctx.variables:
                return ctx.variables["last_input"], True
            return "", False
        return "", False

    if key in ctx.variables:
        return ctx.variables[key], True
    return "", False


def render_template(template: str, ctx: TemplateContext) -> TemplateRenderResult:
    """
    Подставляет все допустимые {{ token }}; неизвестные токены заменяет на пустую строку.
    """
    if template is None:
        return TemplateRenderResult("", [], [])

    used_ordered: List[str] = []
    missing_ordered: List[str] = []
    seen_used: Set[str] = set()
    seen_missing: Set[str] = set()

    def repl(m: re.Match[str]) -> str:
        token = m.group(1)
        val, ok = _resolve_token(token, ctx)
        if ok:
            if token not in seen_used:
                seen_used.add(token)
                used_ordered.append(token)
            return val
        if token not in seen_missing:
            seen_missing.add(token)
            missing_ordered.append(token)
        return ""

    rendered = PLACEHOLDER_PATTERN.sub(repl, str(template))
    return TemplateRenderResult(
        rendered_text=rendered,
        used_keys=list(used_ordered),
        missing_keys=list(missing_ordered),
    )
