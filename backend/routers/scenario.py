"""
API endpoints для работы со сценариями
"""
from typing import List, Optional
import copy
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel, field_serializer

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User
from backend.models.scenario import (
    Scenario,
    ScenarioVersion,
    SCENARIO_STATUS_DRAFT,
    VERSION_TYPE_DRAFT,
    VERSION_TYPE_PUBLISHED,
)
from backend.models.bot import Bot
from backend.models.event import ScenarioExecution
from backend.utils.bot_access import check_bot_access, check_bot_edit_permission
from backend.utils.plan_limits import check_can_publish

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
    published_content: Optional[dict] = None
    status: str = SCENARIO_STATUS_DRAFT
    order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    usage_bots_count: int = 0

    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        return dt.isoformat()

    class Config:
        from_attributes = True


class ScenarioListItemOut(BaseModel):
    id: int
    name: str
    type: str
    createdAt: Optional[datetime] = None
    totalEntries: int = 0
    conversionRate: float = 0.0

    @field_serializer("createdAt")
    def serialize_created_at(self, dt: Optional[datetime], _info):
        return dt.isoformat() if dt else None


class ScenarioDetailOut(BaseModel):
    id: int
    name: str
    type: str
    createdAt: Optional[datetime] = None
    description: Optional[str] = None
    totalEntries: int = 0
    completed: int = 0
    dropped: int = 0
    conversionRate: float = 0.0

    @field_serializer("createdAt")
    def serialize_created_at(self, dt: Optional[datetime], _info):
        return dt.isoformat() if dt else None


class ScenarioNodeOut(BaseModel):
    """Блок внутри сценария для выбора в UI"""
    id: str
    title: str
    block_type: str
    icon: Optional[str] = None


class ScenarioVersionOut(BaseModel):
    """Версия сценария для API"""
    id: int
    version: int
    created_at: Optional[datetime] = None
    is_active: bool

    @field_serializer('created_at')
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


