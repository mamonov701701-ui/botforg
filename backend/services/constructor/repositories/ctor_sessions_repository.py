"""Доступ к ctor_bot_user_sessions."""

from __future__ import annotations

from typing import Any, List, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotUserSession


class CtorSessionsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, session_id: int) -> Optional[CtorBotUserSession]:
        return (
            self.db.query(CtorBotUserSession)
            .filter(CtorBotUserSession.id == session_id)
            .first()
        )

    def find_active_for_bot_user(
        self, bot_user_id: int
    ) -> Optional[CtorBotUserSession]:
        return (
            self.db.query(CtorBotUserSession)
            .filter(
                CtorBotUserSession.bot_user_id == bot_user_id,
                CtorBotUserSession.status == "active",
            )
            .order_by(CtorBotUserSession.updated_at.desc())
            .first()
        )

    def list_active_for_bot_user(self, bot_user_id: int) -> List[CtorBotUserSession]:
        return (
            self.db.query(CtorBotUserSession)
            .filter(
                CtorBotUserSession.bot_user_id == bot_user_id,
                CtorBotUserSession.status == "active",
            )
            .all()
        )

    def add(self, row: CtorBotUserSession) -> CtorBotUserSession:
        self.db.add(row)
        self.db.flush()
        return row

    def save(self, row: CtorBotUserSession) -> CtorBotUserSession:
        self.db.add(row)
        self.db.flush()
        return row
