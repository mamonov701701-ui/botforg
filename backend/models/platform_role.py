"""
Модель для управления ролями платформы BotForg (BF-роли)
Отдельная от ролей команд ботов система прав доступа
"""
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from backend.database import Base

# BF-роли платформы (начинаются с BF)
BF_ROLES = [
    "BF Администратор",
    "BF Разработчик", 
    "BF Менеджер шаблонов",
    "BF Поддержка",
    "BF Аналитик",
    "BF Модератор"
]


class PlatformRole(Base):
    """
    Роли платформы, которые выдает владелец (owner)
    Могут быть временными с истечением срока действия
    """
    __tablename__ = "platform_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_name = Column(String, nullable=False)  # BF Администратор, BF Разработчик и т.д.
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # Кто выдал роль
    granted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)  # NULL = бессрочно
    is_active = Column(Boolean, default=True)  # Можно отключить роль
    notes = Column(String, nullable=True)  # Заметки о роли
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="platform_roles")
    grantor = relationship("User", foreign_keys=[granted_by])

    def is_expired(self) -> bool:
        """Проверка истек ли срок действия роли"""
        if not self.expires_at:
            return False
        return datetime.now(timezone.utc) > self.expires_at
    
    def is_valid(self) -> bool:
        """Проверка действительна ли роль (активна и не истекла)"""
        return self.is_active and not self.is_expired()

