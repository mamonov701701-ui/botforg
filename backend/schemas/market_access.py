"""
Pydantic schemas for marketplace manual access (requests and grants).
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

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


class MarketAccessGrantCreate(BaseModel):
    """Выдача доступа по заявке (опциональная заметка автора)."""
    note: Optional[str] = Field(None, description="Заметка автора")


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


class MarketAccessGrantedOut(BaseModel):
    """Ответ на выдачу доступа по заявке."""
    request: MarketAccessRequestOut
    grant: MarketItemAccessGrantOut
    already_exists: bool = False


class MarketAccessUserBriefOut(BaseModel):
    """Краткая информация о пользователе в заявке на доступ."""
    id: int
    name: Optional[str] = None
    email: str
    avatar: Optional[str] = None


class MarketAccessRequestListItemMarketOut(BaseModel):
    """Товар маркетплейса в списке заявок."""
    id: int
    title: str
    item_type: str
    price: Decimal


class MarketAccessRequestListItemOut(BaseModel):
    """Заявка на доступ с данными для UI."""
    request: MarketAccessRequestOut
    market_item: MarketAccessRequestListItemMarketOut
    requester: MarketAccessUserBriefOut
    author: MarketAccessUserBriefOut
    chat_room_id: Optional[int] = None


class MarketAccessRequestListResponse(BaseModel):
    """Список заявок на доступ."""
    items: List[MarketAccessRequestListItemOut]
    total: int
    limit: int
    offset: int


class MarketItemAccessStatusOut(BaseModel):
    """Статус доступа текущего пользователя к market item."""
    item_id: int
    is_paid: bool
    has_grant: bool
    can_install: bool
    status: str
    request: Optional[MarketAccessRequestOut] = None
    chat_room_id: Optional[int] = None
