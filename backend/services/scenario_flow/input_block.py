"""
Блок «Ввод» (input): миграция настроек, валидация текста, запись в VariableService и события.
Симметрично правилам frontend/src/utils/inputBlock.ts.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Tuple

from sqlalchemy.orm import Session

from backend.services.constructor.dto import LogEventInput, VariableDefinitionOptions
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.types import ERR_VALIDATION, ServiceResult, err_result, ok_result
from backend.services.constructor.validation import validate_snake_case_key
from backend.services.constructor.variable_service import VariableService

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", re.IGNORECASE)


def normalize_input_settings(raw: Mapping[str, Any]) -> Dict[str, Any]:
    """Миграция legacy text / variableName → question_text / variable_key."""
    next_d: Dict[str, Any] = dict(raw)

    if not next_d.get("question_text") and isinstance(next_d.get("text"), str):
        next_d["question_text"] = next_d["text"]
    if not next_d.get("variable_key"):
        vn = next_d.get("variableName") or next_d.get("name")
        if isinstance(vn, str) and vn.strip():
            next_d["variable_key"] = vn

    if next_d.get("required") is None:
        next_d["required"] = True
    if next_d.get("trim") is None:
        next_d["trim"] = True

    v = next_d.get("validation")
    if not isinstance(v, dict):
        v = {}
    else:
        v = dict(v)
    t = v.get("type")
    if t not in ("string", "number", "email", "phone", "date"):
        v["type"] = "string"
    next_d["validation"] = v
    return next_d


def _validation_dict(settings: Dict[str, Any]) -> Dict[str, Any]:
    v = settings.get("validation")
    return dict(v) if isinstance(v, dict) else {}


def validate_input_answer(
    settings: Mapping[str, Any],
    raw_answer: str,
) -> Tuple[bool, Optional[str], Any]:
    """
    Возвращает (False, message, None) или (True, None, stored_value).
    raw_answer — строка из канала; trim по настройкам.
    """
    s = normalize_input_settings(settings)
    trim_flag = s.get("trim") is not False
    text = (raw_answer or "").strip() if trim_flag else (raw_answer or "")
    required = s.get("required") is not False
    err_custom = (s.get("error_message") or "").strip()

    if not text and not required:
        return True, None, ""

    if not text and required:
        return False, err_custom or "Это обязательное поле", None

    v = _validation_dict(s)
    vt = v.get("type") or "string"
    min_l = v.get("min_length")
    max_l = v.get("max_length")
    rx = v.get("regex")

    if isinstance(min_l, int) and len(text) < min_l:
        return False, err_custom or f"Минимальная длина: {min_l}", None
    if isinstance(max_l, int) and len(text) > max_l:
        return False, err_custom or f"Максимальная длина: {max_l}", None

    if isinstance(rx, str) and rx.strip():
        try:
            if not re.search(rx, text):
                return (
                    False,
                    err_custom or "Значение не подходит под заданный шаблон",
                    None,
                )
        except re.error:
            return False, err_custom or "Ошибка правил валидации сценария", None

    if vt == "number":
        try:
            normalized = text.replace(",", ".")
            n = float(normalized)
            if n != n:  # NaN
                raise ValueError
            return True, None, n
        except ValueError:
            return False, err_custom or "Ожидается число", None

    if vt == "email":
        if not EMAIL_RE.match(text):
            return False, err_custom or "Некорректный email", None
        return True, None, text

    if vt == "phone":
        digits = re.sub(r"\D", "", text)
        if len(digits) < 10:
            return False, err_custom or "Укажите телефон (не менее 10 цифр)", None
        return True, None, text

    if vt == "date":
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", text)
        if not m:
            return False, err_custom or "Укажите дату в формате ГГГГ-ММ-ДД", None
        y, mo, da = int(m[1]), int(m[2]), int(m[3])
        try:
            datetime(y, mo, da, tzinfo=timezone.utc)
        except ValueError:
            return False, err_custom or "Некорректная дата", None
        return True, None, text

    return True, None, text


def log_validation_failed(
    db: Session,
    *,
    bot_id: int,
    bot_user_id: int,
    variable_key: str,
    reason: str,
    scenario_id: Optional[int] = None,
    session_id: Optional[int] = None,
    commit: bool = False,
) -> None:
    EventLogService(db).log_event(
        LogEventInput(
            bot_id=bot_id,
            bot_user_id=bot_user_id,
            event_type="validation_failed",
            payload_json={"variable_key": variable_key, "reason": reason},
            scenario_id=scenario_id,
            session_id=session_id,
        ),
        commit=commit,
    )


def _map_validation_type_to_data_type(vt: str) -> str:
    if vt == "number":
        return "number"
    if vt == "date":
        return "date"
    return "string"


def pick_success_target_id(
    edges: List[Dict[str, Any]],
    source_node_id: str,
) -> Optional[str]:
    out = [e for e in edges if e.get("source") == source_node_id]
    if not out:
        return None
    for e in out:
        if (e.get("sourceHandle") or "") == "success":
            return e.get("target")
    non_err = [e for e in out if (e.get("sourceHandle") or "") != "error"]
    if non_err:
        return non_err[0].get("target")
    return None


def pick_error_target_id(
    edges: List[Dict[str, Any]],
    source_node_id: str,
) -> Optional[str]:
    for e in edges:
        if e.get("source") != source_node_id:
            continue
        if (e.get("sourceHandle") or "") == "error":
            return e.get("target")
    return None


def apply_input_success_to_ctor_user(
    db: Session,
    *,
    bot_id: int,
    bot_user_id: int,
    settings: Mapping[str, Any],
    raw_answer: str,
    scenario_id: Optional[int] = None,
    session_id: Optional[int] = None,
    commit: bool = True,
) -> ServiceResult[Any]:
    """
    После успешной валидации: ensure definition, set_user_variable для variable_key и last_input.
    """
    s = normalize_input_settings(settings)
    key_err = validate_snake_case_key(str(s.get("variable_key") or ""))
    if key_err:
        return err_result(ERR_VALIDATION, key_err)

    res = validate_input_answer(s, raw_answer)
    if res[0] is False:
        return err_result(ERR_VALIDATION, res[1] or "validation error")

    _ok, _msg, stored = res
    var_key = str(s.get("variable_key", "")).strip()
    vobj = _validation_dict(s)
    vt = str(vobj.get("type") or "string")
    data_type = _map_validation_type_to_data_type(vt)

    vs = VariableService(db)
    label = s.get("variable_label")
    if isinstance(label, str) and label.strip():
        edef = vs.ensure_variable_definition(
            bot_id,
            var_key,
            VariableDefinitionOptions(label=label.strip(), data_type=data_type, scope="session"),
            commit=False,
        )
        if not edef.ok:
            return edef  # type: ignore[return-value]

    r1 = vs.set_user_variable(bot_user_id, var_key, stored, commit=False)
    if not r1.ok:
        return r1

    last_txt = raw_answer.strip() if s.get("trim") is not False else (raw_answer or "")
    if isinstance(stored, str):
        last_txt = stored
    elif stored is not None and stored != "":
        last_txt = str(stored)

    r2 = vs.set_user_variable(bot_user_id, "last_input", last_txt, commit=False)
    if not r2.ok:
        return r2

    if commit:
        db.commit()
    return ok_result({"variable_key": var_key, "stored": stored})
