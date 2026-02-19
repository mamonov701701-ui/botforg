"""
Pydantic schemas for Marketplace API
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field


# ================== MarketItem Schemas ==================

class MarketItemCreate(BaseModel):
    """Схема для создания товара на маркетплейсе"""
    item_type: str = Field(..., description="Тип: 'template' или 'scenario'")
    source_bot_id: Optional[int] = Field(None, description="ID бота-источника (для шаблонов)")
    source_scenario_id: Optional[int] = Field(None, description="ID сценария-источника")
    title: str = Field(..., max_length=255, description="Название товара")
    description: Optional[str] = Field(None, description="Основное описание")
    additional_description: Optional[str] = Field(None, description="Дополнительное описание")
    image_url: Optional[str] = Field(None, max_length=500, description="URL изображения")
    price: Decimal = Field(0.00, ge=0, description="Цена (0 = бесплатно)")
    category: Optional[str] = Field(None, max_length=100, description="Категория")
    tags: Optional[List[str]] = Field(None, description="Список тегов")
    is_premium: bool = Field(False, description="Premium товар")
    is_published: bool = Field(False, description="Опубликован ли товар")


class MarketItemUpdate(BaseModel):
    """Схема для обновления товара"""
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    additional_description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    price: Optional[Decimal] = Field(None, ge=0)
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[List[str]] = None
    is_premium: Optional[bool] = None
    is_active: Optional[bool] = None
    is_published: Optional[bool] = None


class SellerInfo(BaseModel):
    """Информация о продавце"""
    id: int
    name: Optional[str] = None
    email: str
    avatar: Optional[str] = None
    
    class Config:
        from_attributes = True


class MarketItemOut(BaseModel):
    """Схема для вывода товара"""
    id: int
    item_type: str
    source_bot_id: Optional[int] = None
    source_scenario_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    additional_description: Optional[str] = None
    image_url: Optional[str] = None
    price: Decimal
    sales_count: int
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_premium: bool
    is_active: bool
    is_published: bool
    seller: SellerInfo
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
    # Вычисляемые поля
    average_rating: Optional[float] = None
    rating_count: int = 0
    
    class Config:
        from_attributes = True


class MarketItemDetailOut(MarketItemOut):
    """Детальная информация о товаре"""
    reviews: List['MarketReviewOut'] = []


class MyTemplateOut(BaseModel):
    """Шаблон разработчика для кабинета (GET /my-templates)"""
    id: int
    name: str
    status: str  # published | draft (legacy, для совместимости)
    moderation_status: str  # draft | pending | approved | rejected
    moderation_rejection_reason: Optional[str] = None
    installs_count: int
    views_count: int
    created_at: datetime


# ================== MarketOrder Schemas ==================

class MarketOrderCreate(BaseModel):
    """Схема для создания заказа"""
    title: str = Field(..., max_length=255, description="Название заказа")
    description: str = Field(..., description="Описание требований")
    budget_min: Optional[Decimal] = Field(None, ge=0, description="Минимальный бюджет")
    budget_max: Optional[Decimal] = Field(None, ge=0, description="Максимальный бюджет")
    deadline: Optional[datetime] = Field(None, description="Срок выполнения")
    category: Optional[str] = Field(None, max_length=100, description="Категория")
    skills: Optional[List[str]] = Field(None, description="Требуемые навыки")


class MarketOrderUpdate(BaseModel):
    """Схема для обновления заказа"""
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    budget_min: Optional[Decimal] = Field(None, ge=0)
    budget_max: Optional[Decimal] = Field(None, ge=0)
    deadline: Optional[datetime] = None
    category: Optional[str] = Field(None, max_length=100)
    skills: Optional[List[str]] = None
    status: Optional[str] = None  # open, in_progress, completed, cancelled


class MarketOrderOut(BaseModel):
    """Схема для вывода заказа"""
    id: int
    title: str
    description: str
    budget_min: Optional[Decimal] = None
    budget_max: Optional[Decimal] = None
    deadline: Optional[datetime] = None
    category: Optional[str] = None
    skills: Optional[List[str]] = None
    status: str
    author: SellerInfo
    selected_freelancer: Optional[SellerInfo] = None
    created_at: datetime
    updated_at: datetime
    proposals_count: int = 0
    
    class Config:
        from_attributes = True


class MarketOrderDetailOut(MarketOrderOut):
    """Детальная информация о заказе"""
    proposals: List['OrderProposalOut'] = []


# ================== OrderProposal Schemas ==================

class OrderProposalCreate(BaseModel):
    """Схема для создания предложения на заказ"""
    message: Optional[str] = Field(None, description="Сообщение от исполнителя")
    proposed_price: Optional[Decimal] = Field(None, ge=0, description="Предлагаемая цена")
    estimated_days: Optional[int] = Field(None, ge=1, description="Оценочное количество дней")


class OrderProposalOut(BaseModel):
    """Схема для вывода предложения"""
    id: int
    order_id: int
    freelancer: SellerInfo
    message: Optional[str] = None
    proposed_price: Optional[Decimal] = None
    estimated_days: Optional[int] = None
    is_accepted: bool
    is_declined: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ================== FreelancerProfile Schemas ==================

class FreelancerProfileCreate(BaseModel):
    """Схема для создания профиля исполнителя"""
    title: str = Field(..., max_length=255, description="Название специализации")
    description: Optional[str] = Field(None, description="Описание услуг")
    hourly_rate: Optional[Decimal] = Field(None, ge=0, description="Стоимость за час")
    skills: Optional[List[str]] = Field(None, description="Список навыков")
    portfolio_items: Optional[List[str]] = Field(None, description="Примеры работ")


class FreelancerProfileUpdate(BaseModel):
    """Схема для обновления профиля исполнителя"""
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    skills: Optional[List[str]] = None
    portfolio_items: Optional[List[str]] = None
    is_active: Optional[bool] = None


class FreelancerProfileOut(BaseModel):
    """Схема для вывода профиля исполнителя"""
    id: int
    user: SellerInfo
    title: str
    description: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    skills: Optional[List[str]] = None
    portfolio_items: Optional[List[str]] = None
    completed_orders_count: int
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    # Вычисляемые поля
    average_rating: Optional[float] = None
    rating_count: int = 0
    
    class Config:
        from_attributes = True


# ================== MarketReview Schemas ==================

class MarketReviewCreate(BaseModel):
    """Схема для создания отзыва"""
    item_type: str = Field(..., description="Тип: 'market_item', 'market_order', 'freelancer'")
    item_id: int = Field(..., description="ID товара/заказа/исполнителя")
    rating: int = Field(..., ge=1, le=5, description="Рейтинг от 1 до 5")
    comment: Optional[str] = Field(None, description="Текст отзыва")


class MarketReviewOut(BaseModel):
    """Схема для вывода отзыва"""
    id: int
    item_type: str
    item_id: int
    author: SellerInfo
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ================== Response Schemas ==================

class MarketItemListResponse(BaseModel):
    """Ответ со списком товаров"""
    total: int
    items: List[MarketItemOut]
    page: int = 1
    page_size: int = 20


class MarketOrderListResponse(BaseModel):
    """Ответ со списком заказов"""
    total: int
    items: List[MarketOrderOut]
    page: int = 1
    page_size: int = 20


class FreelancerListResponse(BaseModel):
    """Ответ со списком исполнителей"""
    total: int
    items: List[FreelancerProfileOut]
    page: int = 1
    page_size: int = 20


# Обновляем forward references после определения всех классов
MarketItemDetailOut.model_rebuild()
MarketOrderDetailOut.model_rebuild()
