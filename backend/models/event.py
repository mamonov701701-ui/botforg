"""
Event Model for Analytics
Stores user events, scenario executions, and system events
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from backend.database import Base


class Event(Base):
    """Analytics event model"""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    
    # Event identification
    event_type = Column(String(50), nullable=False, index=True)  # "bot_message", "scenario_run", "user_action", etc.
    event_name = Column(String(100), nullable=False, index=True)  # Specific event name
    
    # Relations
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True, index=True)
    
    # Event data
    payload = Column(JSON, default={})  # Additional event data
    
    # Context
    session_id = Column(String(100), nullable=True, index=True)  # User session
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Timing
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Indexes for common queries
    __table_args__ = (
        Index('ix_events_type_created', 'event_type', 'created_at'),
        Index('ix_events_user_created', 'user_id', 'created_at'),
        Index('ix_events_bot_created', 'bot_id', 'created_at'),
    )


class ScenarioExecution(Base):
    """Scenario execution tracking"""
    __tablename__ = "scenario_executions"

    id = Column(Integer, primary_key=True, index=True)
    
    # Relations
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # Bot user (telegram user)
    
    # Execution info
    status = Column(String(20), nullable=False, default="started", index=True)  # started, completed, failed, cancelled
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Execution path
    nodes_visited = Column(JSON, default=[])  # List of node IDs
    current_node = Column(String(50), nullable=True)
    
    # Error tracking
    error_message = Column(Text, nullable=True)
    error_node = Column(String(50), nullable=True)
    
    # Context
    input_data = Column(JSON, default={})
    output_data = Column(JSON, default={})
    variables = Column(JSON, default={})  # Runtime variables
    
    # Metrics
    duration_ms = Column(Integer, nullable=True)
    
    __table_args__ = (
        Index('ix_executions_scenario_status', 'scenario_id', 'status'),
        Index('ix_executions_bot_started', 'bot_id', 'started_at'),
    )


class DailyStats(Base):
    """Aggregated daily statistics"""
    __tablename__ = "daily_stats"

    id = Column(Integer, primary_key=True, index=True)
    
    # Date
    date = Column(DateTime, nullable=False, index=True)
    
    # Scope
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)
    
    # Metrics
    total_messages = Column(Integer, default=0)
    unique_users = Column(Integer, default=0)
    scenario_runs = Column(Integer, default=0)
    scenario_completions = Column(Integer, default=0)
    scenario_failures = Column(Integer, default=0)
    avg_response_time_ms = Column(Integer, default=0)
    
    # AI usage
    ai_requests = Column(Integer, default=0)
    ai_tokens_used = Column(Integer, default=0)
    
    __table_args__ = (
        Index('ix_daily_stats_date_user', 'date', 'user_id'),
        Index('ix_daily_stats_date_bot', 'date', 'bot_id'),
    )

