"""
Сервисы реляционного конструктора (таблицы ctor_*).

Имена методов в коде — snake_case. Соответствие запросу:
  getUserVariables → get_user_variables
  getUserVariableByKey → get_user_variable_by_key
  setUserVariable → set_user_variable
  setManyUserVariables → set_many_user_variables
  ensureVariableDefinition → ensure_variable_definition
  validateVariableKey → validate_variable_key
  (аналогично для Tag / Session / EventLog)
"""

from backend.services.constructor.dto import (
    EventFilters,
    LogEventInput,
    TagDefinitionOptions,
    TagView,
    UserVariableView,
    VariableDefinitionOptions,
)
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.session_service import SessionService
from backend.services.constructor.tag_service import TagService
from backend.services.constructor.types import (
    ERR_CONFLICT,
    ERR_DEFINITION,
    ERR_NOT_FOUND,
    ERR_SESSION,
    ERR_TAG,
    ERR_VALIDATION,
    ServiceResult,
    err_result,
    ok_result,
)
from backend.services.constructor.variable_service import VariableService

__all__ = [
    "VariableService",
    "TagService",
    "SessionService",
    "EventLogService",
    "ServiceResult",
    "ok_result",
    "err_result",
    "ERR_VALIDATION",
    "ERR_NOT_FOUND",
    "ERR_DEFINITION",
    "ERR_SESSION",
    "ERR_TAG",
    "ERR_CONFLICT",
    "VariableDefinitionOptions",
    "TagDefinitionOptions",
    "UserVariableView",
    "TagView",
    "LogEventInput",
    "EventFilters",
]
