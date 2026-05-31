"""
Pydantic schemas for marketplace manual access (requests and grants).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MarketAccessRequestCreate(BaseModel):
    """Создание заявки на доступ к платному товару."""
    message: Optional[str] = Field(None, description="Сообщение автору")


class MarketAccessRequestOut(BaseModel):
    """Заявка на доступ к платному market item."""
    id: int
    market_item_id: int
    requester_user_id: int
    author_user_id: int
    chat_room_id: Optional[int] = None
    status: str
    message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarketAccessRequestCreatedOut(BaseModel):
    """Ответ на создание заявки на доступ."""
    request: MarketAccessRequestOut
    chat_room_id: int
    already_exists: bool = False


class MarketItemAccessGrantOut(BaseModel):
    """Ручная выдача доступа к market item."""
    id: int
    market_item_id: int
    user_id: int
    granted_by_user_id: int
    request_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
