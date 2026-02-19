"""
Marketplace models for templates, scenarios, orders, and freelancers
"""
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, 
    ForeignKey, Numeric, JSON, Enum as SQLEnum, Index
)
from sqlalchemy.orm import relationship

from backend.database import Base


class MarketItemType(str, Enum):
    """Тип товара на маркетплейсе"""
    TEMPLATE = "template"  # Шаблон (готовый бот)
    SCENARIO = "scenario"  # Сценарий


class MarketOrderStatus(str, Enum):
    """Статус заказа"""
    OPEN = "open"  # Открыт, принимаются предложения
    IN_PROGRESS = "in_progress"  # Выбран исполнитель, работа ведется
    COMPLETED = "completed"  # Завершен
    CANCELLED = "cancelled"  # Отменен


class ModerationStatus(str, Enum):
    """Статус модерации шаблона"""
    DRAFT = "draft"  # Черновик
    PENDING = "pending"  # На модерации
    APPROVED = "approved"  # Одобрен
    REJECTED = "rejected"  # Отклонён


class MarketItem(Base):
    """
    Товар на маркетплейсе (шаблон или сценарий)
    """
    __tablename__ = "market_items"
    __table_args__ = (
        Index('ix_market_items_type_seller', 'item_type', 'seller_id'),
        Index('ix_market_items_category', 'category'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с исходным элементом
    item_type = Column(SQLEnum(MarketItemType), nullable=False, index=True)
    source_bot_id = Column(Integer, ForeignKey("bots.id", ondelete="SET NULL"), nullable=True)  # Если шаблон
    source_scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True)  # Если сценарий
    
    # Информация о товаре
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)  # Основное описание
    additional_description = Column(Text, nullable=True)  # Дополнительное описание для маркетплейса
    image_url = Column(String(500), nullable=True)  # URL изображения/превью
    
    # Цена и продажи
    price = Column(Numeric(10, 2), nullable=False, default=0.00)  # 0 = бесплатно
    sales_count = Column(Integer, default=0)  # Количество продаж
    
    # Метаданные
    category = Column(String(100), nullable=True, index=True)
    tags = Column(JSON, nullable=True)  # Список тегов ["магазин", "оплата"]
    is_premium = Column(Boolean, default=False)  # Premium товар (featured)
    is_active = Column(Boolean, default=True)  # Активен ли товар
    is_published = Column(Boolean, default=False)  # Опубликован ли товар
    
    # Продавец
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Модерация (для шаблонов)
    moderation_status = Column(
        SQLEnum(ModerationStatus),
        default=ModerationStatus.DRAFT,
        nullable=False,
        index=True,
    )
    moderation_rejection_reason = Column(Text, nullable=True)  # Причина отказа

    # Временные метки
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                       onupdate=lambda: datetime.now(timezone.utc))
    published_at = Column(DateTime, nullable=True)  # Когда опубликован
    
    # Relationships
    seller = relationship("User", backref="market_items")
    source_bot = relationship("Bot", foreign_keys=[source_bot_id])
    source_scenario = relationship("Scenario", foreign_keys=[source_scenario_id])
    # Reviews relationship is handled conditionally in queries (polymorphic - no direct FK)


class MarketOrder(Base):
    """
    Заказ от заказчика на разработку бота/сценария
    """
    __tablename__ = "market_orders"
    __table_args__ = (
        Index('ix_market_orders_status_category', 'status', 'category'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Основная информация
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)  # Требования к заказу
    
    # Бюджет
    budget_min = Column(Numeric(10, 2), nullable=True)  # Минимальный бюджет
    budget_max = Column(Numeric(10, 2), nullable=True)  # Максимальный бюджет
    
    # Сроки
    deadline = Column(DateTime, nullable=True)  # Желаемый срок выполнения
    
    # Метаданные
    category = Column(String(100), nullable=True, index=True)
    skills = Column(JSON, nullable=True)  # Требуемые навыки ["python", "telegram"]
    
    # Статус и исполнитель
    status = Column(SQLEnum(MarketOrderStatus), default=MarketOrderStatus.OPEN, nullable=False, index=True)
    selected_freelancer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Автор заказа
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Временные метки
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    author = relationship("User", foreign_keys=[author_id], backref="market_orders")
    selected_freelancer = relationship("User", foreign_keys=[selected_freelancer_id])
    proposals = relationship("OrderProposal", back_populates="order", cascade="all, delete-orphan")


class OrderProposal(Base):
    """
    Предложение от исполнителя на заказ
    """
    __tablename__ = "order_proposals"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с заказом
    order_id = Column(Integer, ForeignKey("market_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Исполнитель
    freelancer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Предложение
    message = Column(Text, nullable=True)  # Сообщение от исполнителя
    proposed_price = Column(Numeric(10, 2), nullable=True)  # Предлагаемая цена
    estimated_days = Column(Integer, nullable=True)  # Оценочное количество дней
    
    # Статус
    is_accepted = Column(Boolean, default=False)  # Принято ли предложение
    is_declined = Column(Boolean, default=False)  # Отклонено ли предложение
    
    # Временные метки
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    order = relationship("MarketOrder", back_populates="proposals")
    freelancer = relationship("User", foreign_keys=[freelancer_id], backref="order_proposals")


class FreelancerProfile(Base):
    """
    Профиль исполнителя на маркетплейсе
    """
    __tablename__ = "freelancer_profiles"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с пользователем (один к одному)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    
    # Информация о специализации
    title = Column(String(255), nullable=False)  # Например: "Разработчик Telegram ботов"
    description = Column(Text, nullable=True)  # Описание услуг
    
    # Цены
    hourly_rate = Column(Numeric(10, 2), nullable=True)  # Стоимость за час
    
    # Навыки и портфолио
    skills = Column(JSON, nullable=True)  # Список навыков ["python", "telegram", "fastapi"]
    portfolio_items = Column(JSON, nullable=True)  # Примеры работ (массив ссылок/описаний)
    
    # Статистика (вычисляется)
    completed_orders_count = Column(Integer, default=0)  # Количество завершенных заказов
    
    # Видимость
    is_active = Column(Boolean, default=True)  # Активен ли профиль
    is_verified = Column(Boolean, default=False)  # Верифицирован ли исполнитель
    
    # Временные метки
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User", backref="freelancer_profile")


class MarketReview(Base):
    """
    Отзыв на товар, заказ или исполнителя
    """
    __tablename__ = "market_reviews"
    __table_args__ = (
        Index('ix_market_reviews_item_type_id', 'item_type', 'item_id'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Тип объекта отзыва
    item_type = Column(String(50), nullable=False, index=True)  # "market_item", "market_order", "freelancer"
    item_id = Column(Integer, nullable=False, index=True)  # ID товара/заказа/исполнителя
    
    # Автор отзыва
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Отзыв
    rating = Column(Integer, nullable=False)  # Рейтинг от 1 до 5
    comment = Column(Text, nullable=True)  # Текст отзыва
    
    # Временные метки
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    author = relationship("User", backref="market_reviews")
    # Note: item relationship is polymorphic - only works for market_item type
    # Foreign key relationship is handled conditionally in queries based on item_type
