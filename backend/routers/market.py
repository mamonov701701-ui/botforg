"""
Marketplace Router for BotForg
Provides endpoints for marketplace: items, orders, freelancers, reviews
"""
import logging
import copy
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func, desc, asc

from backend.dependencies.auth import get_current_user
from backend.dependencies.auth_optional import get_current_user_optional
from backend.database import get_db
from backend.models.user import User
from backend.models.market import (
    MarketItem, MarketOrder, OrderProposal, FreelancerProfile, MarketReview,
    MarketItemType, MarketOrderStatus, ModerationStatus
)
from backend.models.bot import Bot
from backend.models.scenario import Scenario
from backend.utils.plan_limits import check_max_bots
from backend.utils.plan_limits import check_can_publish_templates, require_developer_plan
from backend.schemas.market import (
    MarketItemCreate, MarketItemUpdate, MarketItemOut, MarketItemDetailOut,
    MarketOrderCreate, MarketOrderUpdate, MarketOrderOut, MarketOrderDetailOut,
    OrderProposalCreate, OrderProposalOut,
    FreelancerProfileCreate, FreelancerProfileUpdate, FreelancerProfileOut,
    MarketReviewCreate, MarketReviewOut,
    MarketItemListResponse, MarketOrderListResponse, FreelancerListResponse,
    SellerInfo, MyTemplateOut, MarketInstallOut
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["Marketplace"])

MARKET_MANUAL_ACCESS_REQUIRED_DETAIL = {
    "code": "manual_access_required",
    "message": "Платные шаблоны устанавливаются после договорённости с автором вне платформы BotForg.",
}


def _ensure_free_market_install(item: MarketItem) -> None:
    """Блокирует установку платных товаров — доступ согласуется с автором вне платформы."""
    price = item.price if item.price is not None else Decimal("0")
    if Decimal(price) > 0:
        raise HTTPException(status_code=403, detail=MARKET_MANUAL_ACCESS_REQUIRED_DETAIL)


# ================== Helper Functions ==================

def get_seller_info(user: User) -> SellerInfo:
    """Преобразует User в SellerInfo"""
    return SellerInfo(
        id=user.id,
        name=user.name,
        email=user.email,
        avatar=getattr(user, 'avatar', None)
    )


def calculate_item_rating(db: Session, item_id: int) -> Tuple[Optional[float], int]:
    """Вычисляет средний рейтинг и количество отзывов для товара"""
    reviews = db.query(MarketReview).filter(
        MarketReview.item_type == "market_item",
        MarketReview.item_id == item_id
    ).all()
    
    if not reviews:
        return None, 0
    
    avg_rating = sum(r.rating for r in reviews) / len(reviews)
    return round(avg_rating, 2), len(reviews)


def calculate_freelancer_rating(db: Session, freelancer_id: int) -> Tuple[Optional[float], int]:
    """Вычисляет средний рейтинг и количество отзывов для исполнителя"""
    reviews = db.query(MarketReview).filter(
        MarketReview.item_type == "freelancer",
        MarketReview.item_id == freelancer_id
    ).all()
    
    if not reviews:
        return None, 0
    
    avg_rating = sum(r.rating for r in reviews) / len(reviews)
    return round(avg_rating, 2), len(reviews)


# ================== Creator Dashboard (Developer plan) ==================

