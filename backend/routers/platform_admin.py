"""
API для управления платформой (только для владельца)
Управление пользователями и назначение BF-ролей
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models.user import User
from backend.models.platform_role import PlatformRole, BF_ROLES
from backend.models.bf_team_member import BFTeamMember
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


class UserListItem(BaseModel):
    id: int
    public_id: int
    email: str
    name: Optional[str]
    role: str
    created_at: datetime
    platform_roles: List[PlatformRoleListItem] = []
    
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

@router.get("/users", response_model=List[UserListItem])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    team_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Получить список всех пользователей платформы
    Только для owner
    
    Args:
        team_only: если True, показывать только участников BF команды (с активными ролями)
    """
    query = db.query(User)
    
    # Фильтр только участников команды
    # Используем таблицу bf_team_members для отслеживания участников
    # Участники остаются в списке даже после удаления всех ролей
    if team_only:
        # Получаем ID активных участников команды из таблицы bf_team_members
        team_members = db.query(BFTeamMember).filter(
            BFTeamMember.is_active == True
        ).all()
        team_user_ids = [tm.user_id for tm in team_members]
        
        if team_user_ids:
            query = query.filter(User.id.in_(team_user_ids))
        else:
            # Если нет участников команды, возвращаем пустой список
            return []
    
    # Поиск по email или имени
    if search:
        query = query.filter(
            (User.email.contains(search)) | (User.name.contains(search))
        )
    
    users = query.offset(skip).limit(limit).all()
    
    # Добавляем информацию о BF-ролях
    result = []
    for user in users:
        platform_roles = db.query(PlatformRole).filter(
            PlatformRole.user_id == user.id,
            PlatformRole.is_active == True
        ).all()
        
        # Формируем объекты ролей с ID для возможности удаления
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
        
        user_dict = {
            "id": user.id,
            "public_id": user.public_id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at,
            "platform_roles": role_items
        }
        result.append(UserListItem(**user_dict))
    
    return result


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
    from datetime import datetime
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


@router.patch("/users/{user_id}/base-role")
async def update_user_base_role(
    user_id: int,
    role: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    """
    Изменить базовую роль пользователя (owner, admin, developer и т.д.)
    Только для owner
    """
    from backend.models.user import ROLES
    
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
    
    user.role = role
    db.commit()
    
    return {"detail": "Роль обновлена", "user_id": user_id, "new_role": role}

