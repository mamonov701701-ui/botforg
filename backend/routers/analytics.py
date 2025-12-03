"""
Analytics Router for BotForg
Provides analytics and dashboard endpoints
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth.deps import get_current_user
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Track a custom event.
    """
    analytics = get_analytics_service(db)
    event = analytics.track_event(
        event_type=event_type,
        event_name=event_name,
        user_id=current_user.id,
        payload=payload,
    )
    return {"id": event.id, "created_at": event.created_at}


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
