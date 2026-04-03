"""Статическая диагностика {{ плейсхолдеров }} без значений пользователя."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Set

from backend.models.constructor_core import CtorBotVariableDefinition
from backend.services.template_render.placeholders import extract_placeholder_keys

# Синхронно с TemplateRenderService._PROFILE_FIELDS (user.*)
USER_PROFILE_PLACEHOLDER_FIELDS: frozenset[str] = frozenset(
    (
        "first_name",
        "last_name",
        "username",
        "phone",
        "email",
        "language_code",
        "avatar_url",
        "status",
        "channel",
        "external_user_id",
    )
)


def _unique_preserve_order(keys: Sequence[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for k in keys:
        if k in seen:
            continue
        seen.add(k)
        out.append(k)
    return out


def _token_is_known(
    token: str,
    *,
    flat_var_keys: Set[str],
    system_subset_keys: Set[str],
) -> bool:
    key = token.strip()
    if not key:
        return True
    if "." in key:
        ns, _, rest = key.partition(".")
        rest = rest.strip()
        if not rest:
            return False
        if ns == "user":
            return rest in USER_PROFILE_PLACEHOLDER_FIELDS
        if ns == "system":
            return rest in system_subset_keys
        return False
    return key in flat_var_keys


@dataclass(frozen=True)
class MessageTemplateDiagnostics:
    placeholder_keys: List[str]
    unknown_keys: List[str]
    defined_variable_keys: List[str]
    system_keys: List[str]


def diagnose_message_template(
    text: str,
    definitions: Sequence[CtorBotVariableDefinition],
) -> MessageTemplateDiagnostics:
    """
    Определяет плейсхолдеры в тексте и те, что не совпадают с определениями ctor /
    разрешёнными user.* / system.*.
    """
    flat_var_keys = {d.key for d in definitions}
    system_keys_list = sorted({d.key for d in definitions if d.is_system})
    system_subset = set(system_keys_list)

    raw = extract_placeholder_keys(text or "")
    placeholder_keys = _unique_preserve_order(raw)

    unknown: List[str] = []
    for t in placeholder_keys:
        if not _token_is_known(t, flat_var_keys=flat_var_keys, system_subset_keys=system_subset):
            unknown.append(t)

    return MessageTemplateDiagnostics(
        placeholder_keys=placeholder_keys,
        unknown_keys=unknown,
        defined_variable_keys=sorted(flat_var_keys),
        system_keys=system_keys_list,
    )


def ctor_definitions_to_api_items(
    rows: Sequence[CtorBotVariableDefinition],
) -> List[dict]:
    return [
        {
            "key": d.key,
            "label": d.label,
            "data_type": d.data_type,
            "is_system": bool(d.is_system),
            "scope": d.scope,
        }
        for d in rows
    ]
