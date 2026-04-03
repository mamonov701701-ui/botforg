"""Объекты передачи данных для сервисов конструктора."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional


@dataclass
class VariableDefinitionOptions:
    label: Optional[str] = None
    data_type: str = "string"
    scope: str = "session"
    description: Optional[str] = None
    """Явное создание системной записи (только для админских сидов)."""
    is_system: bool = False


@dataclass
class TagDefinitionOptions:
    label: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


@dataclass
class UserVariableView:
    key: str
    definition_id: int
    data_type: str
    scope: str
    is_system: bool
    value_text: Optional[str] = None
    value_number: Optional[Decimal] = None
    value_boolean: Optional[bool] = None
    value_date: Optional[datetime] = None
    value_json: Optional[Any] = None


@dataclass
class TagView:
    id: int
    key: str
    label: Optional[str]
    color: Optional[str]


@dataclass
class LogEventInput:
    bot_id: int
    bot_user_id: int
    event_type: str
    payload_json: Optional[Dict[str, Any]] = None
    session_id: Optional[int] = None
    scenario_id: Optional[int] = None
    block_id: Optional[int] = None


@dataclass
class EventFilters:
    event_type: Optional[str] = None
    scenario_id: Optional[int] = None
    session_id: Optional[int] = None
    since: Optional[datetime] = None
    until: Optional[datetime] = None
    limit: int = 100
    offset: int = 0
