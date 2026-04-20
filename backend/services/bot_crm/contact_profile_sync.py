"""Синхронизация основных полей ctor_bot_users из переменных (Preview и сценарии)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.models.constructor_core import CtorBotUser

# Ключи переменных (snake_case / латиница) → поле профиля; порядок = приоритет
_NAME_KEYS = (
    "imya",
    "name",
    "user_name",
    "username",
    "first_name",
    "fio",
    "full_name",
)
_PHONE_KEYS = ("telefon", "phone", "tel", "mobile", "mobil", "nomer")
_EMAIL_KEYS = ("el_pochta", "email", "pochta", "mail", "e_mail")


def _norm_key_map(variables: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in variables.items():
        if not isinstance(k, str) or not k.strip():
            continue
        out[k.strip().lower()] = v
    return out


def _first_non_empty_str(m: Dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    for key in keys:
        lk = key.lower()
        if lk not in m:
            continue
        v = m[lk]
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


def apply_contact_profile_from_variables(
    user: CtorBotUser,
    variables: Dict[str, Any],
    *,
    explicit_first_name: Optional[str] = None,
) -> bool:
    """
    Обновляет first_name / phone / email на контакте по карте переменных.
    explicit_first_name — если задан (не None), подставляется в приоритете над ключами имён.
    Возвращает True, если были изменения по полям профиля.
    """
    m = _norm_key_map(variables)
    changed = False

    name = explicit_first_name.strip() if isinstance(explicit_first_name, str) else None
    if name == "":
        name = None
    if name is None:
        name = _first_non_empty_str(m, _NAME_KEYS)

    if name is not None and (user.first_name or "") != name:
        user.first_name = name
        changed = True

    phone = _first_non_empty_str(m, _PHONE_KEYS)
    if phone is not None and (user.phone or "") != phone:
        user.phone = phone
        changed = True

    email = _first_non_empty_str(m, _EMAIL_KEYS)
    if email is not None and (user.email or "") != email:
        user.email = email
        changed = True

    return changed
