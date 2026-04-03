"""Типизированные результаты сервисов конструктора (ctor_*)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, Optional, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class ServiceResult(Generic[T]):
    """Унифицированный ответ сервиса (аналогично MessageResult в channels)."""

    ok: bool
    data: Optional[T] = None
    error: Optional[str] = None
    code: Optional[str] = None


def ok_result(data: T) -> ServiceResult[T]:
    return ServiceResult(True, data=data)


def err_result(code: str, message: str) -> ServiceResult[Any]:
    return ServiceResult(False, error=message, code=code)


# Коды ошибок (строковые константы для роутеров и логов)
ERR_VALIDATION = "validation_error"
ERR_NOT_FOUND = "not_found"
ERR_CONFLICT = "conflict"
ERR_DEFINITION = "definition_error"
ERR_SESSION = "session_error"
ERR_TAG = "tag_error"
