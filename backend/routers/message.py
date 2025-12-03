import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.billing import BillingRecord, UserQuota
from backend.models.bot import Bot
from backend.models.message import Message
from backend.models.user import User as UserModel
from backend.utils.bot_access import (
    check_bot_access,
    check_bot_edit_permission,
    get_accessible_bot_owner_ids,
)
from backend.schemas.message import (
    MessageCreate,
    MessageListOut,
    MessageOut,
    MessageUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(
    message: MessageCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Создание нового сообщения"""

    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(message.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow creating messages"
        )

    # Получаем или создаем квоту пользователя
    user_quota = (
        db.query(UserQuota).filter(UserQuota.user_id == current_user.id).first()
    )

    if not user_quota:
        user_quota = UserQuota(
            user_id=current_user.id, monthly_limit=1000, used_messages=0
        )
        db.add(user_quota)
        db.commit()
        db.refresh(user_quota)

    # Определяем, является ли сообщение платным
    is_paid_message = message.is_paid if message.is_paid is not None else False
    message_price = Decimal("0.00")

    # Если квота превышена, сообщение автоматически становится платным
    if user_quota.used_messages >= user_quota.monthly_limit:
        is_paid_message = True
        message_price = Decimal("1.00")

    # Создаем сообщение
    db_message = Message(
        bot_id=message.bot_id,
        user_id=message.user_id
        or current_user.id,  # Если user_id не указан, используем текущего пользователя
        direction=message.direction,
        content=message.content,
        status=message.status,
        language=message.language,
        is_paid=is_paid_message,
    )

    db.add(db_message)
    db.commit()
    db.refresh(db_message)

    # Создаем запись биллинга
    billing_record = BillingRecord(
        user_id=current_user.id,
        message_id=db_message.id,
        action="message",
        direction=message.direction,
        is_paid=is_paid_message,
        price=message_price,
    )

    db.add(billing_record)

    # Увеличиваем счетчик использованных сообщений
    user_quota.used_messages += 1
    user_quota.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_message)

    logger.info(
        f"Message created: {message.direction} message for bot {message.bot_id} by user {current_user.email}"
    )
    return db_message


@router.get("/", response_model=MessageListOut)
async def get_messages(
    bot_id: Optional[int] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение списка сообщений пользователя"""

    # Базовый запрос - сообщения для ботов пользователя и команд
    owner_ids = get_accessible_bot_owner_ids(current_user.id, db)
    query = db.query(Message).join(Bot).filter(Bot.owner_id.in_(owner_ids))

    # Применяем фильтры
    if bot_id:
        query = query.filter(Message.bot_id == bot_id)
    if direction:
        query = query.filter(Message.direction == direction)
    if status:
        query = query.filter(Message.status == status)

    messages = query.order_by(Message.created_at.desc()).all()

    return {"total": len(messages), "items": messages}


@router.get("/{message_id}", response_model=MessageOut)
async def get_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение конкретного сообщения"""

    # Получаем сообщение и проверяем доступ через бота
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )

    # Проверяем доступ к боту
    check_bot_access(message.bot_id, current_user.id, db)
    
    return message


@router.patch("/{message_id}", response_model=MessageOut)
async def update_message(
    message_id: int,
    message_update: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление сообщения"""

    # Получаем сообщение и проверяем доступ через бота
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )
    
    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(message.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow editing messages"
        )

    # Обновляем только указанные поля
    update_data = message_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(message, field, value)

    message.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)

    logger.info(f"Message updated: {message_id} by user {current_user.email}")
    return message


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Удаление сообщения (soft delete)"""

    # Получаем сообщение и проверяем доступ через бота
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )
    
    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(message.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow deleting messages"
        )

    # Soft delete - можно добавить поле is_deleted в модель
    # Пока просто удаляем физически
    db.delete(message)
    db.commit()

    logger.info(f"Message deleted: {message_id} by user {current_user.email}")
    return {"status": "deleted", "message": "Message has been deleted"}
