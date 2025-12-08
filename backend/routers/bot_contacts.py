"""
API для работы с пользователями ботов (контактами)
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User as UserModel
from backend.models.bot import BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag
from backend.utils.bot_access import check_bot_access

router = APIRouter(prefix="/bots/{bot_id}/contacts", tags=["bot-contacts"])


# Schemas
class BotContactOut(BaseModel):
    id: int
    public_id: int
    telegram_user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    channel: str
    status: str
    entry_point: Optional[str] = None
    utm_source: Optional[str] = None
    utm_campaign: Optional[str] = None
    last_interaction_at: Optional[datetime] = None
    created_at: datetime
    tags: List[dict] = []

    class Config:
        from_attributes = True


class BotContactListOut(BaseModel):
    total: int
    items: List[BotContactOut]


@router.get("", response_model=BotContactListOut)
async def get_bot_contacts(
    bot_id: int,
    status_filter: Optional[str] = Query(None, description="Фильтр по статусу: active, inactive, unsubscribed, banned"),
    search: Optional[str] = Query(None, description="Поиск по имени, email, phone"),
    tag_id: Optional[int] = Query(None, description="Фильтр по тегу"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Получить список контактов бота
    """
    # Проверяем доступ к боту
    bot = check_bot_access(bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Бот не найден"
        )
    
    # Получаем BotInstance - ищем по token или username
    bot_instance = db.query(BotInstance).filter(
        (BotInstance.token == bot.token) | 
        (BotInstance.username == bot.username)
    ).first()
    
    if not bot_instance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Экземпляр бота не найден"
        )
    
    # Используем bot_instance.id для запросов к BotUserState
    actual_bot_id = bot_instance.id
    
    # Базовый запрос
    query = db.query(BotUserState).filter(BotUserState.bot_id == actual_bot_id)
    
    # Фильтр по статусу
    if status_filter:
        query = query.filter(BotUserState.status == status_filter)
    
    # Поиск по имени, email, phone
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                BotUserState.name.ilike(search_pattern),
                BotUserState.email.ilike(search_pattern),
                BotUserState.phone.ilike(search_pattern),
                BotUserState.telegram_user_id.ilike(search_pattern)
            )
        )
    
    # Фильтр по тегу
    if tag_id:
        query = query.join(BotUserState.tags).filter(BotTag.id == tag_id)
    
    # Подсчет общего количества
    total = query.count()
    
    # Пагинация
    offset = (page - 1) * page_size
    contacts = query.offset(offset).limit(page_size).all()
    
    # Формируем ответ с тегами
    contact_items = []
    for contact in contacts:
        # Загружаем теги для контакта
        db.refresh(contact)
        tags = [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in contact.tags]
        
        contact_items.append(BotContactOut(
            id=contact.id,
            public_id=contact.public_id,
            telegram_user_id=contact.telegram_user_id,
            name=contact.name,
            email=contact.email,
            phone=contact.phone,
            channel=contact.channel,
            status=contact.status,
            entry_point=contact.entry_point,
            utm_source=contact.utm_source,
            utm_campaign=contact.utm_campaign,
            last_interaction_at=contact.last_interaction_at,
            created_at=contact.created_at,
            tags=tags
        ))
    
    return {"total": total, "items": contact_items}


@router.get("/{contact_id}", response_model=BotContactOut)
async def get_bot_contact(
    bot_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Получить детальную информацию о контакте
    """
    # Проверяем доступ к боту
    bot = check_bot_access(bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Бот не найден"
        )
    
    # Получаем BotInstance
    bot_instance = db.query(BotInstance).filter(
        (BotInstance.token == bot.token) | 
        (BotInstance.username == bot.username)
    ).first()
    
    if not bot_instance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Экземпляр бота не найден"
        )
    
    # Получаем контакт
    contact = db.query(BotUserState).filter(
        BotUserState.id == contact_id,
        BotUserState.bot_id == bot_instance.id
    ).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Контакт не найден"
        )
    
    # Загружаем теги
    db.refresh(contact)
    tags = [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in contact.tags]
    
    return BotContactOut(
        id=contact.id,
        public_id=contact.public_id,
        telegram_user_id=contact.telegram_user_id,
        name=contact.name,
        email=contact.email,
        phone=contact.phone,
        channel=contact.channel,
        status=contact.status,
        entry_point=contact.entry_point,
        utm_source=contact.utm_source,
        utm_campaign=contact.utm_campaign,
        last_interaction_at=contact.last_interaction_at,
        created_at=contact.created_at,
        tags=tags
    )

