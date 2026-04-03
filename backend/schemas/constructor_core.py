"""Pydantic-схемы для будущего API реляционного конструктора (ctor_* / platform_users)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class PlatformUserBase(BaseModel):
    email: str = Field(..., max_length=255)
    name: Optional[str] = Field(None, max_length=255)


class PlatformUserCreate(PlatformUserBase):
    password_hash: Optional[str] = Field(None, max_length=255)


class PlatformUserRead(PlatformUserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class CtorBotBase(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=128)
    description: Optional[str] = None
    status: str = Field(default="draft", max_length=32)


class CtorBotCreate(CtorBotBase):
    owner_id: int


class CtorBotRead(CtorBotBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime


class CtorBotUserBase(BaseModel):
    channel: str = Field(..., max_length=32)
    external_user_id: str = Field(..., max_length=191)
    username: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=64)
    email: Optional[str] = Field(None, max_length=255)
    language_code: Optional[str] = Field(None, max_length=32)
    avatar_url: Optional[str] = Field(None, max_length=512)
    status: str = Field(default="active", max_length=32)


class CtorBotUserRead(CtorBotUserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    last_message_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CtorScenarioBase(BaseModel):
    name: str = Field(..., max_length=255)
    is_active: bool = True
    entry_block_id: Optional[int] = None


class CtorScenarioCreate(CtorScenarioBase):
    bot_id: int


class CtorScenarioRead(CtorScenarioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    created_at: datetime
    updated_at: datetime


class CtorBlockBase(BaseModel):
    type: str = Field(..., max_length=64)
    name: Optional[str] = Field(None, max_length=255)
    settings_json: Optional[dict[str, Any]] = None
    position_x: int = 0
    position_y: int = 0


class CtorBlockCreate(CtorBlockBase):
    scenario_id: int


class CtorBlockRead(CtorBlockBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    created_at: datetime
    updated_at: datetime


class CtorBlockEdgeCreate(BaseModel):
    scenario_id: int
    source_block_id: int
    target_block_id: int
    handle_key: Optional[str] = Field(None, max_length=128)
    sort_order: int = 0


class CtorBlockEdgeRead(CtorBlockEdgeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class CtorBotVariableDefinitionBase(BaseModel):
    key: str = Field(..., max_length=128)
    label: Optional[str] = Field(None, max_length=255)
    data_type: str = Field(default="string", max_length=32)
    scope: str = Field(default="session", max_length=32)
    description: Optional[str] = None
    is_system: bool = False


class CtorBotVariableDefinitionCreate(CtorBotVariableDefinitionBase):
    bot_id: int


class CtorBotVariableDefinitionRead(CtorBotVariableDefinitionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    created_at: datetime
    updated_at: datetime


class CtorBotUserVariableUpsert(BaseModel):
    """Создание/обновление значения (один из value_* заполняется согласно data_type определения)."""

    bot_user_id: int
    variable_definition_id: int
    value_text: Optional[str] = None
    value_number: Optional[Decimal] = None
    value_boolean: Optional[bool] = None
    value_date: Optional[datetime] = None
    value_json: Optional[dict[str, Any]] = None


class CtorBotUserVariableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_user_id: int
    variable_definition_id: int
    value_text: Optional[str] = None
    value_number: Optional[Decimal] = None
    value_boolean: Optional[bool] = None
    value_date: Optional[datetime] = None
    value_json: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class CtorBotTagBase(BaseModel):
    key: str = Field(..., max_length=128)
    label: Optional[str] = Field(None, max_length=255)
    color: Optional[str] = Field(None, max_length=32)
    description: Optional[str] = None


class CtorBotTagCreate(CtorBotTagBase):
    bot_id: int


class CtorBotTagRead(CtorBotTagBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    created_at: datetime
    updated_at: datetime


class CtorBotUserSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_user_id: int
    scenario_id: int
    current_block_id: Optional[int] = None
    status: str
    last_input_at: Optional[datetime] = None
    context_json: Optional[dict[str, Any]] = None
    started_at: datetime
    updated_at: datetime


class CtorBotUserEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    bot_user_id: int
    session_id: Optional[int] = None
    scenario_id: Optional[int] = None
    block_id: Optional[int] = None
    event_type: str
    payload_json: Optional[dict[str, Any]] = None
    created_at: datetime
