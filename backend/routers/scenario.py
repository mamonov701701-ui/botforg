"""
API endpoints для работы со сценариями
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_serializer

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User
from backend.models.scenario import Scenario
from backend.models.bot import Bot
from backend.utils.bot_access import check_bot_access, check_bot_edit_permission

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


# Schemas
class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "FileText"
    category: Optional[str] = "other"
    content: Optional[dict] = None
    bot_id: Optional[int] = None  # None если сохраняем в библиотеку
    is_library: bool = False
    is_main: bool = False


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    category: Optional[str] = None
    content: Optional[dict] = None
    order: Optional[int] = None


class ScenarioOut(BaseModel):
    id: int
    user_id: int
    bot_id: Optional[int]
    name: str
    description: Optional[str]
    icon: Optional[str]
    category: Optional[str]
    is_main: bool
    is_library: bool
    is_standard: bool
    is_public: bool
    content: Optional[dict]
    order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        return dt.isoformat()

    class Config:
        from_attributes = True


# Получить все сценарии бота
@router.get("/bot/{bot_id}", response_model=List[ScenarioOut])
def get_bot_scenarios(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить все сценарии конкретного бота
    """
    # Проверяем доступ к боту (владелец или участник команды)
    bot = check_bot_access(bot_id, current_user.id, db)
    
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.bot_id == bot_id)
        .order_by(Scenario.is_main.desc(), Scenario.order, Scenario.created_at)
        .all()
    )
    
    return scenarios


# Получить сценарии из библиотеки
@router.get("/library", response_model=List[ScenarioOut])
def get_library_scenarios(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить сценарии из библиотеки (стандартные + пользовательские)
    """
    query = db.query(Scenario).filter(Scenario.is_library == True)
    
    # Фильтр: стандартные ИЛИ принадлежащие пользователю
    query = query.filter(
        (Scenario.is_standard == True) | (Scenario.user_id == current_user.id)
    )
    
    if category:
        query = query.filter(Scenario.category == category)
    
    scenarios = query.order_by(Scenario.is_standard.desc(), Scenario.name).all()
    
    return scenarios


# Создать новый сценарий
@router.post("/", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(
    scenario_data: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Создать новый сценарий (в боте или в библиотеке)
    """
    # Если bot_id указан - проверяем доступ
    if scenario_data.bot_id:
        bot = check_bot_access(scenario_data.bot_id, current_user.id, db)
        # Проверяем право на редактирование
        if not check_bot_edit_permission(bot, current_user.id, db):
            raise HTTPException(
                status_code=403,
                detail="Access denied: Your role does not allow creating scenarios"
            )
        
        # Если это главный сценарий - снимаем флаг с других
        if scenario_data.is_main:
            db.query(Scenario).filter(
                Scenario.bot_id == scenario_data.bot_id,
                Scenario.is_main == True
            ).update({"is_main": False})
    
    # Создаем сценарий
    scenario = Scenario(
        user_id=current_user.id,
        bot_id=scenario_data.bot_id,
        name=scenario_data.name,
        description=scenario_data.description,
        icon=scenario_data.icon,
        category=scenario_data.category,
        content=scenario_data.content or {"nodes": [], "edges": []},
        is_library=scenario_data.is_library,
        is_main=scenario_data.is_main,
        order=0,
    )
    
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    
    return scenario


# Обновить сценарий
@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    scenario_data: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Обновить существующий сценарий
    """
    scenario = db.query(Scenario).filter(
        Scenario.id == scenario_id,
        Scenario.user_id == current_user.id
    ).first()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    
    # Обновляем поля
    update_data = scenario_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(scenario, field, value)
    
    db.commit()
    db.refresh(scenario)
    
    return scenario


# Удалить сценарий
@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Удалить сценарий
    """
    scenario = db.query(Scenario).filter(
        Scenario.id == scenario_id,
        Scenario.user_id == current_user.id
    ).first()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    
    # Нельзя удалить главный сценарий
    if scenario.is_main and scenario.bot_id:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить главный сценарий. Создайте другой главный сценарий сначала."
        )
    
    # Нельзя удалить единственный сценарий бота
    if scenario.bot_id:
        count = db.query(Scenario).filter(Scenario.bot_id == scenario.bot_id).count()
        if count == 1:
            raise HTTPException(
                status_code=400,
                detail="Нельзя удалить единственный сценарий бота"
            )
    
    db.delete(scenario)
    db.commit()
    
    return None


# Сохранить сценарий в библиотеку
@router.post("/{scenario_id}/save-to-library", response_model=ScenarioOut)
def save_to_library(
    scenario_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    icon: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Сохранить копию сценария в библиотеку
    """
    # Находим исходный сценарий
    source = db.query(Scenario).filter(
        Scenario.id == scenario_id,
        Scenario.user_id == current_user.id
    ).first()
    
    if not source:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    
    # Создаем копию в библиотеке
    library_scenario = Scenario(
        user_id=current_user.id,
        bot_id=None,  # В библиотеке нет привязки к боту
        name=name or source.name,
        description=description or source.description,
        icon=icon or source.icon,
        category=category or source.category,
        content=source.content,
        is_library=True,
        is_main=False,
        order=0,
    )
    
    db.add(library_scenario)
    db.commit()
    db.refresh(library_scenario)
    
    return library_scenario


# Добавить сценарий из библиотеки в бот
@router.post("/library/{library_scenario_id}/add-to-bot", response_model=ScenarioOut)
def add_from_library(
    library_scenario_id: int,
    bot_id: int,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Добавить сценарий из библиотеки в конкретный бот
    """
    # Проверяем доступ к боту и право на редактирование
    bot = check_bot_access(bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=403,
            detail="Access denied: Your role does not allow adding scenarios"
        )
    
    # Находим сценарий в библиотеке
    library_scenario = db.query(Scenario).filter(
        Scenario.id == library_scenario_id,
        Scenario.is_library == True
    ).filter(
        (Scenario.is_standard == True) | (Scenario.user_id == current_user.id)
    ).first()
    
    if not library_scenario:
        raise HTTPException(status_code=404, detail="Сценарий в библиотеке не найден")
    
    # Создаем копию для бота
    bot_scenario = Scenario(
        user_id=current_user.id,
        bot_id=bot_id,
        name=name or library_scenario.name,
        description=library_scenario.description,
        icon=library_scenario.icon,
        category=library_scenario.category,
        content=library_scenario.content,
        is_library=False,
        is_main=False,
        order=0,
    )
    
    db.add(bot_scenario)
    db.commit()
    db.refresh(bot_scenario)
    
    return bot_scenario

