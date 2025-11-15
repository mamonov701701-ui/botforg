"""
Утилиты для проверки доступа к ботам
Используется стандартная SaaS модель: владелец + участники команды имеют доступ
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from backend.models.bot import Bot
from backend.models.team import TeamMember


def check_bot_access(bot_id: int, user_id: int, db: Session) -> Bot:
    """
    Проверяет доступ пользователя к боту.
    Доступ имеют: владелец бота и участники команды владельца.
    
    Args:
        bot_id: ID бота
        user_id: ID пользователя
        db: Сессия базы данных
        
    Returns:
        Bot: Объект бота если доступ есть
        
    Raises:
        HTTPException: Если бот не найден или нет доступа
    """
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found"
        )
    
    # Владелец бота - всегда имеет доступ
    if bot.owner_id == user_id:
        return bot
    
    # Проверяем, является ли пользователь участником команды владельца
    team_member = db.query(TeamMember).filter(
        TeamMember.owner_id == bot.owner_id,
        TeamMember.user_id == user_id
    ).first()
    
    if not team_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a member of bot owner's team"
        )
    
    return bot


def check_bot_edit_permission(bot: Bot, user_id: int, db: Session) -> bool:
    """
    Проверяет право на редактирование бота.
    Владелец может все, участники команды - в зависимости от роли.
    
    Args:
        bot: Объект бота
        user_id: ID пользователя
        db: Сессия базы данных
        
    Returns:
        bool: True если есть право на редактирование
    """
    # Владелец может все
    if bot.owner_id == user_id:
        return True
    
    # Проверяем роль в команде
    team_member = db.query(TeamMember).filter(
        TeamMember.owner_id == bot.owner_id,
        TeamMember.user_id == user_id
    ).first()
    
    if not team_member:
        return False
    
    # Только developer и выше могут редактировать
    return team_member.role in ['developer', 'admin']


def check_bot_delete_permission(bot: Bot, user_id: int) -> bool:
    """
    Проверяет право на удаление бота.
    Только владелец может удалять бота.
    
    Args:
        bot: Объект бота
        user_id: ID пользователя
        
    Returns:
        bool: True если есть право на удаление
    """
    return bot.owner_id == user_id


def get_accessible_bot_owner_ids(user_id: int, db: Session) -> list[int]:
    """
    Получает список ID владельцев ботов, к которым пользователь имеет доступ.
    Включает: свои боты + боты команд, где пользователь участник.
    
    Args:
        user_id: ID пользователя
        db: Сессия базы данных
        
    Returns:
        list[int]: Список ID владельцев
    """
    # Получаем ID владельцев команд, где пользователь участник
    team_owner_ids = db.query(TeamMember.owner_id).filter(
        TeamMember.user_id == user_id
    ).distinct().all()
    
    # Формируем список ID владельцев (включая себя)
    owner_ids = [to[0] for to in team_owner_ids]
    owner_ids.append(user_id)
    
    return owner_ids

