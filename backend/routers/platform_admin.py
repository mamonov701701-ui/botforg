"""
API для управления платформой (только для владельца)
Управление пользователями и назначение BF-ролей
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models.user import User, ROLES
from backend.models.platform_role import PlatformRole, BF_ROLES
from backend.models.bf_team_member import BFTeamMember
from backend.models.base_role import BaseRole
from backend.dependencies.auth import get_current_user


router = APIRouter(prefix="/api/platform-admin", tags=["Platform Admin"])


# === Schemas ===

class PlatformRoleListItem(BaseModel):
    id: int
    role_name: str
    granted_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    
    class Config:
        from_attributes = True


class BaseRoleListItem(BaseModel):
    id: int
    role_name: str
    granted_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    
    class Config:
        from_attributes = True


class UserListItem(BaseModel):
    id: int
    public_id: int
    email: str
    name: Optional[str]
    role: str
    created_at: datetime
    platform_roles: List[PlatformRoleListItem] = []
    base_roles: List[BaseRoleListItem] = []
    
    class Config:
        from_attributes = True


class PlatformRoleCreate(BaseModel):
    user_id: int
    role_name: str
    expires_at: Optional[str] = None  # Принимаем строку ISO формата
    notes: Optional[str] = None


class PlatformRoleUpdate(BaseModel):
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class BaseRoleCreate(BaseModel):
    user_id: int
    role_name: str
    expires_at: Optional[str] = None  # Принимаем строку ISO формата
    notes: Optional[str] = None


class BaseRoleUpdate(BaseModel):
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class BaseRoleOut(BaseModel):
    id: int
    user_id: int
    role_name: str
    granted_by: int
    granted_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class PlatformRoleOut(BaseModel):
    id: int
    user_id: int
    role_name: str
    granted_by: int
    granted_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class UserDetailOut(BaseModel):
    id: int
    public_id: int
    email: str
    name: Optional[str]
    role: str
    created_at: datetime
    platform_roles: List[PlatformRoleOut] = []
    
    class Config:
        from_attributes = True


# === Middleware ===

def require_owner(current_user: User = Depends(get_current_user)):
    """Проверка что пользователь - владелец платформы"""
    if current_user.role != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Только владелец платформы имеет доступ к этому разделу"
        )
    return current_user


# === Endpoints ===

class UserListResponse(BaseModel):
    items: List[UserListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("/users", response_model=UserListResponse)
async def get_all_users(
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(50, ge=1, le=100, description="Размер страницы"),
    search: Optional[str] = None,
    team_only: bool = False,
    sort_by: Optional[str] = Query(None, description="Поле для сортировки: id, email, name, role, created_at"),
    sort_order: Optional[str] = Query("desc", description="Порядок сортировки: asc или desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Получить список всех пользователей платформы с пагинацией
    Только для owner
    
    Args:
        page: Номер страницы (начиная с 1)
        page_size: Количество пользователей на странице (1-100)
        search: Поиск по email, имени или public_id
        team_only: если True, показывать только участников BF команды (с активными ролями)
        sort_by: Поле для сортировки (id, email, name, role, created_at)
        sort_order: Порядок сортировки (asc или desc)
    """
    query = db.query(User)
    
    # Фильтр только участников команды
    if team_only:
        team_members = db.query(BFTeamMember).filter(
            BFTeamMember.is_active == True
        ).all()
        team_user_ids = [tm.user_id for tm in team_members]
        
        if team_user_ids:
            query = query.filter(User.id.in_(team_user_ids))
        else:
            return UserListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0
            )
    
    # Поиск по email, имени или public_id
    if search:
        try:
            search_public_id = int(search)
            query = query.filter(
                (User.email.contains(search)) | 
                (User.name.contains(search)) |
                (User.public_id == search_public_id)
            )
        except ValueError:
            query = query.filter(
                (User.email.contains(search)) | (User.name.contains(search))
            )
    
    # Подсчет общего количества (до сортировки и пагинации)
    total = query.count()
    
    # Сортировка
    valid_sort_fields = {"id": User.id, "email": User.email, "name": User.name, "role": User.role, "created_at": User.created_at}
    if sort_by and sort_by in valid_sort_fields:
        sort_field = valid_sort_fields[sort_by]
        if sort_order and sort_order.lower() == "asc":
            query = query.order_by(sort_field.asc())
        else:
            query = query.order_by(sort_field.desc())
    else:
        # По умолчанию сортируем по ID в обратном порядке (новые сначала)
        query = query.order_by(User.id.desc())
    
    # Пагинация
    skip = (page - 1) * page_size
    users = query.offset(skip).limit(page_size).all()
    
    # Добавляем информацию о BF-ролях и базовых ролях
    result = []
    for user in users:
        platform_roles = db.query(PlatformRole).filter(
            PlatformRole.user_id == user.id,
            PlatformRole.is_active == True
        ).all()
        
        # Формируем объекты BF-ролей с ID для возможности удаления
        role_items = []
        for pr in platform_roles:
            if pr.is_valid():
                role_items.append(PlatformRoleListItem(
                    id=pr.id,
                    role_name=pr.role_name,
                    granted_at=pr.granted_at,
                    expires_at=pr.expires_at,
                    is_active=pr.is_active
                ))
        
        # Получаем базовые роли с историей
        base_roles = db.query(BaseRole).filter(
            BaseRole.user_id == user.id,
            BaseRole.is_active == True
        ).all()
        
        # Формируем объекты базовых ролей
        base_role_items = []
        for br in base_roles:
            if br.is_valid():
                base_role_items.append(BaseRoleListItem(
                    id=br.id,
                    role_name=br.role_name,
                    granted_at=br.granted_at,
                    expires_at=br.expires_at,
                    is_active=br.is_active
                ))
        
        user_dict = {
            "id": user.id,
            "public_id": user.public_id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at,
            "platform_roles": role_items,
            "base_roles": base_role_items
        }
        result.append(UserListItem(**user_dict))
    
    # Вычисляем общее количество страниц
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    
    return UserListResponse(
        items=result,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/users/{user_id}", response_model=UserDetailOut)
async def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Получить детальную информацию о пользователе
    Только для owner
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Получаем все роли пользователя
    platform_roles = db.query(PlatformRole).filter(
        PlatformRole.user_id == user_id
    ).all()
    
    return UserDetailOut(
        id=user.id,
        public_id=user.public_id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at,
        platform_roles=[PlatformRoleOut.from_orm(pr) for pr in platform_roles]
    )


@router.get("/users/{user_id}/detailed")
async def get_user_detailed_info(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Получить детальную информацию о пользователе включая проекты, ботов и статистику
    Только для owner
    """
    from backend.models.bot import Bot
    from backend.models.scenario import Scenario
    from backend.models.team import TeamMember
    from backend.models.bot_user_state import BotUserState
    from backend.models.message import Message
    from sqlalchemy import func
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Получаем все роли пользователя
    platform_roles = db.query(PlatformRole).filter(
        PlatformRole.user_id == user_id,
        PlatformRole.is_active == True
    ).all()
    
    # Получаем боты пользователя
    user_bots = db.query(Bot).filter(Bot.owner_id == user_id).all()
    
    # Получаем сценарии пользователя
    user_scenarios = db.query(Scenario).filter(Scenario.user_id == user_id).all()
    
    # Получаем команды, где пользователь участник
    team_memberships = db.query(TeamMember).filter(TeamMember.user_id == user_id).all()
    
    # Статистика по ботам
    bot_stats = {}
    total_bot_users = 0
    total_messages = 0
    
    for bot in user_bots:
        # Получаем BotInstance для подсчета пользователей
        from backend.models.bot import BotInstance
        bot_instance = db.query(BotInstance).filter(
            (BotInstance.token == bot.token) | 
            (BotInstance.username == bot.username)
        ).first()
        
        bot_users_count = 0
        bot_messages_count = 0
        
        if bot_instance:
            bot_users_count = db.query(BotUserState).filter(
                BotUserState.bot_id == bot_instance.id
            ).count()
            
            bot_messages_count = db.query(Message).filter(
                Message.bot_id == bot.id
            ).count()
        
        bot_stats[bot.id] = {
            "users_count": bot_users_count,
            "messages_count": bot_messages_count,
        }
        
        total_bot_users += bot_users_count
        total_messages += bot_messages_count
    
    # Формируем информацию о проектах (команды, где пользователь владелец)
    projects = []
    for membership in team_memberships:
        owner = db.query(User).filter(User.id == membership.owner_id).first()
        if owner:
            owner_bots = db.query(Bot).filter(Bot.owner_id == owner.id).all()
            projects.append({
                "owner_id": owner.id,
                "owner_name": owner.name,
                "owner_email": owner.email,
                "role": membership.role,
                "bots_count": len(owner_bots),
            })
    
    return {
        "user": {
            "id": user.id,
            "public_id": user.public_id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "platform_roles": [
                {
                    "id": pr.id,
                    "role_name": pr.role_name,
                    "granted_at": pr.granted_at.isoformat() if pr.granted_at else None,
                    "expires_at": pr.expires_at.isoformat() if pr.expires_at else None,
                    "is_active": pr.is_active,
                }
                for pr in platform_roles
            ],
        },
        "bots": [
            {
                "id": bot.id,
                "title": bot.title,
                "username": bot.username,
                "is_active": bot.is_active,
                "is_suspended": bot.is_suspended or False,
                "suspension_type": bot.suspension_type,
                "suspension_reason": bot.suspension_reason,
                "created_at": bot.created_at.isoformat() if bot.created_at else None,
                "users_count": bot_stats.get(bot.id, {}).get("users_count", 0),
                "messages_count": bot_stats.get(bot.id, {}).get("messages_count", 0),
            }
            for bot in user_bots
        ],
        "scenarios": [
            {
                "id": scenario.id,
                "name": scenario.name,
                "bot_id": scenario.bot_id,
                "is_main": scenario.is_main,
                "is_library": scenario.is_library,
                "created_at": scenario.created_at.isoformat() if scenario.created_at else None,
            }
            for scenario in user_scenarios
        ],
        "team_memberships": projects,
        "statistics": {
            "total_bots": len(user_bots),
            "active_bots": len([b for b in user_bots if b.is_active]),
            "total_scenarios": len(user_scenarios),
            "total_bot_users": total_bot_users,
            "total_messages": total_messages,
            "team_projects_count": len(projects),
        },
    }


class PlatformStatsResponse(BaseModel):
    total_users: int
    total_projects: int  # Уникальных владельцев ботов
    total_bots: int
    active_bots: int
    total_scenarios: int
    total_bot_users: int  # Всего пользователей у всех ботов
    total_messages: int


@router.get("/stats", response_model=PlatformStatsResponse)
async def get_platform_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Получить общую статистику платформы
    Только для owner
    """
    from backend.models.bot import Bot, BotInstance
    from backend.models.scenario import Scenario
    from backend.models.bot_user_state import BotUserState
    from backend.models.message import Message
    from sqlalchemy import func, distinct
    
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Всего пользователей - пробуем несколько способов
        # Способ 1: через count
        total_users_1 = db.query(func.count(User.id)).scalar()
        # Способ 2: через len
        total_users_2 = len(db.query(User).all())
        # Используем тот, который не None
        total_users = total_users_1 if total_users_1 is not None else (total_users_2 if total_users_2 else 0)
        logger.info(f"Total users query result (count): {total_users_1}, (len): {total_users_2}, (final): {total_users}")
        
        # Всего уникальных проектов (владельцев ботов)
        # Сначала получаем все боты, чтобы проверить есть ли они
        all_bots = db.query(Bot).all()
        logger.info(f"Found {len(all_bots)} bots in total")
        
        if all_bots:
            # Получаем уникальных владельцев - просто берем множество owner_id
            owner_ids = set([bot.owner_id for bot in all_bots])
            total_projects = len(owner_ids)
        else:
            total_projects = 0
        logger.info(f"Total projects (unique owners): {total_projects}")
        
        # Всего ботов
        total_bots = db.query(func.count(Bot.id)).scalar()
        logger.info(f"Total bots count: {total_bots}")
        
        # Активных ботов
        active_bots = db.query(func.count(Bot.id)).filter(Bot.is_active == True).scalar()
        logger.info(f"Active bots count: {active_bots}")
        
        # Всего сценариев
        total_scenarios = db.query(func.count(Scenario.id)).scalar()
        logger.info(f"Total scenarios count: {total_scenarios}")
        
        # Всего пользователей ботов (уникальных пользователей во всех ботах)
        bot_user_states = db.query(BotUserState.telegram_user_id).distinct().all()
        total_bot_users = len(bot_user_states) if bot_user_states else 0
        logger.info(f"Total bot users count: {total_bot_users}")
        
        # Всего сообщений
        total_messages = db.query(func.count(Message.id)).scalar()
        if total_messages is None:
            total_messages = 0
        logger.info(f"Total messages count: {total_messages}")
        
        # Защита от None
        total_users = total_users if total_users is not None else 0
        total_projects = total_projects if total_projects is not None else 0
        total_bots = total_bots if total_bots is not None else 0
        active_bots = active_bots if active_bots is not None else 0
        total_scenarios = total_scenarios if total_scenarios is not None else 0
        
        logger.info(f"Final stats: users={total_users}, projects={total_projects}, bots={total_bots}, active={active_bots}, scenarios={total_scenarios}, bot_users={total_bot_users}, messages={total_messages}")
        
        return PlatformStatsResponse(
            total_users=total_users,
            total_projects=total_projects,
            total_bots=total_bots,
            active_bots=active_bots,
            total_scenarios=total_scenarios,
            total_bot_users=total_bot_users,
            total_messages=total_messages,
        )
    except Exception as e:
        logger.error(f"Error getting platform stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении статистики: {str(e)}")


@router.get("/test")
async def test_endpoint():
    """Тестовый эндпоинт для проверки"""
    return {"status": "ok", "message": "Platform admin router is working"}


@router.post("/roles", response_model=PlatformRoleOut)
async def assign_platform_role(
    role_data: PlatformRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Назначить BF-роль пользователю
    Только для owner
    
    user_id может быть как внутренним ID, так и публичным ID (8-значный)
    """
    # Ищем пользователя сначала по public_id, потом по обычному id
    user = db.query(User).filter(User.public_id == role_data.user_id).first()
    if not user:
        user = db.query(User).filter(User.id == role_data.user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail=f"Пользователь с ID {role_data.user_id} не найден")
    
    # Проверяем валидность роли
    if role_data.role_name not in BF_ROLES:
        raise HTTPException(
            status_code=400, 
            detail=f"Неверная роль. Доступные: {', '.join(BF_ROLES)}"
        )
    
    # Проверяем, нет ли уже активной такой роли
    existing_role = db.query(PlatformRole).filter(
        PlatformRole.user_id == user.id,
        PlatformRole.role_name == role_data.role_name,
        PlatformRole.is_active == True
    ).first()
    
    if existing_role and existing_role.is_valid():
        raise HTTPException(
            status_code=400,
            detail="У пользователя уже есть активная такая роль"
        )
    
    # Создаем новую роль
    expires_at_dt = None
    if role_data.expires_at:
        try:
            expires_at_dt = datetime.fromisoformat(role_data.expires_at.replace('Z', '+00:00'))
        except:
            pass
    
    new_role = PlatformRole(
        user_id=user.id,  # Используем внутренний ID найденного пользователя
        role_name=role_data.role_name,
        granted_by=current_user.id,
        expires_at=expires_at_dt,
        notes=role_data.notes
    )
    
    db.add(new_role)
    
    # Проверяем, есть ли уже запись участника команды
    # Если нет - создаем запись при назначении первой роли
    team_member = db.query(BFTeamMember).filter(
        BFTeamMember.user_id == user.id
    ).first()
    
    if not team_member:
        # Добавляем пользователя в команду при назначении первой роли
        team_member = BFTeamMember(
            user_id=user.id,
            added_by=current_user.id,
            is_active=True
        )
        db.add(team_member)
    
    db.commit()
    db.refresh(new_role)
    
    return PlatformRoleOut.from_orm(new_role)


@router.patch("/roles/{role_id}", response_model=PlatformRoleOut)
async def update_platform_role(
    role_id: int,
    role_update: PlatformRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Обновить BF-роль (деактивировать, изменить срок и т.д.)
    Только для owner
    """
    role = db.query(PlatformRole).filter(PlatformRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Обновляем поля
    if role_update.is_active is not None:
        role.is_active = role_update.is_active
    if role_update.expires_at is not None:
        role.expires_at = role_update.expires_at
    if role_update.notes is not None:
        role.notes = role_update.notes
    
    db.commit()
    db.refresh(role)
    
    return PlatformRoleOut.from_orm(role)


@router.delete("/roles/{role_id}")
async def delete_platform_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Удалить BF-роль
    Только для owner
    """
    role = db.query(PlatformRole).filter(PlatformRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    db.delete(role)
    db.commit()
    
    return {"detail": "Роль удалена"}


@router.get("/roles/available", response_model=List[str])
async def get_available_roles(
    current_user: User = Depends(require_owner)
):
    """
    Получить список доступных BF-ролей
    Только для owner
    """
    return BF_ROLES


@router.delete("/users/{user_id}/team-member")
async def remove_team_member(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Удалить участника из BF команды (удаляет все его BF-роли)
    Только для owner
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Защита от удаления самого себя
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Вы не можете удалить себя из команды"
        )
    
    # Удаляем все BF-роли пользователя
    roles_to_delete = db.query(PlatformRole).filter(
        PlatformRole.user_id == user_id
    ).all()
    
    roles_count = len(roles_to_delete)
    
    for role in roles_to_delete:
        db.delete(role)
    
    # Удаляем запись участника команды
    team_member = db.query(BFTeamMember).filter(
        BFTeamMember.user_id == user_id
    ).first()
    
    if team_member:
        db.delete(team_member)
    
    # Понижаем базовую роль до "user", чтобы ограничить доступ к платформе
    # Это предотвращает использование платформы бесплатно после удаления из команды
    if user.role != "user":
        user.role = "user"
    
    db.commit()
    
    return {
        "detail": "Участник удален из команды",
        "user_id": user_id,
        "roles_removed": roles_count,
        "base_role_changed": True
    }


@router.post("/base-roles", response_model=BaseRoleOut)
async def assign_base_role(
    role_data: BaseRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Назначить базовую роль пользователю с возможностью указать срок действия
    Только для owner
    """
    if role_data.role_name not in ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Неверная роль. Доступные: {', '.join(ROLES)}"
        )
    
    user = db.query(User).filter(User.id == role_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Защита от случайного понижения собственной роли
    if user.id == current_user.id and role_data.role_name != "owner":
        raise HTTPException(
            status_code=400,
            detail="Вы не можете понизить собственную роль владельца"
        )
    
    # Деактивируем все предыдущие активные базовые роли
    existing_roles = db.query(BaseRole).filter(
        BaseRole.user_id == user.id,
        BaseRole.is_active == True
    ).all()
    
    for existing_role in existing_roles:
        existing_role.is_active = False
    
    # Создаем новую базовую роль
    expires_at_dt = None
    if role_data.expires_at:
        try:
            expires_at_dt = datetime.fromisoformat(role_data.expires_at.replace('Z', '+00:00'))
        except:
            pass
    
    new_role = BaseRole(
        user_id=user.id,
        role_name=role_data.role_name,
        granted_by=current_user.id,
        expires_at=expires_at_dt,
        notes=role_data.notes,
        is_active=True
    )
    
    db.add(new_role)
    
    # Обновляем текущую роль пользователя
    user.role = role_data.role_name
    
    db.commit()
    db.refresh(new_role)
    
    return BaseRoleOut.from_orm(new_role)


@router.patch("/base-roles/{role_id}", response_model=BaseRoleOut)
async def update_base_role(
    role_id: int,
    role_update: BaseRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Обновить базовую роль (деактивировать, изменить срок и т.д.)
    Только для owner
    """
    role = db.query(BaseRole).filter(BaseRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Обновляем поля
    if role_update.is_active is not None:
        role.is_active = role_update.is_active
        # Если деактивируем роль, нужно обновить текущую роль пользователя
        if not role_update.is_active:
            user = db.query(User).filter(User.id == role.user_id).first()
            if user and user.role == role.role_name:
                # Ищем другую активную базовую роль или ставим "user"
                other_active = db.query(BaseRole).filter(
                    BaseRole.user_id == user.id,
                    BaseRole.is_active == True,
                    BaseRole.id != role_id
                ).first()
                user.role = other_active.role_name if other_active and other_active.is_valid() else "user"
    
    if role_update.expires_at is not None:
        role.expires_at = role_update.expires_at
    if role_update.notes is not None:
        role.notes = role_update.notes
    
    db.commit()
    db.refresh(role)
    
    return BaseRoleOut.from_orm(role)


@router.delete("/base-roles/{role_id}")
async def delete_base_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Удалить базовую роль
    Только для owner
    """
    role = db.query(BaseRole).filter(BaseRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    user = db.query(User).filter(User.id == role.user_id).first()
    
    # Если удаляемая роль была текущей, обновляем роль пользователя
    if user and user.role == role.role_name:
        other_active = db.query(BaseRole).filter(
            BaseRole.user_id == user.id,
            BaseRole.is_active == True,
            BaseRole.id != role_id
        ).first()
        user.role = other_active.role_name if other_active and other_active.is_valid() else "user"
    
    db.delete(role)
    db.commit()
    
    return {"detail": "Базовая роль удалена"}


@router.patch("/users/{user_id}/base-role")
async def update_user_base_role(
    user_id: int,
    role: str,
    expires_in_days: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Изменить базовую роль пользователя (owner, admin, developer и т.д.)
    Только для owner
    Устаревший endpoint, используйте POST /base-roles для назначения с сроком действия
    """
    if role not in ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Неверная роль. Доступные: {', '.join(ROLES)}"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Защита от случайного понижения собственной роли
    if user.id == current_user.id and role != "owner":
        raise HTTPException(
            status_code=400,
            detail="Вы не можете понизить собственную роль владельца"
        )
    
    # Деактивируем все предыдущие активные базовые роли
    existing_roles = db.query(BaseRole).filter(
        BaseRole.user_id == user.id,
        BaseRole.is_active == True
    ).all()
    
    for existing_role in existing_roles:
        existing_role.is_active = False
    
    # Создаем новую базовую роль
    expires_at_dt = None
    if expires_in_days:
        expires_at_dt = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=expires_in_days)
    
    new_role = BaseRole(
        user_id=user.id,
        role_name=role,
        granted_by=current_user.id,
        expires_at=expires_at_dt,
        is_active=True
    )
    
    db.add(new_role)
    user.role = role
    db.commit()
    
    return {"detail": "Роль обновлена", "user_id": user_id, "new_role": role}


# === Suspension Management ===

class SuspendUserRequest(BaseModel):
    suspension_type: str  # warning, temporary, permanent
    reason: str
    duration_days: Optional[int] = None  # Для временной блокировки


class SuspendBotRequest(BaseModel):
    suspension_type: str  # warning, temporary, permanent
    reason: str
    duration_days: Optional[int] = None


class SuspensionInfo(BaseModel):
    is_suspended: bool
    suspension_type: Optional[str]
    suspension_reason: Optional[str]
    suspended_at: Optional[datetime]
    suspended_until: Optional[datetime]
    suspended_by_id: Optional[int]
    suspended_by_email: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: int,
    request: SuspendUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Заблокировать/приостановить пользователя
    Типы: warning (предупреждение), temporary (временная), permanent (постоянная)
    """
    if request.suspension_type not in ["warning", "temporary", "permanent"]:
        raise HTTPException(status_code=400, detail="Неверный тип блокировки")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Нельзя заблокировать владельца
    if user.role == "owner":
        raise HTTPException(status_code=403, detail="Невозможно заблокировать владельца платформы")
    
    # Вычисляем дату окончания для временной блокировки
    suspended_until = None
    if request.suspension_type == "temporary":
        if not request.duration_days:
            raise HTTPException(status_code=400, detail="Для временной блокировки укажите duration_days")
        suspended_until = datetime.now(timezone.utc) + timedelta(days=request.duration_days)
    
    user.is_suspended = True
    user.suspension_type = request.suspension_type
    user.suspension_reason = request.reason
    user.suspended_at = datetime.now(timezone.utc)
    user.suspended_until = suspended_until
    user.suspended_by_id = current_user.id
    
    db.commit()
    
    return {
        "detail": "Пользователь заблокирован",
        "user_id": user_id,
        "suspension_type": request.suspension_type,
        "suspended_until": suspended_until.isoformat() if suspended_until else None
    }


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Снять блокировку с пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user.is_suspended = False
    user.suspension_type = None
    user.suspension_reason = None
    user.suspended_at = None
    user.suspended_until = None
    user.suspended_by_id = None
    
    db.commit()
    
    return {"detail": "Блокировка снята", "user_id": user_id}


@router.get("/users/{user_id}/suspension", response_model=SuspensionInfo)
async def get_user_suspension(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Получить информацию о блокировке пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    suspended_by_email = None
    if user.suspended_by_id:
        admin = db.query(User).filter(User.id == user.suspended_by_id).first()
        if admin:
            suspended_by_email = admin.email
    
    return SuspensionInfo(
        is_suspended=user.is_suspended or False,
        suspension_type=user.suspension_type,
        suspension_reason=user.suspension_reason,
        suspended_at=user.suspended_at,
        suspended_until=user.suspended_until,
        suspended_by_id=user.suspended_by_id,
        suspended_by_email=suspended_by_email
    )


@router.post("/bots/{bot_id}/suspend")
async def suspend_bot(
    bot_id: int,
    request: SuspendBotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Заблокировать/приостановить бота
    Типы: warning (предупреждение), temporary (временная), permanent (постоянная)
    """
    from backend.models.bot import Bot
    
    if request.suspension_type not in ["warning", "temporary", "permanent"]:
        raise HTTPException(status_code=400, detail="Неверный тип блокировки")
    
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    
    # Вычисляем дату окончания для временной блокировки
    suspended_until = None
    if request.suspension_type == "temporary":
        if not request.duration_days:
            raise HTTPException(status_code=400, detail="Для временной блокировки укажите duration_days")
        suspended_until = datetime.now(timezone.utc) + timedelta(days=request.duration_days)
    
    bot.is_suspended = True
    bot.suspension_type = request.suspension_type
    bot.suspension_reason = request.reason
    bot.suspended_at = datetime.now(timezone.utc)
    bot.suspended_until = suspended_until
    bot.suspended_by_id = current_user.id
    
    # При блокировке также деактивируем бота
    if request.suspension_type in ["temporary", "permanent"]:
        bot.is_active = False
    
    db.commit()
    
    return {
        "detail": "Бот заблокирован",
        "bot_id": bot_id,
        "suspension_type": request.suspension_type,
        "suspended_until": suspended_until.isoformat() if suspended_until else None
    }


@router.post("/bots/{bot_id}/unsuspend")
async def unsuspend_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Снять блокировку с бота"""
    from backend.models.bot import Bot
    
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    
    bot.is_suspended = False
    bot.suspension_type = None
    bot.suspension_reason = None
    bot.suspended_at = None
    bot.suspended_until = None
    bot.suspended_by_id = None
    # Не меняем is_active автоматически - пусть владелец сам решит
    
    db.commit()
    
    return {"detail": "Блокировка снята", "bot_id": bot_id}


@router.get("/bots/{bot_id}/suspension", response_model=SuspensionInfo)
async def get_bot_suspension(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Получить информацию о блокировке бота"""
    from backend.models.bot import Bot
    
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    
    suspended_by_email = None
    if bot.suspended_by_id:
        admin = db.query(User).filter(User.id == bot.suspended_by_id).first()
        if admin:
            suspended_by_email = admin.email
    
    return SuspensionInfo(
        is_suspended=bot.is_suspended or False,
        suspension_type=bot.suspension_type,
        suspension_reason=bot.suspension_reason,
        suspended_at=bot.suspended_at,
        suspended_until=bot.suspended_until,
        suspended_by_id=bot.suspended_by_id,
        suspended_by_email=suspended_by_email
    )


@router.post("/users/{user_id}/suspend-all-bots")
async def suspend_all_user_bots(
    user_id: int,
    request: SuspendBotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Заблокировать все боты пользователя"""
    from backend.models.bot import Bot
    
    if request.suspension_type not in ["warning", "temporary", "permanent"]:
        raise HTTPException(status_code=400, detail="Неверный тип блокировки")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    bots = db.query(Bot).filter(Bot.owner_id == user_id).all()
    
    suspended_until = None
    if request.suspension_type == "temporary":
        if not request.duration_days:
            raise HTTPException(status_code=400, detail="Для временной блокировки укажите duration_days")
        suspended_until = datetime.now(timezone.utc) + timedelta(days=request.duration_days)
    
    count = 0
    for bot in bots:
        bot.is_suspended = True
        bot.suspension_type = request.suspension_type
        bot.suspension_reason = request.reason
        bot.suspended_at = datetime.now(timezone.utc)
        bot.suspended_until = suspended_until
        bot.suspended_by_id = current_user.id
        if request.suspension_type in ["temporary", "permanent"]:
            bot.is_active = False
        count += 1
    
    db.commit()
    
    return {
        "detail": f"Заблокировано ботов: {count}",
        "user_id": user_id,
        "bots_suspended": count,
        "suspension_type": request.suspension_type
    }


@router.post("/users/{user_id}/unsuspend-all-bots")
async def unsuspend_all_user_bots(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """Снять блокировку со всех ботов пользователя"""
    from backend.models.bot import Bot
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    bots = db.query(Bot).filter(Bot.owner_id == user_id, Bot.is_suspended == True).all()
    
    count = 0
    for bot in bots:
        bot.is_suspended = False
        bot.suspension_type = None
        bot.suspension_reason = None
        bot.suspended_at = None
        bot.suspended_until = None
        bot.suspended_by_id = None
        count += 1
    
    db.commit()
    
    return {"detail": f"Разблокировано ботов: {count}", "user_id": user_id, "bots_unsuspended": count}

