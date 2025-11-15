"""
Модель для управления базовыми ролями пользователей с историей и сроком действия
Аналогично PlatformRole, но для базовых ролей (owner, admin, developer и т.д.)
"""
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from backend.database import Base


class BaseRole(Base):
    """
    Базовые роли пользователей с историей и сроком действия
    Могут быть временными с истечением срока действия
    """
    __tablename__ = "base_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role_name = Column(String, nullable=False)  # owner, admin, developer и т.д.
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # Кто выдал роль
    granted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)  # NULL = бессрочно
    is_active = Column(Boolean, default=True)  # Можно отключить роль
    notes = Column(String, nullable=True)  # Заметки о роли
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="base_roles_history")
    grantor = relationship("User", foreign_keys=[granted_by])

    def is_expired(self) -> bool:
        """Проверка истек ли срок действия роли"""
        if not self.expires_at:
            return False
        
        # Приводим к timezone-aware для корректного сравнения
        now = datetime.now(timezone.utc)
        expires = self.expires_at
        
        # Если expires_at naive (без timezone), делаем его timezone-aware UTC
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        
        return now > expires
    
    def is_valid(self) -> bool:
        """Проверка действительна ли роль (активна и не истекла)"""
        return self.is_active and not self.is_expired()