@router.get("/my-templates", response_model=List[MyTemplateOut])
async def get_my_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Список шаблонов текущего пользователя для кабинета разработчика.
    Доступ только при plan_code === 'developer'.
    """
    require_developer_plan(db, current_user)
    items = (
        db.query(MarketItem)
        .filter(
            MarketItem.seller_id == current_user.id,
            MarketItem.item_type == MarketItemType.TEMPLATE,
        )
        .order_by(MarketItem.created_at.desc())
        .all()
    )
    def _mod_status(it):
        ms = getattr(it, "moderation_status", None)
        return ms.value if hasattr(ms, "value") else (ms or "draft")

    return [
        MyTemplateOut(
            id=item.id,
            name=item.title,
            status="published" if item.is_published else "draft",
            moderation_status=_mod_status(item),
            moderation_rejection_reason=getattr(item, "moderation_rejection_reason", None),
            installs_count=item.sales_count or 0,
            views_count=0,  # TODO: добавить при реализации аналитики
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post("/templates/{template_id}/submit")
async def submit_template_for_moderation(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Отправить шаблон на модерацию (draft → pending).
    Доступно только автору и при тарифе Developer.
    """
    require_developer_plan(db, current_user)
    item = (
        db.query(MarketItem)
        .filter(
            MarketItem.id == template_id,
            MarketItem.item_type == MarketItemType.TEMPLATE,
            MarketItem.seller_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    current = getattr(item, "moderation_status", None)
    current_val = current.value if hasattr(current, "value") else (current or "draft")
    if current_val != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"На модерацию можно отправить только черновик. Текущий статус: {current_val}",
        )
    item.moderation_status = ModerationStatus.PENDING
    item.moderation_rejection_reason = None
    db.commit()
    return {"ok": True, "moderation_status": "pending"}


# ================== MarketItem Endpoints ==================

@router.get("/items", response_model=MarketItemListResponse)
async def list_market_items(
    item_type: Optional[str] = Query(None, description="Фильтр по типу: template, scenario"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    search: Optional[str] = Query(None, description="Поиск по названию и описанию"),
    min_price: Optional[Decimal] = Query(None, ge=0, description="Минимальная цена"),
    max_price: Optional[Decimal] = Query(None, ge=0, description="Максимальная цена"),
    is_premium: Optional[bool] = Query(None, description="Фильтр по premium"),
    is_published: Optional[bool] = Query(True, description="Только опубликованные"),
    sort_by: str = Query("created_at", description="Сортировка: created_at, price, sales_count"),
    order: str = Query("desc", description="Порядок: asc, desc"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(20, ge=1, le=100, description="Размер страницы"),
    db: Session = Depends(get_db),
):
    """Получить список товаров на маркетплейсе"""
    query = db.query(MarketItem)
    
    # Фильтры
    if item_type:
        try:
            item_type_enum = MarketItemType(item_type)
            query = query.filter(MarketItem.item_type == item_type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid item_type: {item_type}")
    
    if category:
        query = query.filter(MarketItem.category == category)
    
    if is_published is not None:
        query = query.filter(MarketItem.is_published == is_published)
    # Шаблоны: в публичном маркете только approved; сценарии — без модерации
    if hasattr(MarketItem, "moderation_status"):
        query = query.filter(
            or_(
                MarketItem.item_type == MarketItemType.SCENARIO,
                (MarketItem.item_type == MarketItemType.TEMPLATE)
                & (MarketItem.moderation_status == ModerationStatus.APPROVED),
            )
        )
    
    if is_premium is not None:
        query = query.filter(MarketItem.is_premium == is_premium)
    
    if min_price is not None:
        query = query.filter(MarketItem.price >= min_price)
    
    if max_price is not None:
        query = query.filter(MarketItem.price <= max_price)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                MarketItem.title.ilike(search_pattern),
                MarketItem.description.ilike(search_pattern),
                MarketItem.additional_description.ilike(search_pattern)
            )
        )
    
    # Сортировка
    if sort_by == "price":
        sort_col = MarketItem.price
    elif sort_by == "sales_count":
        sort_col = MarketItem.sales_count
    else:
        sort_col = MarketItem.created_at
    
    if order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))
    
    # Подсчет и пагинация
    total = query.count()
    items = (
        query.options(joinedload(MarketItem.seller))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Агрегация рейтингов одним запросом (без N+1)
    item_ids = [item.id for item in items]
    ratings_by_item: dict[int, tuple[float, int]] = {}
    if item_ids:
        rating_rows = (
            db.query(
                MarketReview.item_id.label("item_id"),
                func.avg(MarketReview.rating).label("avg_rating"),
                func.count(MarketReview.id).label("rating_count"),
            )
            .filter(
                MarketReview.item_type == "market_item",
                MarketReview.item_id.in_(item_ids),
            )
            .group_by(MarketReview.item_id)
            .all()
        )
        ratings_by_item = {
            int(row.item_id): (round(float(row.avg_rating), 2), int(row.rating_count))
            for row in rating_rows
        }

    # Преобразование в схемы
    result_items = []
    for item in items:
        avg_rating, rating_count = ratings_by_item.get(item.id, (None, 0))
        item_dict = {
            **item.__dict__,
            "seller": get_seller_info(item.seller),
            "average_rating": avg_rating,
            "rating_count": rating_count
        }
        result_items.append(MarketItemOut(**item_dict))
    
    return MarketItemListResponse(
        total=total,
        items=result_items,
        page=page,
        page_size=page_size
    )


@router.get("/items/{item_id}", response_model=MarketItemDetailOut)
async def get_market_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить детальную информацию о товаре"""
    item = db.query(MarketItem).filter(MarketItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    # Проверка публикации
    if not item.is_published and (not current_user or current_user.id != item.seller_id):
        raise HTTPException(status_code=403, detail="Товар не опубликован")
    
    avg_rating, rating_count = calculate_item_rating(db, item_id)
    
    # Получаем отзывы
    reviews = db.query(MarketReview).filter(
        MarketReview.item_type == "market_item",
        MarketReview.item_id == item_id
    ).order_by(desc(MarketReview.created_at)).all()
    
    reviews_out = []
    for review in reviews:
        review_dict = {
            **review.__dict__,
            "author": get_seller_info(review.author)
        }
        reviews_out.append(MarketReviewOut(**review_dict))
    
    item_dict = {
        **item.__dict__,
        "seller": get_seller_info(item.seller),
        "average_rating": avg_rating,
        "rating_count": rating_count,
        "reviews": reviews_out
    }
    
    return MarketItemDetailOut(**item_dict)


@router.post("/items", response_model=MarketItemOut, status_code=status.HTTP_201_CREATED)
async def create_market_item(
    item_data: MarketItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать товар на маркетплейсе"""
    # Валидация типа
    try:
        item_type_enum = MarketItemType(item_data.item_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid item_type: {item_data.item_type}")

    # Публикация шаблонов — только тариф Developer
    if item_type_enum == MarketItemType.TEMPLATE:
        check_can_publish_templates(db, current_user)
    
    # Проверка источника
    if item_type_enum == MarketItemType.TEMPLATE:
        if not item_data.source_bot_id:
            raise HTTPException(status_code=400, detail="source_bot_id required for template")
        bot = db.query(Bot).filter(Bot.id == item_data.source_bot_id).first()
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        if bot.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="You don't own this bot")
    
    elif item_type_enum == MarketItemType.SCENARIO:
        if not item_data.source_scenario_id:
            raise HTTPException(status_code=400, detail="source_scenario_id required for scenario")
        scenario = db.query(Scenario).filter(Scenario.id == item_data.source_scenario_id).first()
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
        if scenario.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You don't own this scenario")
    
    # Создание товара
    item = MarketItem(
        item_type=item_type_enum,
        source_bot_id=item_data.source_bot_id,
        source_scenario_id=item_data.source_scenario_id,
        title=item_data.title,
        description=item_data.description,
        additional_description=item_data.additional_description,
        image_url=item_data.image_url,
        price=item_data.price,
        category=item_data.category,
        tags=item_data.tags,
        is_premium=item_data.is_premium,
        is_published=item_data.is_published,
        seller_id=current_user.id,
        published_at=datetime.now(timezone.utc) if item_data.is_published else None,
        moderation_status=ModerationStatus.DRAFT if item_type_enum == MarketItemType.TEMPLATE else ModerationStatus.APPROVED,
    )
    
    db.add(item)
    db.commit()
    db.refresh(item)
    
    item_dict = {
        **item.__dict__,
        "seller": get_seller_info(current_user),
        "average_rating": None,
        "rating_count": 0
    }
    
    return MarketItemOut(**item_dict)


@router.put("/items/{item_id}", response_model=MarketItemOut)
async def update_market_item(
    item_id: int,
    item_data: MarketItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновить товар на маркетплейсе"""
    item = db.query(MarketItem).filter(MarketItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    if item.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы не являетесь владельцем этого товара")
    
    # Обновление полей
    update_data = item_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    
    # Если публикуется впервые
    if item_data.is_published and not item.published_at:
        item.published_at = datetime.now(timezone.utc)
    
    item.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(item)
    
    avg_rating, rating_count = calculate_item_rating(db, item_id)
    item_dict = {
        **item.__dict__,
        "seller": get_seller_info(item.seller),
        "average_rating": avg_rating,
        "rating_count": rating_count
    }
    
    return MarketItemOut(**item_dict)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_market_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Удалить товар с маркетплейса"""
    item = db.query(MarketItem).filter(MarketItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    if item.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы не являетесь владельцем этого товара")
    
    db.delete(item)
    db.commit()
    
    return None


@router.post("/items/{item_id}/install-scenario", response_model=MarketInstallOut)
async def install_market_scenario(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Установить сценарий из маркетплейса: создать копию в Моих сценариях"""
    item = (
        db.query(MarketItem)
        .filter(MarketItem.id == item_id, MarketItem.item_type == MarketItemType.SCENARIO)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Товар-сценарий не найден")
    if not item.is_published:
        raise HTTPException(status_code=403, detail="Товар не опубликован")
    _ensure_free_market_install(item)
    if not item.source_scenario_id:
        raise HTTPException(status_code=400, detail="У товара не указан source_scenario_id")

    source_scenario = db.query(Scenario).filter(Scenario.id == item.source_scenario_id).first()
    if not source_scenario:
        raise HTTPException(status_code=404, detail="Исходный сценарий не найден")

    copied_scenario = Scenario(
        user_id=current_user.id,
        bot_id=None,
        name=f"{source_scenario.name} (копия)",
        description=source_scenario.description,
        icon=source_scenario.icon,
        category=source_scenario.category,
        is_main=False,
        is_library=False,
        is_standard=False,
        is_public=False,
        content=copy.deepcopy(source_scenario.content) if source_scenario.content is not None else {"nodes": [], "edges": []},
        published_content=copy.deepcopy(source_scenario.published_content) if source_scenario.published_content is not None else None,
        status=source_scenario.status,
        order=0,
    )
    db.add(copied_scenario)

    item.sales_count = (item.sales_count or 0) + 1
    db.commit()
    db.refresh(copied_scenario)

    return MarketInstallOut(
        ok=True,
        item_id=item.id,
        item_type=item.item_type.value if hasattr(item.item_type, "value") else str(item.item_type),
        created_scenario_id=copied_scenario.id,
        created_scenarios_count=1,
        message="Сценарий успешно установлен в Мои сценарии",
    )


@router.post("/items/{item_id}/install-bot", response_model=MarketInstallOut)
async def install_market_bot(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Установить шаблон бота из маркетплейса: создать копию бота и его сценариев"""
    item = (
        db.query(MarketItem)
        .filter(MarketItem.id == item_id, MarketItem.item_type == MarketItemType.TEMPLATE)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Товар-шаблон не найден")
    if not item.is_published:
        raise HTTPException(status_code=403, detail="Товар не опубликован")
    _ensure_free_market_install(item)
    if not item.source_bot_id:
        raise HTTPException(status_code=400, detail="У товара не указан source_bot_id")

    source_bot = db.query(Bot).filter(Bot.id == item.source_bot_id).first()
    if not source_bot:
        raise HTTPException(status_code=404, detail="Исходный бот не найден")

    check_max_bots(db, current_user)

    install_suffix = f"market_{item.id}_{current_user.id}_{int(datetime.now(timezone.utc).timestamp())}"
    copied_bot = Bot(
        owner_id=current_user.id,
        title=f"{source_bot.title} (копия)",
        description=source_bot.description,
        username=f"template_{install_suffix}",
        token=f"placeholder_{install_suffix}",
        webhook_url=None,
        is_active=False,
        content=copy.deepcopy(source_bot.content) if source_bot.content is not None else None,
        message_retention_days=source_bot.message_retention_days,
        allow_ai_text=source_bot.allow_ai_text,
        store_messages=source_bot.store_messages,
    )
    db.add(copied_bot)
    db.flush()

    source_scenarios = db.query(Scenario).filter(Scenario.bot_id == source_bot.id).all()
    copied_scenarios_count = 0
    for source_scenario in source_scenarios:
        copied_scenario = Scenario(
            user_id=current_user.id,
            bot_id=copied_bot.id,
            name=source_scenario.name,
            description=source_scenario.description,
            icon=source_scenario.icon,
            category=source_scenario.category,
            is_main=source_scenario.is_main,
            is_library=False,
            is_standard=False,
            is_public=False,
            content=copy.deepcopy(source_scenario.content) if source_scenario.content is not None else {"nodes": [], "edges": []},
            published_content=copy.deepcopy(source_scenario.published_content) if source_scenario.published_content is not None else None,
            status=source_scenario.status,
            order=source_scenario.order,
        )
        db.add(copied_scenario)
        copied_scenarios_count += 1

    item.sales_count = (item.sales_count or 0) + 1
    db.commit()
    db.refresh(copied_bot)

    return MarketInstallOut(
        ok=True,
        item_id=item.id,
        item_type=item.item_type.value if hasattr(item.item_type, "value") else str(item.item_type),
        created_bot_id=copied_bot.id,
        created_scenarios_count=copied_scenarios_count,
        message="Бот и его сценарии успешно установлены",
    )


# ================== MarketOrder Endpoints ==================

@router.get("/orders", response_model=MarketOrderListResponse)
async def list_market_orders(
    status_filter: Optional[str] = Query(None, alias="status", description="Фильтр по статусу"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    search: Optional[str] = Query(None, description="Поиск по названию и описанию"),
    sort_by: str = Query("created_at", description="Сортировка: created_at, budget_min, budget_max"),
    order: str = Query("desc", description="Порядок: asc, desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить список заказов"""
    query = db.query(MarketOrder)
    
    if status_filter:
        try:
            status_enum = MarketOrderStatus(status_filter)
            query = query.filter(MarketOrder.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")
    
    if category:
        query = query.filter(MarketOrder.category == category)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                MarketOrder.title.ilike(search_pattern),
                MarketOrder.description.ilike(search_pattern)
            )
        )
    
    # Сортировка
    if sort_by == "budget_min":
        sort_col = MarketOrder.budget_min
    elif sort_by == "budget_max":
        sort_col = MarketOrder.budget_max
    else:
        sort_col = MarketOrder.created_at
    
    if order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))
    
    total = query.count()
    orders = query.offset((page - 1) * page_size).limit(page_size).all()
    
    result_orders = []
    for order in orders:
        proposals_count = db.query(OrderProposal).filter(OrderProposal.order_id == order.id).count()
        order_dict = {
            **order.__dict__,
            "author": get_seller_info(order.author),
            "selected_freelancer": get_seller_info(order.selected_freelancer) if order.selected_freelancer else None,
            "proposals_count": proposals_count
        }
        result_orders.append(MarketOrderOut(**order_dict))
    
    return MarketOrderListResponse(
        total=total,
        items=result_orders,
        page=page,
        page_size=page_size
    )


@router.get("/orders/{order_id}", response_model=MarketOrderDetailOut)
async def get_market_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить детальную информацию о заказе"""
    order = db.query(MarketOrder).filter(MarketOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    # Получаем предложения
    proposals = db.query(OrderProposal).filter(OrderProposal.order_id == order_id).all()
    proposals_out = []
    for proposal in proposals:
        proposal_dict = {
            **proposal.__dict__,
            "freelancer": get_seller_info(proposal.freelancer)
        }
        proposals_out.append(OrderProposalOut(**proposal_dict))
    
    order_dict = {
        **order.__dict__,
        "author": get_seller_info(order.author),
        "selected_freelancer": get_seller_info(order.selected_freelancer) if order.selected_freelancer else None,
        "proposals_count": len(proposals_out),
        "proposals": proposals_out
    }
    
    return MarketOrderDetailOut(**order_dict)


@router.post("/orders", response_model=MarketOrderOut, status_code=status.HTTP_201_CREATED)
async def create_market_order(
    order_data: MarketOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать заказ на маркетплейсе"""
    order = MarketOrder(
        title=order_data.title,
        description=order_data.description,
        budget_min=order_data.budget_min,
        budget_max=order_data.budget_max,
        deadline=order_data.deadline,
        category=order_data.category,
        skills=order_data.skills,
        status=MarketOrderStatus.OPEN,
        author_id=current_user.id
    )
    
    db.add(order)
    db.commit()
    db.refresh(order)
    
    order_dict = {
        **order.__dict__,
        "author": get_seller_info(current_user),
        "selected_freelancer": None,
        "proposals_count": 0
    }
    
    return MarketOrderOut(**order_dict)


@router.put("/orders/{order_id}", response_model=MarketOrderOut)
async def update_market_order(
    order_id: int,
    order_data: MarketOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновить заказ"""
    order = db.query(MarketOrder).filter(MarketOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    if order.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы не являетесь автором этого заказа")
    
    update_data = order_data.model_dump(exclude_unset=True)
    if "status" in update_data:
        try:
            update_data["status"] = MarketOrderStatus(update_data["status"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {update_data['status']}")
    
    for field, value in update_data.items():
        setattr(order, field, value)
    
    order.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(order)
    
    proposals_count = db.query(OrderProposal).filter(OrderProposal.order_id == order_id).count()
    order_dict = {
        **order.__dict__,
        "author": get_seller_info(order.author),
        "selected_freelancer": get_seller_info(order.selected_freelancer) if order.selected_freelancer else None,
        "proposals_count": proposals_count
    }
    
    return MarketOrderOut(**order_dict)


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_market_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Удалить заказ"""
    order = db.query(MarketOrder).filter(MarketOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    if order.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы не являетесь автором этого заказа")
    
    db.delete(order)
    db.commit()
    
    return None


# ================== OrderProposal Endpoints ==================

@router.post("/orders/{order_id}/proposals", response_model=OrderProposalOut, status_code=status.HTTP_201_CREATED)
async def create_order_proposal(
    order_id: int,
    proposal_data: OrderProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать предложение на заказ"""
    order = db.query(MarketOrder).filter(MarketOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    if order.status != MarketOrderStatus.OPEN:
        raise HTTPException(status_code=400, detail="Заказ не принимает предложения")
    
    if order.author_id == current_user.id:
        raise HTTPException(status_code=400, detail="Вы не можете предложить услуги на свой заказ")
    
    # Проверка, не было ли уже предложения
    existing = db.query(OrderProposal).filter(
        OrderProposal.order_id == order_id,
        OrderProposal.freelancer_id == current_user.id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже отправили предложение на этот заказ")
    
    proposal = OrderProposal(
        order_id=order_id,
        freelancer_id=current_user.id,
        message=proposal_data.message,
        proposed_price=proposal_data.proposed_price,
        estimated_days=proposal_data.estimated_days
    )
    
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    
    proposal_dict = {
        **proposal.__dict__,
        "freelancer": get_seller_info(current_user)
    }
    
    return OrderProposalOut(**proposal_dict)


@router.post("/orders/{order_id}/proposals/{proposal_id}/accept", response_model=MarketOrderOut)
async def accept_proposal(
    order_id: int,
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Принять предложение на заказ"""
    order = db.query(MarketOrder).filter(MarketOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    if order.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы не являетесь автором этого заказа")
    
    proposal = db.query(OrderProposal).filter(
        OrderProposal.id == proposal_id,
        OrderProposal.order_id == order_id
    ).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Предложение не найдено")
    
    # Принимаем предложение
    proposal.is_accepted = True
    order.selected_freelancer_id = proposal.freelancer_id
    order.status = MarketOrderStatus.IN_PROGRESS
    
    # Отклоняем остальные предложения
    db.query(OrderProposal).filter(
        OrderProposal.order_id == order_id,
        OrderProposal.id != proposal_id
    ).update({"is_declined": True})
    
    db.commit()
    db.refresh(order)
    
    proposals_count = db.query(OrderProposal).filter(OrderProposal.order_id == order_id).count()
    order_dict = {
        **order.__dict__,
        "author": get_seller_info(order.author),
        "selected_freelancer": get_seller_info(order.selected_freelancer) if order.selected_freelancer else None,
        "proposals_count": proposals_count
    }
    
    return MarketOrderOut(**order_dict)


# ================== FreelancerProfile Endpoints ==================

@router.get("/freelancers", response_model=FreelancerListResponse)
async def list_freelancers(
    search: Optional[str] = Query(None, description="Поиск по названию и описанию"),
    skills: Optional[str] = Query(None, description="Фильтр по навыкам (через запятую)"),
    is_verified: Optional[bool] = Query(None, description="Фильтр по верификации"),
    sort_by: str = Query("created_at", description="Сортировка: created_at, hourly_rate, completed_orders_count"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить список исполнителей"""
    query = db.query(FreelancerProfile).filter(FreelancerProfile.is_active == True)
    
    if is_verified is not None:
        query = query.filter(FreelancerProfile.is_verified == is_verified)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.join(User).filter(
            or_(
                FreelancerProfile.title.ilike(search_pattern),
                FreelancerProfile.description.ilike(search_pattern),
                User.name.ilike(search_pattern)
            )
        )
    
    if skills:
        skill_list = [s.strip() for s in skills.split(",")]
        # Фильтрация по навыкам (JSON содержит список)
        for skill in skill_list:
            query = query.filter(FreelancerProfile.skills.contains([skill]))
    
    # Сортировка
    if sort_by == "hourly_rate":
        sort_col = FreelancerProfile.hourly_rate
    elif sort_by == "completed_orders_count":
        sort_col = FreelancerProfile.completed_orders_count
    else:
        sort_col = FreelancerProfile.created_at
    
    if order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))
    
    total = query.count()
    freelancers = query.offset((page - 1) * page_size).limit(page_size).all()
    
    result_freelancers = []
    for freelancer in freelancers:
        avg_rating, rating_count = calculate_freelancer_rating(db, freelancer.user_id)
        freelancer_dict = {
            **freelancer.__dict__,
            "user": get_seller_info(freelancer.user),
            "average_rating": avg_rating,
            "rating_count": rating_count
        }
        result_freelancers.append(FreelancerProfileOut(**freelancer_dict))
    
    return FreelancerListResponse(
        total=total,
        items=result_freelancers,
        page=page,
        page_size=page_size
    )


@router.get("/freelancers/{user_id}", response_model=FreelancerProfileOut)
async def get_freelancer_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить профиль исполнителя"""
    freelancer = db.query(FreelancerProfile).filter(FreelancerProfile.user_id == user_id).first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Профиль исполнителя не найден")
    
    avg_rating, rating_count = calculate_freelancer_rating(db, user_id)
    freelancer_dict = {
        **freelancer.__dict__,
        "user": get_seller_info(freelancer.user),
        "average_rating": avg_rating,
        "rating_count": rating_count
    }
    
    return FreelancerProfileOut(**freelancer_dict)


@router.post("/freelancers", response_model=FreelancerProfileOut, status_code=status.HTTP_201_CREATED)
async def create_freelancer_profile(
    profile_data: FreelancerProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать профиль исполнителя"""
    # Проверка, нет ли уже профиля
    existing = db.query(FreelancerProfile).filter(FreelancerProfile.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Профиль исполнителя уже существует")
    
    profile = FreelancerProfile(
        user_id=current_user.id,
        title=profile_data.title,
        description=profile_data.description,
        hourly_rate=profile_data.hourly_rate,
        skills=profile_data.skills,
        portfolio_items=profile_data.portfolio_items,
        is_active=True,
        is_verified=False
    )
    
    db.add(profile)
    db.commit()
    db.refresh(profile)
    
    profile_dict = {
        **profile.__dict__,
        "user": get_seller_info(current_user),
        "average_rating": None,
        "rating_count": 0
    }
    
    return FreelancerProfileOut(**profile_dict)


@router.put("/freelancers/me", response_model=FreelancerProfileOut)
async def update_my_freelancer_profile(
    profile_data: FreelancerProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновить свой профиль исполнителя"""
    profile = db.query(FreelancerProfile).filter(FreelancerProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль исполнителя не найден")
    
    update_data = profile_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    profile.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(profile)
    
    avg_rating, rating_count = calculate_freelancer_rating(db, current_user.id)
    profile_dict = {
        **profile.__dict__,
        "user": get_seller_info(current_user),
        "average_rating": avg_rating,
        "rating_count": rating_count
    }
    
    return FreelancerProfileOut(**profile_dict)


# ================== MarketReview Endpoints ==================

@router.post("/reviews", response_model=MarketReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    review_data: MarketReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать отзыв"""
    # Проверка, что объект существует
    if review_data.item_type == "market_item":
        item = db.query(MarketItem).filter(MarketItem.id == review_data.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Товар не найден")
        # Проверка, что пользователь купил товар (можно добавить проверку покупки)
    elif review_data.item_type == "market_order":
        order = db.query(MarketOrder).filter(MarketOrder.id == review_data.item_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        # Проверка, что пользователь участвовал в заказе
        if order.author_id != current_user.id and order.selected_freelancer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Вы не участвовали в этом заказе")
    elif review_data.item_type == "freelancer":
        freelancer = db.query(FreelancerProfile).filter(FreelancerProfile.user_id == review_data.item_id).first()
        if not freelancer:
            raise HTTPException(status_code=404, detail="Исполнитель не найден")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid item_type: {review_data.item_type}")
    
    # Проверка, не оставлял ли уже отзыв
    existing = db.query(MarketReview).filter(
        MarketReview.item_type == review_data.item_type,
        MarketReview.item_id == review_data.item_id,
        MarketReview.author_id == current_user.id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже оставили отзыв")
    
    review = MarketReview(
        item_type=review_data.item_type,
        item_id=review_data.item_id,
        author_id=current_user.id,
        rating=review_data.rating,
        comment=review_data.comment
    )
    
    db.add(review)
    db.commit()
    db.refresh(review)
    
    review_dict = {
        **review.__dict__,
        "author": get_seller_info(current_user)
    }
    
    return MarketReviewOut(**review_dict)


@router.get("/reviews", response_model=List[MarketReviewOut])
async def list_reviews(
    item_type: str = Query(..., description="Тип объекта: market_item, market_order, freelancer"),
    item_id: int = Query(..., description="ID объекта"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Получить список отзывов для объекта"""
    query = db.query(MarketReview).filter(
        MarketReview.item_type == item_type,
        MarketReview.item_id == item_id
    ).order_by(desc(MarketReview.created_at))
    
    total = query.count()
    reviews = query.offset((page - 1) * page_size).limit(page_size).all()
    
    result_reviews = []
    for review in reviews:
        review_dict = {
            **review.__dict__,
            "author": get_seller_info(review.author)
        }
        result_reviews.append(MarketReviewOut(**review_dict))
    
    return result_reviews
