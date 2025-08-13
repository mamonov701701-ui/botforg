from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import requests
import logging
from database import get_db
from models.bot import Bot
from models.user import User as UserModel
from schemas.bot import BotCreate, BotOut, BotUpdate, BotListOut
from dependencies.auth import get_current_user
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

def verify_telegram_token(token: str) -> dict:
    """Проверяет токен через Telegram API и возвращает информацию о боте"""
    try:
        response = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                return {
                    "username": data["result"]["username"],
                    "first_name": data["result"]["first_name"],
                    "id": data["result"]["id"]
                }
        logger.warning(f"Invalid Telegram token: {token[:10]}...")
        return None
    except Exception as e:
        logger.error(f"Error verifying Telegram token: {e}")
        return None

def set_telegram_webhook(token: str, webhook_url: str) -> bool:
    """Устанавливает webhook для бота"""
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={"url": webhook_url},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("ok", False)
        return False
    except Exception as e:
        logger.error(f"Error setting webhook: {e}")
        return False

@router.post("/connect", response_model=BotOut, status_code=status.HTTP_201_CREATED)
async def connect_bot(
    bot_data: BotCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Подключение Telegram-бота по токену"""
    
    # Проверяем токен через Telegram API
    telegram_info = verify_telegram_token(bot_data.token)
    if not telegram_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Telegram bot token"
        )
    
    # Проверяем, что username совпадает с полученным от Telegram
    if bot_data.username != telegram_info["username"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username mismatch. Expected: {telegram_info['username']}"
        )
    
    # Проверяем, не подключен ли уже этот бот
    existing_bot = db.query(Bot).filter(Bot.token == bot_data.token).first()
    if existing_bot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bot with this token is already connected"
        )
    
    # Создаем бота
    db_bot = Bot(
        owner_id=current_user.id,
        title=bot_data.title,
        username=bot_data.username,
        token=bot_data.token,
        webhook_url=bot_data.webhook_url
    )
    
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    
    # Устанавливаем webhook если указан URL
    if bot_data.webhook_url:
        webhook_url = f"{bot_data.webhook_url}/{db_bot.id}"
        if set_telegram_webhook(bot_data.token, webhook_url):
            db_bot.webhook_url = webhook_url
            db.commit()
            db.refresh(db_bot)
            logger.info(f"Webhook set for bot {db_bot.id}: {webhook_url}")
        else:
            logger.warning(f"Failed to set webhook for bot {db_bot.id}")
    
    logger.info(f"Bot connected: {db_bot.username} by user {current_user.email}")
    return db_bot

@router.get("/", response_model=BotListOut)
async def get_bots(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получение списка ботов пользователя"""
    bots = db.query(Bot).filter(Bot.owner_id == current_user.id).all()
    return {"total": len(bots), "items": bots}

@router.get("/{bot_id}", response_model=BotOut)
async def get_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получение конкретного бота"""
    bot = db.query(Bot).filter(
        Bot.id == bot_id,
        Bot.owner_id == current_user.id
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot not found"
        )
    
    return bot

@router.patch("/{bot_id}", response_model=BotOut)
async def update_bot(
    bot_id: int,
    bot_update: BotUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Обновление бота"""
    bot = db.query(Bot).filter(
        Bot.id == bot_id,
        Bot.owner_id == current_user.id
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot not found"
        )
    
    # Обновляем только указанные поля
    update_data = bot_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bot, field, value)
    
    bot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(bot)
    
    logger.info(f"Bot updated: {bot.username} by user {current_user.email}")
    return bot

@router.delete("/{bot_id}")
async def delete_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Деактивация бота (soft delete)"""
    bot = db.query(Bot).filter(
        Bot.id == bot_id,
        Bot.owner_id == current_user.id
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot not found"
        )
    
    # Soft delete - деактивируем бота
    bot.is_active = False
    bot.updated_at = datetime.utcnow()
    
    # Удаляем webhook если он был установлен
    if bot.webhook_url:
        try:
            requests.post(
                f"https://api.telegram.org/bot{bot.token}/deleteWebhook",
                timeout=10
            )
            bot.webhook_url = None
        except Exception as e:
            logger.error(f"Error deleting webhook: {e}")
    
    db.commit()
    
    logger.info(f"Bot deactivated: {bot.username} by user {current_user.email}")
    return {"status": "deactivated", "message": "Bot has been deactivated"} 