# Получить ВСЕ сценарии текущего пользователя
@router.get("/my", response_model=List[ScenarioOut])
def get_my_scenarios(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить все сценарии текущего пользователя (включая привязанные к ботам и библиотечные)
    """
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.user_id == current_user.id)
        .order_by(Scenario.created_at.desc())
        .all()
    )

    usage_by_source: dict[int, set[int]] = {}
    for s in scenarios:
        if not s.bot_id or not isinstance(s.content, dict):
            continue
        meta = s.content.get("meta") if isinstance(s.content.get("meta"), dict) else {}
        source_id = meta.get("source_scenario_id")
        if isinstance(source_id, int):
            usage_by_source.setdefault(source_id, set()).add(s.bot_id)

    result = []
    for s in scenarios:
        setattr(s, "usage_bots_count", len(usage_by_source.get(s.id, set())))
        result.append(s)
    return result


@router.get("/", response_model=List[ScenarioListItemOut])
def get_scenarios(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.user_id == current_user.id)
        .order_by(Scenario.created_at.desc())
        .all()
    )
    scenario_ids = [s.id for s in scenarios]
    stats_by_id = {}
    if scenario_ids:
        stats_rows = (
            db.query(
                ScenarioExecution.scenario_id,
                func.count(ScenarioExecution.id).label("entries"),
                func.sum(case((ScenarioExecution.status == "completed", 1), else_=0)).label("completed"),
            )
            .filter(ScenarioExecution.scenario_id.in_(scenario_ids))
            .group_by(ScenarioExecution.scenario_id)
            .all()
        )
        for row in stats_rows:
            entries = int(row.entries or 0)
            completed = int(row.completed or 0)
            stats_by_id[row.scenario_id] = {
                "entries": entries,
                "conversion": round((completed / entries * 100) if entries else 0, 2),
            }

    return [
        ScenarioListItemOut(
            id=s.id,
            name=s.name,
            type="main" if s.is_main else "other",
            createdAt=s.created_at,
            totalEntries=stats_by_id.get(s.id, {}).get("entries", 0),
            conversionRate=stats_by_id.get(s.id, {}).get("conversion", 0.0),
        )
        for s in scenarios
    ]


@router.get("/{scenario_id}", response_model=ScenarioDetailOut)
def get_scenario_by_id(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_access(scenario, current_user.id, db)

    row = (
        db.query(
            func.count(ScenarioExecution.id).label("entries"),
            func.sum(case((ScenarioExecution.status == "completed", 1), else_=0)).label("completed"),
            func.sum(
                case((ScenarioExecution.status.in_(("failed", "cancelled", "dropped")), 1), else_=0)
            ).label("dropped"),
        )
        .filter(ScenarioExecution.scenario_id == scenario.id)
        .first()
    )
    entries = int((row.entries if row else 0) or 0)
    completed = int((row.completed if row else 0) or 0)
    dropped = int((row.dropped if row else 0) or 0)

    return ScenarioDetailOut(
        id=scenario.id,
        name=scenario.name,
        type="main" if scenario.is_main else "other",
        createdAt=scenario.created_at,
        description=scenario.description,
        totalEntries=entries,
        completed=completed,
        dropped=dropped,
        conversionRate=round((completed / entries * 100) if entries else 0, 2),
    )


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
        status=SCENARIO_STATUS_DRAFT,
        is_library=scenario_data.is_library,
        is_main=scenario_data.is_main,
        order=0,
    )
    
    db.add(scenario)
    db.flush()
    if scenario.content:
        _create_scenario_version(scenario, db)
    db.commit()
    db.refresh(scenario)
    
    return scenario


def _check_scenario_access(scenario: Scenario, user_id: int, db: Session) -> None:
    """Проверяет доступ к сценарию (чтение). Вызывает HTTPException при отказе."""
    if scenario.user_id == user_id:
        return
    if scenario.is_standard:
        return
    if scenario.bot_id:
        check_bot_access(scenario.bot_id, user_id, db)
        return
    raise HTTPException(status_code=403, detail="Access denied")


def _check_scenario_edit_access(scenario: Scenario, user_id: int, db: Session) -> None:
    """Проверяет право на редактирование сценария. Вызывает HTTPException при отказе."""
    if scenario.user_id == user_id:
        return
    if scenario.bot_id:
        bot = db.query(Bot).filter(Bot.id == scenario.bot_id).first()
        if bot and check_bot_edit_permission(bot, user_id, db):
            return
    raise HTTPException(
        status_code=403,
        detail="Access denied: No permission to edit this scenario"
    )


def _create_scenario_version(scenario: Scenario, db: Session, version_type: str = VERSION_TYPE_DRAFT) -> None:
    """Создаёт новую версию сценария. Вызывать внутри транзакции."""
    content = scenario.content
    if content is None:
        content = {"nodes": [], "edges": []}
    max_version = (
        db.query(ScenarioVersion)
        .filter(
            ScenarioVersion.scenario_id == scenario.id,
            ScenarioVersion.version_type == version_type,
        )
        .count()
    )
    new_version_num = max_version + 1
    # Снимаем is_active с текущей активной версии того же типа
    db.query(ScenarioVersion).filter(
        ScenarioVersion.scenario_id == scenario.id,
        ScenarioVersion.version_type == version_type,
        ScenarioVersion.is_active == True,
    ).update({"is_active": False})
    version = ScenarioVersion(
        scenario_id=scenario.id,
        version=new_version_num,
        version_type=version_type,
        content=content,
        is_active=True,
    )
    db.add(version)


# Обновить сценарий
@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    scenario_data: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Обновить существующий сценарий.
    При изменении content создаётся новая версия в scenario_versions.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_edit_access(scenario, current_user.id, db)
    
    # Обновляем поля
    update_data = scenario_data.model_dump(exclude_unset=True)
    content_updated = "content" in update_data
    
    for field, value in update_data.items():
        setattr(scenario, field, value)
    
    if content_updated and scenario.content is not None:
        _create_scenario_version(scenario, db)
    
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
        bot_id=None,
        name=name or source.name,
        description=description or source.description,
        icon=icon or source.icon,
        category=category or source.category,
        content=source.content,
        status=SCENARIO_STATUS_DRAFT,
        is_library=True,
        is_main=False,
        order=0,
    )
    
    db.add(library_scenario)
    db.commit()
    db.refresh(library_scenario)
    
    return library_scenario


@router.post("/{scenario_id}/save-as-scenario", response_model=ScenarioOut)
def save_as_scenario(
    scenario_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Сохранить текущий сценарий как отдельный сценарий в разделе "Мои сценарии".
    Создаётся КОПИЯ без привязки к боту.
    """
    source = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_access(source, current_user.id, db)

    copied_content = copy.deepcopy(source.content or {"nodes": [], "edges": []})
    meta = copied_content.get("meta") if isinstance(copied_content.get("meta"), dict) else {}
    meta["source_scenario_id"] = source.id
    copied_content["meta"] = meta

    copied = Scenario(
        user_id=current_user.id,
        bot_id=None,
        name=name or f"{source.name} (копия)",
        description=description if description is not None else source.description,
        icon=source.icon,
        category=source.category,
        content=copied_content,
        published_content=copy.deepcopy(source.published_content) if source.published_content else None,
        status=SCENARIO_STATUS_DRAFT,
        is_library=False,
        is_main=False,
        order=0,
    )
    db.add(copied)
    db.commit()
    db.refresh(copied)
    setattr(copied, "usage_bots_count", 0)
    return copied


# Получить список блоков внутри сценария
@router.get("/{scenario_id}/nodes", response_model=List[ScenarioNodeOut])
def get_scenario_nodes(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить список блоков внутри сценария для выбора в UI.
    Возвращает список узлов с их названиями и типами.
    """
    scenario = db.query(Scenario).filter(
        Scenario.id == scenario_id
    ).first()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    
    # Проверяем доступ: либо владелец, либо сценарий в публичной библиотеке
    if scenario.user_id != current_user.id and not scenario.is_standard:
        # Если сценарий привязан к боту - проверяем доступ к боту
        if scenario.bot_id:
            check_bot_access(scenario.bot_id, current_user.id, db)
        else:
            raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    nodes = []
    if scenario.content and "nodes" in scenario.content:
        for node in scenario.content["nodes"]:
            node_data = node.get("data", {})
            nodes.append(ScenarioNodeOut(
                id=node.get("id", ""),
                title=node_data.get("title", node_data.get("blockId", "Блок")),
                block_type=node_data.get("blockId", "unknown"),
                icon=node_data.get("icon")
            ))
    
    return nodes


# Получить список версий сценария
@router.get("/{scenario_id}/versions", response_model=List[ScenarioVersionOut])
def get_scenario_versions(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить список версий сценария.
    Возвращает id, version, created_at, is_active для каждой версии.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_access(scenario, current_user.id, db)
    
    versions = (
        db.query(ScenarioVersion)
        .filter(
            ScenarioVersion.scenario_id == scenario_id,
            ScenarioVersion.version_type == VERSION_TYPE_DRAFT,
        )
        .order_by(ScenarioVersion.version.desc())
        .all()
    )
    return versions


# Восстановить сценарий из версии
@router.post("/{scenario_id}/restore/{version_id}", response_model=ScenarioOut)
def restore_scenario_version(
    scenario_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Восстановить сценарий из выбранной версии.
    Восстанавливает content из версии, помечает её как активную,
    снимает is_active с предыдущей, создаёт новую версию (фиксируя факт восстановления).
    Доступно: владелец сценария или owner/admin/developer с правами на бота.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_edit_access(scenario, current_user.id, db)
    
    version = (
        db.query(ScenarioVersion)
        .filter(
            ScenarioVersion.id == version_id,
            ScenarioVersion.scenario_id == scenario_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    
    if not version.content:
        raise HTTPException(
            status_code=400,
            detail="Версия не содержит данных для восстановления"
        )
    
    scenario.content = version.content
    _create_scenario_version(scenario, db)
    
    db.commit()
    db.refresh(scenario)
    
    return scenario


# Опубликовать сценарий (draft -> published)
@router.post("/{scenario_id}/publish", response_model=ScenarioOut)
def publish_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Опубликовать черновик сценария.
    Копирует content (draft) в published_content, создаёт версию published,
    помечает предыдущую published-версию неактивной.
    Бот использует только published_content.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_edit_access(scenario, current_user.id, db)

    check_can_publish(db, current_user)

    if not scenario.content:
        raise HTTPException(
            status_code=400,
            detail="Нет содержимого для публикации. Сохраните черновик сначала."
        )

    scenario.published_content = scenario.content
    scenario.status = "published"
    _create_scenario_version(scenario, db, version_type=VERSION_TYPE_PUBLISHED)

    db.commit()
    db.refresh(scenario)

    return scenario


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
        status=SCENARIO_STATUS_DRAFT,
        is_library=False,
        is_main=False,
        order=0,
    )
    
    db.add(bot_scenario)
    db.commit()
    db.refresh(bot_scenario)
    
    return bot_scenario


@router.post("/{scenario_id}/use-in-bot", response_model=ScenarioOut)
def use_scenario_in_bot(
    scenario_id: int,
    bot_id: int,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Использовать сценарий в боте: добавить КОПИЮ в выбранный бот.
    Оригинал сценария не меняется.
    """
    source = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    _check_scenario_access(source, current_user.id, db)

    bot = check_bot_access(bot_id, current_user.id, db)
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=403,
            detail="Access denied: Your role does not allow adding scenarios"
        )

    copied_content = copy.deepcopy(source.content or {"nodes": [], "edges": []})
    meta = copied_content.get("meta") if isinstance(copied_content.get("meta"), dict) else {}
    meta["source_scenario_id"] = source.id
    copied_content["meta"] = meta

    bot_scenario = Scenario(
        user_id=current_user.id,
        bot_id=bot_id,
        name=name or source.name,
        description=source.description,
        icon=source.icon,
        category=source.category,
        content=copied_content,
        published_content=copy.deepcopy(source.published_content) if source.published_content else None,
        status=SCENARIO_STATUS_DRAFT,
        is_library=False,
        is_main=False,
        order=0,
    )
    db.add(bot_scenario)
    db.commit()
    db.refresh(bot_scenario)
    setattr(bot_scenario, "usage_bots_count", 0)
    return bot_scenario

