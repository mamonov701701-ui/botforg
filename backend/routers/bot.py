import logging
from datetime import datetime, timezone
from typing import Any, Dict

import requests
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.scenario import Scenario
from backend.models.user import User as UserModel
from backend.schemas.bot import BotConnectRequest, BotListOut, BotOut, BotUpdate
from backend.utils.bot_access import (
    check_bot_access,
    check_bot_edit_permission,
    check_bot_delete_permission,
    get_accessible_bot_owner_ids,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()


def verify_telegram_token(token: str) -> dict:
    """Проверяет токен через Telegram API и возвращает информацию о боте"""
    try:
        response = requests.get(
            f"https://api.telegram.org/bot{token}/getMe", timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                return {
                    "username": data["result"]["username"],
                    "first_name": data["result"]["first_name"],
                    "id": data["result"]["id"],
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
            timeout=10,
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
    payload: BotConnectRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Подключение Telegram-бота по токену"""

    # Проверяем, что хотя бы один параметр передан
    if not any(
        [payload.token, payload.webhook_url, payload.bot_id, payload.template_id]
    ):
        raise HTTPException(status_code=400, detail="No connection params provided")

    # Если передан токен, проверяем его через Telegram API
    if payload.token:
        telegram_info = verify_telegram_token(payload.token)
        if not telegram_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Telegram bot token",
            )

        # Проверяем, не подключен ли уже этот бот
        existing_bot = db.query(Bot).filter(Bot.token == payload.token).first()
        if existing_bot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bot with this token is already connected",
            )

        # Проверяем соответствие username если он указан в запросе
        if payload.username and payload.username != telegram_info["username"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username mismatch",
            )

        # Создаем бота с данными из Telegram API
        db_bot = Bot(
            owner_id=current_user.id,
            title=telegram_info["first_name"],  # Используем имя из Telegram
            username=telegram_info["username"],  # Используем username из Telegram
            token=payload.token,
            webhook_url=str(payload.webhook_url) if payload.webhook_url else None,
        )

        db.add(db_bot)
        db.commit()
        db.refresh(db_bot)
        
        # Создаем главный сценарий автоматически
        main_scenario = Scenario(
            user_id=current_user.id,
            bot_id=db_bot.id,
            name="Главный",
            description="Главный сценарий - точка входа в бот",
            icon="Home",
            category="main",
            is_main=True,
            is_library=False,
            is_standard=False,
            content={"nodes": [], "edges": []},
            order=0,
        )
        db.add(main_scenario)
        db.commit()
        logger.info(f"Main scenario created for bot {db_bot.id}")

        # Устанавливаем webhook если указан URL
        if payload.webhook_url:
            webhook_url = f"{payload.webhook_url}/{db_bot.id}"
            if set_telegram_webhook(payload.token, webhook_url):
                db_bot.webhook_url = webhook_url
                db.commit()
                db.refresh(db_bot)
                logger.info(f"Webhook set for bot {db_bot.id}: {webhook_url}")
            else:
                logger.warning(f"Failed to set webhook for bot {db_bot.id}")

        logger.info(f"Bot connected: {db_bot.username} by user {current_user.email}")
        return db_bot
    else:
        # Если токен не передан, возвращаем ошибку
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is required for bot connection",
        )


@router.get("/", response_model=BotListOut)
async def get_bots(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    """
    Получение списка ботов пользователя.
    Включает: свои боты + боты команд, где пользователь участник.
    Возвращает информацию о владельце для группировки по проектам.
    """
    from backend.models.team import TeamMember
    
    # Получаем список ID владельцев ботов, к которым есть доступ
    owner_ids = get_accessible_bot_owner_ids(current_user.id, db)
    
    # Получаем все боты: свои + боты владельцев команд
    bots = db.query(Bot).filter(Bot.owner_id.in_(owner_ids)).all()
    
    # Получаем информацию о владельцах и ролях в командах
    owner_info = {}
    team_roles = {}
    
    # Получаем информацию о владельцах
    owners = db.query(UserModel).filter(UserModel.id.in_(owner_ids)).all()
    for owner in owners:
        owner_info[owner.id] = {
            "name": owner.name,
            "email": owner.email,
            "public_id": owner.public_id,
        }
    
    # Получаем роли в командах (если пользователь не владелец)
    if current_user.id in owner_ids:
        # Если пользователь владелец, его боты не требуют роли
        pass
    
    team_members = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.owner_id.in_(owner_ids)
    ).all()
    
    for tm in team_members:
        team_roles[tm.owner_id] = tm.role
    
    # Формируем ответ с информацией о владельцах
    bot_items = []
    for bot in bots:
        owner_data = owner_info.get(bot.owner_id, {})
        team_role = team_roles.get(bot.owner_id) if bot.owner_id != current_user.id else None
        
        bot_items.append(BotOut(
            id=bot.id,
            title=bot.title,
            username=bot.username,
            webhook_url=bot.webhook_url,
            is_active=bot.is_active,
            created_at=bot.created_at,
            updated_at=bot.updated_at,
            owner_id=bot.owner_id,
            owner_name=owner_data.get("name"),
            owner_email=owner_data.get("email"),
            owner_public_id=owner_data.get("public_id"),
            team_role=team_role,
        ))
    
    return {"total": len(bot_items), "items": bot_items}


@router.get("/{bot_id}", response_model=BotOut)
async def get_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение конкретного бота"""
    bot = check_bot_access(bot_id, current_user.id, db)
    return bot


@router.patch("/{bot_id}", response_model=BotOut)
async def update_bot(
    bot_id: int,
    bot_update: BotUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление бота"""
    bot = check_bot_access(bot_id, current_user.id, db)
    
    # Проверяем право на редактирование
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow editing bots"
        )

    # Обновляем только указанные поля
    update_data = bot_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bot, field, value)

    bot.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(bot)

    logger.info(f"Bot updated: {bot.username} by user {current_user.email}")
    return bot


@router.delete("/{bot_id}")
async def delete_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Деактивация бота (soft delete)"""
    bot = check_bot_access(bot_id, current_user.id, db)
    
    # Только владелец может удалять бота
    if not check_bot_delete_permission(bot, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only bot owner can delete bots"
        )

    # Soft delete - деактивируем бота
    bot.is_active = False
    bot.updated_at = datetime.now(timezone.utc)

    # Удаляем webhook если он был установлен
    if bot.webhook_url:
        try:
            requests.post(
                f"https://api.telegram.org/bot{bot.token}/deleteWebhook", timeout=10
            )
            bot.webhook_url = None
        except Exception as e:
            logger.error(f"Error deleting webhook: {e}")

    db.commit()

    logger.info(f"Bot deactivated: {bot.username} by user {current_user.email}")
    return {"status": "deactivated", "message": "Bot has been deactivated"}


@router.get("/{bot_id}/graph")
async def get_bot_graph(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение графа бота (узлы и связи)"""
    bot = check_bot_access(bot_id, current_user.id, db)

    # Возвращаем граф из content или дефолтные данные
    graph_data = (
        bot.content
        if hasattr(bot, "content") and bot.content
        else {
            "nodes": [
                {
                    "id": "1",
                    "type": "input",
                    "data": {"label": "Начало"},
                    "position": {"x": 250, "y": 5},
                },
                {
                    "id": "2",
                    "data": {"label": "Шаг 1"},
                    "position": {"x": 100, "y": 100},
                },
                {
                    "id": "3",
                    "data": {"label": "Шаг 2"},
                    "position": {"x": 400, "y": 100},
                },
            ],
            "edges": [
                {"id": "e1-2", "source": "1", "target": "2"},
                {"id": "e2-3", "source": "2", "target": "3"},
            ],
        }
    )

    return graph_data


@router.patch("/{bot_id}/graph")
async def update_bot_graph(
    bot_id: int,
    graph_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление графа бота (узлы и связи)"""
    bot = check_bot_access(bot_id, current_user.id, db)
    
    # Проверяем право на редактирование
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow editing bots"
        )

    # Валидируем структуру данных
    if not isinstance(graph_data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid graph data format"
        )

    if "nodes" not in graph_data or "edges" not in graph_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Graph data must contain 'nodes' and 'edges'",
        )

    # Сохраняем граф в content
    if hasattr(bot, "content"):
        bot.content = graph_data
    else:
        # Если поле content не существует, сохраняем в другое поле или создаем его
        bot.content = graph_data

    bot.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(bot)

    return {"message": "Graph updated successfully", "bot_id": bot_id}
