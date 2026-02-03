"""
Analytics Router for BotForg
Provides analytics and dashboard endpoints
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func

logger = logging.getLogger(__name__)

from backend.dependencies.auth import get_current_user
from backend.database import get_db
from backend.models.user import User
from backend.services.analytics_service import get_analytics_service
from sqlalchemy.orm import Session


router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard")
async def get_dashboard(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get dashboard data for current user.
    Returns summary stats and daily breakdown.
    """
    analytics = get_analytics_service(db)
    return analytics.get_dashboard_data(current_user.id, days)


@router.get("/bot/{bot_id}")
async def get_bot_analytics(
    bot_id: int,
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get analytics for a specific bot.
    Requires bot ownership or team membership.
    """
    from backend.models.bot import Bot
    from backend.utils.bot_access import check_bot_access
    
    # Check access
    check_bot_access(bot_id, current_user.id, db)
    
    # Parse dates
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    analytics = get_analytics_service(db)
    return analytics.get_bot_stats(bot_id, start, end)


@router.get("/user")
async def get_user_analytics(
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get analytics for current user's activity.
    """
    # Parse dates
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    analytics = get_analytics_service(db)
    return analytics.get_user_stats(current_user.id, start, end)


@router.post("/event")
async def track_event(
    event_type: str,
    event_name: str,
    payload: Optional[dict] = None,
    bot_id: Optional[int] = None,
    channel: Optional[str] = None,
    chat_hash: Optional[str] = None,
    chat_id: Optional[str] = None,
    node_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Track a custom event.
    Если передан chat_id — сервер вычисляет chat_hash (HMAC), chat_id в БД/логах не сохраняется.
    Если передан bot_id и у бота store_messages=False, сохраняются только агрегаты без ПДн.
    """
    from backend.models.bot import Bot
    from backend.utils.bot_access import check_bot_access
    from backend.utils.chat_hash import make_chat_hash

    resolved_chat_hash = make_chat_hash(channel or "", chat_id) if chat_id else chat_hash

    minimal_storage = False
    resolved_bot_id = bot_id
    if bot_id is not None:
        check_bot_access(bot_id, current_user.id, db)
        bot = db.query(Bot).filter(Bot.id == bot_id).first()
        if bot and not getattr(bot, "store_messages", True):
            minimal_storage = True

    analytics = get_analytics_service(db)
    event = analytics.track_event(
        event_type=event_type,
        event_name=event_name,
        user_id=None if minimal_storage else current_user.id,
        bot_id=resolved_bot_id,
        payload=payload,
        channel=channel,
        chat_hash=resolved_chat_hash,
        node_id=node_id,
        minimal_storage=minimal_storage,
    )
    return {"id": event.id, "created_at": event.created_at}


@router.get("/events/recent")
async def get_recent_events(
    limit: int = Query(default=10, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get recent events for current user.
    """
    from backend.models.event import Event
    from backend.models.bot import Bot
    
    # Get user's bot IDs
    bot_ids = [b.id for b in db.query(Bot).filter(Bot.owner_id == current_user.id).all()]
    
    # Query events for user or their bots
    events = db.query(Event).filter(
        (Event.user_id == current_user.id) | (Event.bot_id.in_(bot_ids) if bot_ids else False)
    ).order_by(Event.created_at.desc()).limit(limit).all()
    
    return {
        "items": [
            {
                "id": ev.id,
                "type": ev.event_type,
                "name": ev.event_name,
                "payload": ev.payload,
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in events
        ]
    }


@router.get("/executions/{bot_id}")
async def get_bot_executions(
    bot_id: int,
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get recent scenario executions for a bot.
    """
    from backend.models.event import ScenarioExecution
    from backend.utils.bot_access import check_bot_access
    
    # Check access
    check_bot_access(bot_id, current_user.id, db)
    
    # Query executions
    query = db.query(ScenarioExecution).filter(
        ScenarioExecution.bot_id == bot_id
    )
    
    if status:
        query = query.filter(ScenarioExecution.status == status)
    
    executions = query.order_by(
        ScenarioExecution.started_at.desc()
    ).limit(limit).all()
    
    return {
        "total": len(executions),
        "items": [
            {
                "id": ex.id,
                "scenario_id": ex.scenario_id,
                "status": ex.status,
                "started_at": ex.started_at.isoformat() if ex.started_at else None,
                "completed_at": ex.completed_at.isoformat() if ex.completed_at else None,
                "duration_ms": ex.duration_ms,
                "nodes_visited": len(ex.nodes_visited) if ex.nodes_visited else 0,
                "error_message": ex.error_message,
            }
            for ex in executions
        ]
    }


@router.get("/marketing")
async def get_marketing_analytics(
    days: int = Query(default=30, ge=1, le=365),
    bot_id: Optional[int] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive marketing analytics for bots.
    Includes hourly activity, user acquisition, retention, conversion funnels.
    """
    import time
    start_time = time.time()
    
    from backend.models.bot import Bot, BotInstance
    from backend.models.bot_user_state import BotUserState
    from backend.models.message import Message
    from backend.models.event import ScenarioExecution
    from sqlalchemy import extract, case
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    logger.info(f"[Marketing Analytics] Starting for user {current_user.id}, days={days}")
    
    # Get user's bots from the main Bot table (for Message queries)
    bots_query = db.query(Bot).filter(Bot.owner_id == current_user.id)
    if bot_id:
        bots_query = bots_query.filter(Bot.id == bot_id)
    bots = bots_query.all()
    bot_ids = [b.id for b in bots]  # IDs from 'bots' table for Message queries
    
    # Get user's bot instances (for BotUserState queries - legacy model)
    bot_instances_query = db.query(BotInstance).filter(BotInstance.user_id == current_user.id)
    bot_instances = bot_instances_query.all()
    bot_instance_ids = [bi.id for bi in bot_instances]  # IDs from 'bot_instances' for BotUserState
    
    # Check if we have any data to query
    if not bot_ids and not bot_instance_ids:
        return _empty_marketing_response(days)
    
    # ============== Hourly Activity (last 24 hours) ==============
    hourly_start = end_date - timedelta(hours=24)
    
    # Users active per hour (using last_interaction_at) - only if we have bot instances
    hourly_users = []
    if bot_instance_ids:
        hourly_users = db.query(
            extract('hour', BotUserState.last_interaction_at).label('hour'),
            func.count(func.distinct(BotUserState.telegram_user_id)).label('users')
        ).filter(
            BotUserState.bot_id.in_(bot_instance_ids),
            BotUserState.last_interaction_at >= hourly_start,
            BotUserState.last_interaction_at <= end_date,
        ).group_by(extract('hour', BotUserState.last_interaction_at)).all()
    
    # Messages per hour - only if we have bots
    hourly_messages = []
    if bot_ids:
        hourly_messages = db.query(
            extract('hour', Message.created_at).label('hour'),
            func.count(Message.id).label('messages')
        ).filter(
            Message.bot_id.in_(bot_ids),
            Message.created_at >= hourly_start,
            Message.created_at <= end_date,
        ).group_by(extract('hour', Message.created_at)).all()
    
    # Build hourly data (24 hours)
    hourly_data = []
    current_hour = end_date.hour
    for i in range(24):
        hour = (current_hour - 23 + i) % 24
        user_count = next((h.users for h in hourly_users if int(h.hour) == hour), 0)
        msg_count = next((h.messages for h in hourly_messages if int(h.hour) == hour), 0)
        hourly_data.append({
            "hour": f"{hour:02d}:00",
            "hour_num": hour,
            "users": user_count,
            "messages": msg_count,
            "is_now": i == 23,
        })
    
    # ============== Daily User Acquisition ==============
    # Use created_at as first_seen - only if we have bot instances
    daily_new_users = []
    daily_active = []
    if bot_instance_ids:
        daily_new_users = db.query(
            func.date(BotUserState.created_at).label('date'),
            func.count(BotUserState.id).label('new_users')
        ).filter(
            BotUserState.bot_id.in_(bot_instance_ids),
            BotUserState.created_at >= start_date,
            BotUserState.created_at <= end_date,
        ).group_by(func.date(BotUserState.created_at)).all()
        
        # Daily active users (using last_interaction_at)
        daily_active = db.query(
            func.date(BotUserState.last_interaction_at).label('date'),
            func.count(func.distinct(BotUserState.telegram_user_id)).label('active_users')
        ).filter(
            BotUserState.bot_id.in_(bot_instance_ids),
            BotUserState.last_interaction_at >= start_date,
            BotUserState.last_interaction_at <= end_date,
        ).group_by(func.date(BotUserState.last_interaction_at)).all()
    
    # Daily messages (using bot_ids) - only if we have bots
    daily_messages = []
    if bot_ids:
        daily_messages = db.query(
            func.date(Message.created_at).label('date'),
            func.count(Message.id).label('messages')
        ).filter(
            Message.bot_id.in_(bot_ids),
            Message.created_at >= start_date,
            Message.created_at <= end_date,
        ).group_by(func.date(Message.created_at)).all()
    
    # Build daily data
    daily_data = []
    for i in range(days):
        day = (end_date - timedelta(days=days - 1 - i)).date()
        day_str = day.isoformat()
        new_users = next((d.new_users for d in daily_new_users if str(d.date) == day_str), 0)
        active = next((d.active_users for d in daily_active if str(d.date) == day_str), 0)
        msgs = next((d.messages for d in daily_messages if str(d.date) == day_str), 0)
        daily_data.append({
            "date": day_str,
            "date_short": day.strftime("%d.%m"),
            "new_users": new_users,
            "active_users": active,
            "messages": msgs,
        })
    
    # ============== User Retention (optimized - single query) ==============
    total_users = 0
    active_7d = 0
    active_30d = 0
    returning_users = 0
    
    if bot_instance_ids:
        week_ago = end_date - timedelta(days=7)
        month_ago = end_date - timedelta(days=30)
        
        # Single query with conditional counts
        retention_stats = db.query(
            func.count(BotUserState.id).label('total'),
            func.count(func.distinct(case(
                (BotUserState.last_interaction_at >= week_ago, BotUserState.telegram_user_id),
                else_=None
            ))).label('active_7d'),
            func.count(func.distinct(case(
                (BotUserState.last_interaction_at >= month_ago, BotUserState.telegram_user_id),
                else_=None
            ))).label('active_30d'),
            func.sum(case((BotUserState.history.isnot(None), 1), else_=0)).label('returned_users'),
        ).filter(
            BotUserState.bot_id.in_(bot_instance_ids)
        ).first()
        
        if retention_stats:
            total_users = retention_stats.total or 0
            active_7d = retention_stats.active_7d or 0
            active_30d = retention_stats.active_30d or 0
            returning_users = retention_stats.returned_users or 0
    
    retention = {
        "total_users": total_users,
        "active_7d": active_7d,
        "active_30d": active_30d,
        "returning_users": returning_users,
        "retention_7d": round((active_7d / total_users * 100) if total_users > 0 else 0, 1),
        "retention_30d": round((active_30d / total_users * 100) if total_users > 0 else 0, 1),
        "return_rate": round((returning_users / total_users * 100) if total_users > 0 else 0, 1),
    }
    
    # ============== Message Statistics (optimized - single query) ==============
    total_messages = 0
    incoming_messages = 0
    outgoing_messages = 0
    
    if bot_ids:
        # Single query with conditional counts
        msg_stats = db.query(
            func.count(Message.id).label('total'),
            func.sum(case((Message.direction == 'incoming', 1), else_=0)).label('incoming'),
            func.sum(case((Message.direction == 'outgoing', 1), else_=0)).label('outgoing'),
        ).filter(
            Message.bot_id.in_(bot_ids),
            Message.created_at >= start_date,
        ).first()
        
        if msg_stats:
            total_messages = msg_stats.total or 0
            incoming_messages = msg_stats.incoming or 0
            outgoing_messages = msg_stats.outgoing or 0
    
    # Average messages per user
    avg_messages_per_user = round(total_messages / total_users, 1) if total_users > 0 else 0
    
    messages_stats = {
        "total": total_messages,
        "incoming": incoming_messages,
        "outgoing": outgoing_messages,
        "avg_per_user": avg_messages_per_user,
    }
    
    # ============== Peak Activity ==============
    # Find peak hour
    peak_hour = max(hourly_data, key=lambda x: x['users']) if hourly_data else None
    
    # Find peak day
    peak_day = max(daily_data, key=lambda x: x['active_users']) if daily_data else None
    
    peaks = {
        "peak_hour": peak_hour['hour'] if peak_hour else "N/A",
        "peak_hour_users": peak_hour['users'] if peak_hour else 0,
        "peak_day": peak_day['date_short'] if peak_day else "N/A",
        "peak_day_users": peak_day['active_users'] if peak_day else 0,
    }
    
    # ============== Growth Metrics ==============
    # Compare with previous period
    prev_start = start_date - timedelta(days=days)
    prev_end = start_date
    
    # Use created_at as first_seen
    prev_new_users = 0
    if bot_instance_ids:
        prev_new_users = db.query(func.count(BotUserState.id)).filter(
            BotUserState.bot_id.in_(bot_instance_ids),
            BotUserState.created_at >= prev_start,
            BotUserState.created_at < prev_end,
        ).scalar() or 0
    
    current_new_users = sum(d['new_users'] for d in daily_data)
    
    prev_messages = 0
    if bot_ids:
        prev_messages = db.query(func.count(Message.id)).filter(
            Message.bot_id.in_(bot_ids),
            Message.created_at >= prev_start,
            Message.created_at < prev_end,
        ).scalar() or 0
    
    def calc_growth(current, previous):
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)
    
    growth = {
        "users_growth": calc_growth(current_new_users, prev_new_users),
        "messages_growth": calc_growth(total_messages, prev_messages),
        "current_new_users": current_new_users,
        "previous_new_users": prev_new_users,
    }
    
    # ============== Currently Online ==============
    # Users active in last 5 minutes (using last_interaction_at)
    online_now = 0
    if bot_instance_ids:
        five_min_ago = end_date - timedelta(minutes=5)
        online_now = db.query(func.count(func.distinct(BotUserState.telegram_user_id))).filter(
            BotUserState.bot_id.in_(bot_instance_ids),
            BotUserState.last_interaction_at >= five_min_ago,
        ).scalar() or 0
    
    elapsed = time.time() - start_time
    logger.info(f"[Marketing Analytics] Completed in {elapsed:.2f}s")
    
    return {
        "period_days": days,
        "hourly": hourly_data,
        "daily": daily_data,
        "retention": retention,
        "messages": messages_stats,
        "peaks": peaks,
        "growth": growth,
        "online_now": online_now,
    }


def _empty_marketing_response(days: int):
    """Return empty marketing response structure"""
    return {
        "period_days": days,
        "hourly": [{"hour": f"{h:02d}:00", "hour_num": h, "users": 0, "messages": 0, "is_now": False} for h in range(24)],
        "daily": [],
        "retention": {
            "total_users": 0, "active_7d": 0, "active_30d": 0, "returning_users": 0,
            "retention_7d": 0, "retention_30d": 0, "return_rate": 0,
        },
        "messages": {"total": 0, "incoming": 0, "outgoing": 0, "avg_per_user": 0},
        "peaks": {"peak_hour": "N/A", "peak_hour_users": 0, "peak_day": "N/A", "peak_day_users": 0},
        "growth": {"users_growth": 0, "messages_growth": 0, "current_new_users": 0, "previous_new_users": 0},
        "online_now": 0,
    }


@router.get("/bot-users")
async def get_bot_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    bot_id: Optional[int] = Query(default=None, description="Фильтр по конкретному боту"),
    status: Optional[str] = Query(default=None, description="Фильтр по статусу: active, unsubscribed, banned, inactive"),
    channel: Optional[str] = Query(default=None, description="Фильтр по каналу: telegram, vk, whatsapp, webchat"),
    search: Optional[str] = Query(default=None, description="Поиск по имени, email, телефону, telegram_user_id"),
    utm_source: Optional[str] = Query(default=None, description="Фильтр по UTM source"),
    utm_campaign: Optional[str] = Query(default=None, description="Фильтр по UTM campaign"),
    entry_point: Optional[str] = Query(default=None, description="Фильтр по точке входа"),
    sort_by: Optional[str] = Query(default="last_interaction_at", description="Сортировка: created_at, last_interaction_at, name"),
    sort_order: Optional[str] = Query(default="desc", description="Порядок: asc, desc"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить список пользователей ботов текущего владельца с фильтрацией и пагинацией.
    """
    from backend.models.bot import Bot, BotInstance
    from backend.models.bot_user_state import BotUserState
    from backend.models.message import Message
    from sqlalchemy import or_, case
    
    # Получаем ботов текущего пользователя
    user_bots = db.query(Bot).filter(Bot.owner_id == current_user.id).all()
    if not user_bots:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "filters": {
                "statuses": [],
                "channels": [],
                "utm_sources": [],
                "entry_points": [],
                "bots": [],
            }
        }
    
    # Получаем bot_instance_ids для фильтрации
    bot_instance_ids = []
    bot_id_to_title = {}
    for bot in user_bots:
        bot_instance = db.query(BotInstance).filter(
            (BotInstance.token == bot.token) | (BotInstance.username == bot.username)
        ).first()
        if bot_instance:
            bot_instance_ids.append(bot_instance.id)
            bot_id_to_title[bot_instance.id] = bot.title
    
    if not bot_instance_ids:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "filters": {
                "statuses": [],
                "channels": [],
                "utm_sources": [],
                "entry_points": [],
                "bots": [{"id": b.id, "title": b.title} for b in user_bots],
            }
        }
    
    # Базовый запрос
    query = db.query(BotUserState).filter(BotUserState.bot_id.in_(bot_instance_ids))
    
    # Фильтр по конкретному боту
    if bot_id:
        target_bot = db.query(Bot).filter(Bot.id == bot_id, Bot.owner_id == current_user.id).first()
        if target_bot:
            target_instance = db.query(BotInstance).filter(
                (BotInstance.token == target_bot.token) | (BotInstance.username == target_bot.username)
            ).first()
            if target_instance:
                query = query.filter(BotUserState.bot_id == target_instance.id)
    
    # Фильтры
    if status:
        query = query.filter(BotUserState.status == status)
    if channel:
        query = query.filter(BotUserState.channel == channel)
    if utm_source:
        query = query.filter(BotUserState.utm_source == utm_source)
    if utm_campaign:
        query = query.filter(BotUserState.utm_campaign == utm_campaign)
    if entry_point:
        query = query.filter(BotUserState.entry_point == entry_point)
    
    # Поиск
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(or_(
            BotUserState.name.ilike(search_pattern),
            BotUserState.email.ilike(search_pattern),
            BotUserState.phone.ilike(search_pattern),
            BotUserState.telegram_user_id.ilike(search_pattern),
        ))
    
    # Получаем общее количество
    total = query.count()
    
    # Сортировка
    if sort_by == "created_at":
        order_col = BotUserState.created_at
    elif sort_by == "name":
        order_col = BotUserState.name
    else:
        order_col = BotUserState.last_interaction_at
    
    if sort_order == "asc":
        query = query.order_by(order_col.asc().nullslast())
    else:
        query = query.order_by(order_col.desc().nullsfirst())
    
    # Пагинация
    offset = (page - 1) * page_size
    users = query.offset(offset).limit(page_size).all()
    
    # Получаем количество сообщений для каждого пользователя
    user_messages = {}
    if users:
        user_ids = [u.telegram_user_id for u in users]
        # Получаем bot.id (не bot_instance.id) для Message
        bot_ids = [b.id for b in user_bots]
        
        messages_counts = db.query(
            Message.from_user_id,
            func.count(Message.id).label('count')
        ).filter(
            Message.bot_id.in_(bot_ids),
            Message.from_user_id.in_(user_ids),
        ).group_by(Message.from_user_id).all()
        
        for mc in messages_counts:
            user_messages[mc.from_user_id] = mc.count
    
    # Формируем результат
    items = []
    for u in users:
        items.append({
            "id": u.id,
            "public_id": u.public_id,
            "telegram_user_id": u.telegram_user_id,
            "bot_id": u.bot_id,
            "bot_title": bot_id_to_title.get(u.bot_id, "Неизвестный бот"),
            "channel": u.channel,
            "status": u.status,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "entry_point": u.entry_point,
            "utm_source": u.utm_source,
            "utm_campaign": u.utm_campaign,
            "messages_count": user_messages.get(u.telegram_user_id, 0),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_interaction_at": u.last_interaction_at.isoformat() if u.last_interaction_at else None,
        })
    
    # Получаем уникальные значения для фильтров
    all_users_query = db.query(BotUserState).filter(BotUserState.bot_id.in_(bot_instance_ids))
    
    statuses = db.query(BotUserState.status).filter(
        BotUserState.bot_id.in_(bot_instance_ids),
        BotUserState.status.isnot(None)
    ).distinct().all()
    
    channels = db.query(BotUserState.channel).filter(
        BotUserState.bot_id.in_(bot_instance_ids),
        BotUserState.channel.isnot(None)
    ).distinct().all()
    
    utm_sources_list = db.query(BotUserState.utm_source).filter(
        BotUserState.bot_id.in_(bot_instance_ids),
        BotUserState.utm_source.isnot(None)
    ).distinct().all()
    
    entry_points_list = db.query(BotUserState.entry_point).filter(
        BotUserState.bot_id.in_(bot_instance_ids),
        BotUserState.entry_point.isnot(None)
    ).distinct().all()
    
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "filters": {
            "statuses": [s[0] for s in statuses if s[0]],
            "channels": [c[0] for c in channels if c[0]],
            "utm_sources": [u[0] for u in utm_sources_list if u[0]],
            "entry_points": [e[0] for e in entry_points_list if e[0]],
            "bots": [{"id": b.id, "title": b.title} for b in user_bots],
        }
    }
