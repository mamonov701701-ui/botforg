"""Доступ к ctor_bot_user_events."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotUserEvent


class CtorEventsRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, row: CtorBotUserEvent) -> CtorBotUserEvent:
        self.db.add(row)
        self.db.flush()
        return row

    def list_for_bot_user(
        self,
        bot_user_id: int,
        *,
        event_type: Optional[str] = None,
        scenario_id: Optional[int] = None,
        session_id: Optional[int] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[CtorBotUserEvent]:
        q = self.db.query(CtorBotUserEvent).filter(
            CtorBotUserEvent.bot_user_id == bot_user_id
        )
        if event_type is not None:
            q = q.filter(CtorBotUserEvent.event_type == event_type)
        if scenario_id is not None:
            q = q.filter(CtorBotUserEvent.scenario_id == scenario_id)
        if session_id is not None:
            q = q.filter(CtorBotUserEvent.session_id == session_id)
        if since is not None:
            q = q.filter(CtorBotUserEvent.created_at >= since)
        if until is not None:
            q = q.filter(CtorBotUserEvent.created_at <= until)
        return (
            q.order_by(CtorBotUserEvent.created_at.desc())
            .offset(offset)
            .limit(min(limit, 1000))
            .all()
        )
