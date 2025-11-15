from typing import List, Optional
from datetime import datetime

from backend.database import SessionLocal, get_db as get_db_dep
from backend.dependencies.auth import get_current_user
from backend.dependencies.roles import require_role
from backend.models.team import TeamMember
from backend.models.user import User
from backend.models.base_role import BaseRole
from backend.schemas.team import TeamMemberCreate, TeamMemberOut
# Импортируем BaseRoleListItem из platform_admin
from backend.routers.platform_admin import BaseRoleListItem
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class TeamMemberWithUser(BaseModel):
    id: int
    user_id: int
    owner_id: int
    role: str
    created_at: datetime
    # Информация о пользователе
    public_id: int
    email: str
    name: Optional[str]
    # Базовые роли с историей
    base_roles: List[BaseRoleListItem] = []
    
    class Config:
        from_attributes = True


@router.post("/add-member", response_model=TeamMemberOut)
def add_team_member(
    member: TeamMemberCreate,
    expires_in_days: Optional[int] = None,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(require_role(["owner"])),
):
    """
    Добавить участника в команду проекта
    Можно указать срок действия роли
    """
    # Проверка, что участник не добавлен дважды
    exists = (
        db.query(TeamMember)
        .filter(
            TeamMember.owner_id == current_user.id, TeamMember.user_id == member.user_id
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="User already in team")
    
    # Проверяем, что пользователь существует
    user = db.query(User).filter(User.id == member.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    team_member = TeamMember(
        owner_id=current_user.id, user_id=member.user_id, role=member.role
    )
    db.add(team_member)
    
    # Создаем базовую роль с историей и сроком действия
    from datetime import timezone, timedelta
    expires_at_dt = None
    if expires_in_days:
        expires_at_dt = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=expires_in_days)
    
    # Деактивируем все предыдущие активные базовые роли для этого пользователя
    existing_roles = db.query(BaseRole).filter(
        BaseRole.user_id == user.id,
        BaseRole.is_active == True
    ).all()
    
    for existing_role in existing_roles:
        existing_role.is_active = False
    
    # Создаем новую базовую роль
    base_role = BaseRole(
        user_id=user.id,
        role_name=member.role,
        granted_by=current_user.id,
        expires_at=expires_at_dt,
        is_active=True,
        notes=f"Добавлен в команду проекта владельцем {current_user.email}"
    )
    
    db.add(base_role)
    
    # Обновляем текущую роль пользователя
    user.role = member.role
    
    db.commit()
    db.refresh(team_member)
    return team_member


@router.put("/{member_id}", response_model=TeamMemberOut)
def update_team_member_role(
    member_id: int,
    update: TeamMemberCreate,
    expires_in_days: Optional[int] = None,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(require_role(["owner"])),
):
    """
    Обновить роль участника команды проекта
    Можно указать срок действия роли
    """
    member = (
        db.query(TeamMember)
        .filter(TeamMember.id == member_id, TeamMember.owner_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    user = db.query(User).filter(User.id == member.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    member.role = update.role
    
    # Создаем новую базовую роль с историей
    from datetime import timezone, timedelta
    expires_at_dt = None
    if expires_in_days:
        expires_at_dt = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=expires_in_days)
    
    # Деактивируем все предыдущие активные базовые роли
    existing_roles = db.query(BaseRole).filter(
        BaseRole.user_id == user.id,
        BaseRole.is_active == True
    ).all()
    
    for existing_role in existing_roles:
        existing_role.is_active = False
    
    # Создаем новую базовую роль
    base_role = BaseRole(
        user_id=user.id,
        role_name=update.role,
        granted_by=current_user.id,
        expires_at=expires_at_dt,
        is_active=True,
        notes=f"Роль изменена в команде проекта владельцем {current_user.email}"
    )
    
    db.add(base_role)
    
    # Обновляем текущую роль пользователя
    user.role = update.role
    
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{member_id}", response_model=dict)
def delete_team_member(
    member_id: int,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(require_role(["owner"])),
):
    """
    Удалить участника из команды проекта
    При удалении базовая роль пользователя меняется на "user"
    """
    member = (
        db.query(TeamMember)
        .filter(TeamMember.id == member_id, TeamMember.owner_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    user = db.query(User).filter(User.id == member.user_id).first()
    if user:
        # Деактивируем все активные базовые роли
        existing_roles = db.query(BaseRole).filter(
            BaseRole.user_id == user.id,
            BaseRole.is_active == True
        ).all()
        
        for existing_role in existing_roles:
            existing_role.is_active = False
        
        # Создаем новую базовую роль "user"
        base_role_user = BaseRole(
            user_id=user.id,
            role_name="user",
            granted_by=current_user.id,
            expires_at=None,
            is_active=True,
            notes=f"Удален из команды проекта владельцем {current_user.email}"
        )
        db.add(base_role_user)
        
        # Понижаем базовую роль до "user"
        if user.role != "user":
            user.role = "user"
    
    db.delete(member)
    db.commit()
    return {"detail": "Team member removed"}


@router.get("/my-team", response_model=List[TeamMemberWithUser])
def get_my_team(
    search: Optional[str] = None,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(require_role(["owner"]))
):
    """
    Получить список участников команды проекта с полной информацией
    """
    query = db.query(TeamMember).filter(TeamMember.owner_id == current_user.id)
    
    # Поиск по email или имени пользователя
    if search:
        # Подзапрос для поиска по пользователям
        user_ids = db.query(User.id).filter(
            (User.email.contains(search)) | (User.name.contains(search))
        ).subquery()
        query = query.filter(TeamMember.user_id.in_(user_ids))
    
    team_members = query.all()
    
    result = []
    for member in team_members:
        user = db.query(User).filter(User.id == member.user_id).first()
        if not user:
            continue
        
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
        
        result.append(TeamMemberWithUser(
            id=member.id,
            user_id=member.user_id,
            owner_id=member.owner_id,
            role=member.role,
            created_at=member.created_at,
            public_id=user.public_id,
            email=user.email,
            name=user.name,
            base_roles=base_role_items
        ))
    
    return result


@router.get("/team-me", response_model=List[TeamMemberOut])
def get_team_me(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return db.query(TeamMember).filter(TeamMember.user_id == current_user.id).all()
