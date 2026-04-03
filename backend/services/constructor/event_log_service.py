"""Журнал событий ctor_bot_user_events."""

from __future__ import annotations

from typing import List

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotUserEvent
from backend.services.constructor.dto import EventFilters, LogEventInput
from backend.services.constructor.repositories.ctor_events_repository import (
    CtorEventsRepository,
)
from backend.services.constructor.types import ERR_VALIDATION, ServiceResult, err_result, ok_result


class EventLogService:
    def __init__(self, db: Session):
        self.db = db
        self._repo = CtorEventsRepository(db)

    def log_event(
        self,
        data: LogEventInput,
        *,
        commit: bool = False,
    ) -> ServiceResult[CtorBotUserEvent]:
        if not data.event_type or not str(data.event_type).strip():
            return err_result(ERR_VALIDATION, "event_type обязателен")
        row = CtorBotUserEvent(
            bot_id=data.bot_id,
            bot_user_id=data.bot_user_id,
            session_id=data.session_id,
            scenario_id=data.scenario_id,
            block_id=data.block_id,
            event_type=str(data.event_type).strip()[:64],
            payload_json=data.payload_json,
        )
        self._repo.add(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        return ok_result(row)

    def get_user_events(
        self, bot_user_id: int, filters: EventFilters | None = None
    ) -> ServiceResult[List[CtorBotUserEvent]]:
        f = filters or EventFilters()
        items = self._repo.list_for_bot_user(
            bot_user_id,
            event_type=f.event_type,
            scenario_id=f.scenario_id,
            session_id=f.session_id,
            since=f.since,
            until=f.until,
            limit=f.limit,
            offset=f.offset,
        )
        return ok_result(items)
