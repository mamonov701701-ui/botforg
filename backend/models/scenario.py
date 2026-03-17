from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base

SCENARIO_STATUS_DRAFT = "draft"
SCENARIO_STATUS_PUBLISHED = "published"


class Scenario(Base):
    """
    Сценарий - отдельная часть бота для конкретной задачи
    Может быть частью бота (bot_id) или в библиотеке (library=True)
    """
    __tablename__ = "scenarios"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    
    # Владелец сценария
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # К какому боту принадлежит (NULL если в библиотеке)
    bot_id = Column(Integer, ForeignKey("bots.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Основные данные
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)  # Название иконки из lucide-react
    category = Column(String(50), nullable=True)  # payment, support, catalog, faq, etc.
    
    # Флаги
    is_main = Column(Boolean, default=False)  # Главный сценарий бота
    is_library = Column(Boolean, default=False)  # В библиотеке для переиспользования
    is_standard = Column(Boolean, default=False)  # Стандартный шаблон от платформы
    is_public = Column(Boolean, default=False)  # Для маркетплейса (будущее)
    
    # Данные сценария (nodes и edges в JSON)
    content = Column(JSON, nullable=True)  # Черновик (draft)
    published_content = Column(JSON, nullable=True)  # Опубликованная версия (используется ботом)
    status = Column(String(20), default=SCENARIO_STATUS_DRAFT, nullable=False)  # draft | published
    
    # Метаданные
    order = Column(Integer, default=0)  # Порядок в списке
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    # Связи (без back_populates для избежания конфликтов)
    # user и bot доступны через foreign keys


VERSION_TYPE_DRAFT = "draft"
VERSION_TYPE_PUBLISHED = "published"


class ScenarioVersion(Base):
    """
    История версий сценария.
    - draft: версии черновика (при каждом сохранении)
    - published: версии публикаций (при каждом publish)
    Только одна версия каждого типа на сценарий имеет is_active=True.
    """
    __tablename__ = "scenario_versions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)  # Порядковый номер версии (1, 2, 3...)
    version_type = Column(String(20), default=VERSION_TYPE_DRAFT, nullable=False)  # draft | published
    content = Column(JSON, nullable=True)  # Снимок nodes/edges
    is_active = Column(Boolean, default=False, nullable=False)  # Текущая активная версия
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    scenario = relationship("Scenario")

