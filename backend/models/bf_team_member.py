"""
Модель для отслеживания участников BF команды
Отдельно от ролей, чтобы участники оставались в списке даже после удаления всех ролей
"""
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from backend.database import Base


class BFTeamMember(Base):
    """
    Участники BF команды платформы
    Запись создается при добавлении первой BF-роли
    Запись удаляется только при явном удалении участника через кнопку "Удалить участника"
    """
    __tablename__ = "bf_team_members"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # Кто добавил в команду
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)  # Можно деактивировать без удаления
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="bf_team_membership")
    adder = relationship("User", foreign_keys=[added_by])

