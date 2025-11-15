import logging
from datetime import datetime, timezone

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_template import BotTemplate
from backend.models.user import User as UserModel
from backend.models.user_template import UserTemplate
from backend.utils.bot_access import (
    check_bot_access,
    check_bot_edit_permission,
    get_accessible_bot_owner_ids,
)
from backend.schemas.bot_template import (
    BotTemplateCreate,
    BotTemplateListOut,
    BotTemplateOut,
    BotTemplateUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=BotTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_bot_template(
    bot_template: BotTemplateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Создание привязки бота к пользовательскому шаблону"""

    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(bot_template.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow managing bot templates"
        )

    # Проверяем, что пользовательский шаблон существует и принадлежит пользователю (если указан)
    if bot_template.user_template_id:
        user_template = (
            db.query(UserTemplate)
            .filter(
                UserTemplate.id == bot_template.user_template_id,
                UserTemplate.owner_id == current_user.id,
            )
            .first()
        )
        if not user_template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User template not found or access denied",
            )

    # Деактивируем существующую активную привязку для этого бота
    existing_active = (
        db.query(BotTemplate)
        .filter(
            BotTemplate.bot_id == bot_template.bot_id, BotTemplate.is_active == True
        )
        .first()
    )

    if existing_active:
        existing_active.is_active = False
        existing_active.updated_at = datetime.now(timezone.utc)
        logger.info(
            f"Deactivated existing bot template binding for bot {bot_template.bot_id}"
        )

    # Создаем новую привязку
    db_bot_template = BotTemplate(
        bot_id=bot_template.bot_id, user_template_id=bot_template.user_template_id
    )

    db.add(db_bot_template)
    db.commit()
    db.refresh(db_bot_template)

    logger.info(
        f"Bot template binding created: bot {bot_template.bot_id} -> template {bot_template.user_template_id} by user {current_user.email}"
    )
    return db_bot_template


@router.get("/", response_model=BotTemplateListOut)
async def get_bot_templates(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    """Получение списка привязок ботов к шаблонам для текущего пользователя"""

    # Получаем все привязки для ботов пользователя и команд
    owner_ids = get_accessible_bot_owner_ids(current_user.id, db)
    bot_templates = (
        db.query(BotTemplate).join(Bot).filter(Bot.owner_id.in_(owner_ids)).all()
    )

    return {"total": len(bot_templates), "items": bot_templates}


@router.get("/{bot_template_id}", response_model=BotTemplateOut)
async def get_bot_template(
    bot_template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение конкретной привязки бота к шаблону"""

    bot_template = db.query(BotTemplate).filter(BotTemplate.id == bot_template_id).first()
    
    if not bot_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot template binding not found",
        )
    
    # Проверяем доступ к боту
    check_bot_access(bot_template.bot_id, current_user.id, db)
    
    return bot_template


@router.patch("/{bot_template_id}", response_model=BotTemplateOut)
async def update_bot_template(
    bot_template_id: int,
    bot_template_update: BotTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление привязки бота к шаблону"""

    bot_template = db.query(BotTemplate).filter(BotTemplate.id == bot_template_id).first()
    
    if not bot_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot template binding not found",
        )
    
    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(bot_template.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow managing bot templates"
        )

    # Обновляем только указанные поля
    update_data = bot_template_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bot_template, field, value)

    bot_template.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(bot_template)

    logger.info(
        f"Bot template binding updated: {bot_template_id} by user {current_user.email}"
    )
    return bot_template


@router.delete("/{bot_template_id}")
async def delete_bot_template(
    bot_template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Удаление (деактивация) привязки бота к шаблону"""

    bot_template = db.query(BotTemplate).filter(BotTemplate.id == bot_template_id).first()
    
    if not bot_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot template binding not found",
        )
    
    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(bot_template.bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Your role does not allow managing bot templates"
        )

    # Soft delete - деактивируем привязку
    bot_template.is_active = False
    bot_template.updated_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(
        f"Bot template binding deactivated: {bot_template_id} by user {current_user.email}"
    )
    return {"status": "deleted", "message": "Bot template binding has been deactivated"}
