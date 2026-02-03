"""
Analytics Service for BotForg
Handles event tracking, aggregation, and analytics queries
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from backend.models.event import Event, ScenarioExecution, DailyStats


class AnalyticsService:
    """Service for analytics operations"""

    def __init__(self, db: Session):
        self.db = db
    
    # ============== Event Tracking ==============
    
    def track_event(
        self,
        event_type: str,
        event_name: str,
        user_id: Optional[int] = None,
        bot_id: Optional[int] = None,
        scenario_id: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        *,
        channel: Optional[str] = None,
        chat_hash: Optional[str] = None,
        node_id: Optional[str] = None,
        minimal_storage: bool = False,
    ) -> Event:
        """
        Track a new event.
        При minimal_storage=True сохраняются только агрегаты: event_type, channel, chat_hash, node_id, bot_id, created_at
        (без payload, user_id, session_id, ip_address, user_agent).
        """
        if minimal_storage:
            event = Event(
                event_type=event_type,
                event_name=event_name,
                bot_id=bot_id,
                channel=channel,
                chat_hash=chat_hash,
                node_id=node_id,
                payload={},
                user_id=None,
                scenario_id=None,
                session_id=None,
                ip_address=None,
                user_agent=None,
            )
        else:
            event = Event(
                event_type=event_type,
                event_name=event_name,
                user_id=user_id,
                bot_id=bot_id,
                scenario_id=scenario_id,
                payload=payload or {},
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                channel=channel,
                chat_hash=chat_hash,
                node_id=node_id,
            )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event
    
    # ============== Scenario Execution ==============
    
    def start_execution(
        self,
        scenario_id: int,
        bot_id: int,
        user_id: Optional[int] = None,
        input_data: Optional[Dict[str, Any]] = None,
    ) -> ScenarioExecution:
        """Start tracking a scenario execution"""
        execution = ScenarioExecution(
            scenario_id=scenario_id,
            bot_id=bot_id,
            user_id=user_id,
            status="started",
            input_data=input_data or {},
            nodes_visited=[],
        )
        self.db.add(execution)
        self.db.commit()
        self.db.refresh(execution)
        return execution
    
    def update_execution(
        self,
        execution_id: int,
        current_node: Optional[str] = None,
        nodes_visited: Optional[List[str]] = None,
        variables: Optional[Dict[str, Any]] = None,
    ) -> Optional[ScenarioExecution]:
        """Update execution progress"""
        execution = self.db.query(ScenarioExecution).filter(
            ScenarioExecution.id == execution_id
        ).first()
        
        if not execution:
            return None
        
        if current_node:
            execution.current_node = current_node
        if nodes_visited:
            execution.nodes_visited = nodes_visited
        if variables:
            execution.variables = variables
        
        self.db.commit()
        self.db.refresh(execution)
        return execution
    
    def complete_execution(
        self,
        execution_id: int,
        output_data: Optional[Dict[str, Any]] = None,
        status: str = "completed",
        error_message: Optional[str] = None,
        error_node: Optional[str] = None,
    ) -> Optional[ScenarioExecution]:
        """Complete or fail a scenario execution"""
        execution = self.db.query(ScenarioExecution).filter(
            ScenarioExecution.id == execution_id
        ).first()
        
        if not execution:
            return None
        
        execution.status = status
        execution.completed_at = datetime.utcnow()
        execution.output_data = output_data or {}
        
        if status == "failed":
            execution.error_message = error_message
            execution.error_node = error_node
        
        # Calculate duration
        if execution.started_at:
            duration = (execution.completed_at - execution.started_at).total_seconds() * 1000
            execution.duration_ms = int(duration)
        
        self.db.commit()
        self.db.refresh(execution)
        return execution
    
    # ============== Analytics Queries ==============
    
    def get_bot_stats(
        self,
        bot_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get statistics for a bot"""
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()
        
        # Total events
        total_events = self.db.query(func.count(Event.id)).filter(
            and_(
                Event.bot_id == bot_id,
                Event.created_at >= start_date,
                Event.created_at <= end_date,
            )
        ).scalar() or 0
        
        # Scenario executions
        executions = self.db.query(ScenarioExecution).filter(
            and_(
                ScenarioExecution.bot_id == bot_id,
                ScenarioExecution.started_at >= start_date,
                ScenarioExecution.started_at <= end_date,
            )
        ).all()
        
        total_executions = len(executions)
        completed = sum(1 for e in executions if e.status == "completed")
        failed = sum(1 for e in executions if e.status == "failed")
        
        # Average duration
        durations = [e.duration_ms for e in executions if e.duration_ms]
        avg_duration = sum(durations) / len(durations) if durations else 0
        
        return {
            "total_events": total_events,
            "total_executions": total_executions,
            "completed_executions": completed,
            "failed_executions": failed,
            "completion_rate": (completed / total_executions * 100) if total_executions > 0 else 0,
            "avg_duration_ms": avg_duration,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            }
        }
    
    def get_user_stats(
        self,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get statistics for a user"""
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()
        
        # Events by type
        events_by_type = self.db.query(
            Event.event_type,
            func.count(Event.id).label('count')
        ).filter(
            and_(
                Event.user_id == user_id,
                Event.created_at >= start_date,
                Event.created_at <= end_date,
            )
        ).group_by(Event.event_type).all()
        
        return {
            "events_by_type": {e.event_type: e.count for e in events_by_type},
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            }
        }
    
    def get_dashboard_data(
        self,
        user_id: int,
        days: int = 7,
    ) -> Dict[str, Any]:
        """Get dashboard data for user"""
        from backend.models.bot import Bot, BotInstance
        from backend.models.scenario import Scenario
        from backend.models.bot_user_state import BotUserState
        from backend.models.message import Message
        from backend.models.bonus_account import UserBonusAccount
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get user's bots
        bots = self.db.query(Bot).filter(Bot.owner_id == user_id).all()
        bot_ids = [b.id for b in bots]
        
        # Total bots and scenarios
        total_bots = len(bots)
        active_bots = sum(1 for b in bots if b.is_active)
        
        # Get BotInstance IDs for counting users and messages
        bot_instance_ids = []
        bot_instances = self.db.query(BotInstance).filter(BotInstance.user_id == user_id).all()
        bot_instance_ids = [bi.id for bi in bot_instances]
        
        # Count total users across all bots
        total_users = 0
        if bot_instance_ids:
            total_users = self.db.query(func.count(BotUserState.id)).filter(
                BotUserState.bot_id.in_(bot_instance_ids)
            ).scalar() or 0
        
        # Count total messages
        total_messages = 0
        if bot_instance_ids:
            total_messages = self.db.query(func.count(Message.id)).filter(
                Message.bot_id.in_(bot_instance_ids)
            ).scalar() or 0
        
        # Get user's bonus balance
        bonus_account = self.db.query(UserBonusAccount).filter(UserBonusAccount.user_id == user_id).first()
        bonus_balance = bonus_account.available_balance if bonus_account else 0
        
        # Total scenarios - count by user_id (scenarios belong to user, not just bots)
        total_scenarios = self.db.query(func.count(Scenario.id)).filter(
            Scenario.user_id == user_id
        ).scalar() or 0
        
        # Executions in period - get scenario IDs first, then executions
        scenario_ids = [s.id for s in self.db.query(Scenario.id).filter(Scenario.user_id == user_id).all()]
        
        if scenario_ids:
            executions = self.db.query(ScenarioExecution).filter(
                and_(
                    ScenarioExecution.scenario_id.in_(scenario_ids),
                    ScenarioExecution.started_at >= start_date,
                )
            ).all()
        else:
            executions = []
        
        # Daily breakdown
        daily_data = {}
        for i in range(days):
            day = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
            daily_data[day] = {"executions": 0, "completions": 0, "failures": 0}
        
        for ex in executions:
            if not ex.started_at:
                continue
            day = ex.started_at.strftime("%Y-%m-%d")
            if day in daily_data:
                daily_data[day]["executions"] += 1
                if ex.status == "completed":
                    daily_data[day]["completions"] += 1
                elif ex.status == "failed":
                    daily_data[day]["failures"] += 1
        
        return {
            "summary": {
                "total_bots": total_bots,
                "active_bots": active_bots,
                "total_scenarios": total_scenarios,
                "total_executions": len(executions),
                "total_users": total_users,
                "total_messages": total_messages,
                "bonus_balance": bonus_balance,
            },
            "daily": daily_data,
            "period_days": days,
        }


def get_analytics_service(db: Session) -> AnalyticsService:
    """Factory function for AnalyticsService"""
    return AnalyticsService(db)

