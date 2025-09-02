from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging
from backend.database import get_db
from backend.models.user_template import UserTemplate
from backend.models.user import User as UserModel
from backend.models.template import Template
from backend.schemas.user_template import UserTemplateCreate, UserTemplateOut, UserTemplateUpdate, UserTemplateListOut
from dependencies.auth import get_current_user
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/", response_model=UserTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_user_template(
    user_template: UserTemplateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Создание пользовательского шаблона"""
    
    # Проверяем, что указанный template_id существует (если указан)
    if user_template.template_id:
        template = db.query(Template).filter(Template.id == user_template.template_id).first()
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced template not found"
            )
    
    # Создаем пользовательский шаблон
    db_user_template = UserTemplate(
        owner_id=current_user.id,
        title=user_template.title,
        description=user_template.description,
        template_id=user_template.template_id
    )
    
    db.add(db_user_template)
    db.commit()
    db.refresh(db_user_template)
    
    logger.info(f"User template created: {db_user_template.title} by user {current_user.email}")
    return db_user_template

@router.get("/", response_model=UserTemplateListOut)
async def get_user_templates(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получение списка пользовательских шаблонов"""
    user_templates = db.query(UserTemplate).filter(UserTemplate.owner_id == current_user.id).all()
    return {"total": len(user_templates), "items": user_templates}

@router.get("/{user_template_id}", response_model=UserTemplateOut)
async def get_user_template(
    user_template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получение конкретного пользовательского шаблона"""
    user_template = db.query(UserTemplate).filter(
        UserTemplate.id == user_template_id,
        UserTemplate.owner_id == current_user.id
    ).first()
    
    if not user_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User template not found"
        )
    
    return user_template

@router.patch("/{user_template_id}", response_model=UserTemplateOut)
async def update_user_template(
    user_template_id: int,
    user_template_update: UserTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Обновление пользовательского шаблона"""
    user_template = db.query(UserTemplate).filter(
        UserTemplate.id == user_template_id,
        UserTemplate.owner_id == current_user.id
    ).first()
    
    if not user_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User template not found"
        )
    
    # Проверяем, что указанный template_id существует (если указан)
    if user_template_update.template_id is not None:
        template = db.query(Template).filter(Template.id == user_template_update.template_id).first()
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced template not found"
            )
    
    # Обновляем только указанные поля
    update_data = user_template_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_template, field, value)
    
    user_template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user_template)
    
    logger.info(f"User template updated: {user_template.title} by user {current_user.email}")
    return user_template

@router.delete("/{user_template_id}")
async def delete_user_template(
    user_template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Удаление пользовательского шаблона"""
    user_template = db.query(UserTemplate).filter(
        UserTemplate.id == user_template_id,
        UserTemplate.owner_id == current_user.id
    ).first()
    
    if not user_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User template not found"
        )
    
    # Soft delete - деактивируем шаблон
    user_template.is_active = False
    user_template.updated_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"User template deactivated: {user_template.title} by user {current_user.email}")
    return {"status": "deleted", "message": "User template has been deactivated"}

