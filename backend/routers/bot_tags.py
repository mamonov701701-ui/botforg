"""
API для управления тегами пользователей ботов
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User as UserModel
from backend.models.bot import BotInstance
from backend.models.bot_tag import BotTag, bot_contact_tags
from backend.models.bot_user_state import BotUserState
from backend.utils.bot_access import check_bot_access

router = APIRouter(prefix="/bot-tags", tags=["bot-tags"])


# Schemas
class BotTagCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class BotTagOut(BaseModel):
    id: int
    bot_id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat() if v else ""


class TagContactRequest(BaseModel):
    contact_id: int  # bot_user_state.id
    tag_id: int


# Важно: /assign и /unassign должны быть ДО /{bot_id}, иначе "assign" матчится как bot_id
@router.post("/assign", status_code=status.HTTP_204_NO_CONTENT)
async def assign_tag_to_contact(
    request: TagContactRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Присвоить тег контакту"""
    contact = db.query(BotUserState).filter(BotUserState.id == request.contact_id).first()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Контакт не найден"
        )
    tag = db.query(BotTag).filter(BotTag.id == request.tag_id).first()
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Тег не найден"
        )
    if tag.bot_id != contact.bot_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Тег и контакт принадлежат разным ботам"
        )
    bot = check_bot_access(contact.bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому боту"
        )
    from sqlalchemy import select
    stmt = select(bot_contact_tags).where(
        bot_contact_tags.c.bot_contact_id == request.contact_id,
        bot_contact_tags.c.tag_id == request.tag_id
    )
    existing = db.execute(stmt).first()
    if existing:
        return None
    stmt = bot_contact_tags.insert().values(
        bot_contact_id=request.contact_id,
        tag_id=request.tag_id
    )
    db.execute(stmt)
    db.commit()
    return None


@router.delete("/unassign", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_tag_from_contact(
    request: TagContactRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Удалить тег у контакта"""
    contact = db.query(BotUserState).filter(BotUserState.id == request.contact_id).first()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Контакт не найден"
        )
    bot = check_bot_access(contact.bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому боту"
        )
    stmt = bot_contact_tags.delete().where(
        bot_contact_tags.c.bot_contact_id == request.contact_id,
        bot_contact_tags.c.tag_id == request.tag_id
    )
    db.execute(stmt)
    db.commit()
    return None


@router.post("/{bot_id}", response_model=BotTagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    bot_id: int,
    tag_data: BotTagCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Создать новый тег для бота"""
    # Проверяем доступ к боту
    bot = check_bot_access(bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Бот не найден"
        )
    
    # Проверяем, что бот является BotInstance
    bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()
    if not bot_instance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Экземпляр бота не найден"
        )
    
    # Проверяем, что тег с таким именем еще не существует для этого бота
    existing_tag = db.query(BotTag).filter(
        BotTag.bot_id == bot_id,
        BotTag.name == tag_data.name
    ).first()
    if existing_tag:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Тег с именем '{tag_data.name}' уже существует для этого бота"
        )
    
    tag = BotTag(
        bot_id=bot_id,
        name=tag_data.name,
        description=tag_data.description,
        color=tag_data.color
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    
    return tag


@router.get("/{bot_id}", response_model=List[BotTagOut])
async def get_tags(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получить все теги бота"""
    # Проверяем доступ к боту
    bot = check_bot_access(bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Бот не найден"
        )
    
    tags = db.query(BotTag).filter(BotTag.bot_id == bot_id).all()
    return tags


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Удалить тег"""
    tag = db.query(BotTag).filter(BotTag.id == tag_id).first()
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Тег не найден"
        )
    
    # Проверяем доступ к боту
    bot = check_bot_access(tag.bot_id, current_user.id, db)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому боту"
        )
    
    db.delete(tag)
    db.commit()
    return None

