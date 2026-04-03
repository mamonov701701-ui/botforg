"""Сессии ctor_bot_user_sessions."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import (
    CtorBlock,
    CtorBotUser,
    CtorBotUserSession,
    CtorScenario,
)
from backend.services.constructor.dto import LogEventInput
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.repositories.ctor_sessions_repository import (
    CtorSessionsRepository,
)
from backend.services.constructor.repositories.ctor_variables_repository import (
    CtorVariablesRepository,
)
from backend.services.constructor.types import (
    ERR_NOT_FOUND,
    ERR_SESSION,
    ERR_VALIDATION,
    ServiceResult,
    err_result,
    ok_result,
)


class SessionService:
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_ABANDONED = "abandoned"

    def __init__(self, db: Session):
        self.db = db
        self._repo = CtorSessionsRepository(db)
        self._events = EventLogService(db)

    def get_active_session(
        self, bot_user_id: int
    ) -> ServiceResult[Optional[CtorBotUserSession]]:
        row = self._repo.find_active_for_bot_user(bot_user_id)
        return ok_result(row)

    def start_session(
      self,
        bot_user_id: int,
        scenario_id: int,
        entry_block_id: Optional[int] = None,
        *,
        commit: bool = True,
    ) -> ServiceResult[CtorBotUserSession]:
        vrepo = CtorVariablesRepository(self.db)
        bu = vrepo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")

        scenario = (
            self.db.query(CtorScenario).filter(CtorScenario.id == scenario_id).first()
        )
        if not scenario:
            return err_result(ERR_NOT_FOUND, "ctor_scenario не найден")
        if scenario.bot_id != bu.bot_id:
            return err_result(ERR_SESSION, "сценарий не принадлежит боту этого пользователя")

        if entry_block_id is not None:
            block = (
                self.db.query(CtorBlock)
                .filter(
                    CtorBlock.id == entry_block_id,
                    CtorBlock.scenario_id == scenario_id,
                )
                .first()
            )
            if not block:
                return err_result(ERR_SESSION, "блок не найден или из другого сценария")

        for active in self._repo.list_active_for_bot_user(bot_user_id):
            active.status = self.STATUS_ABANDONED
        self.db.flush()

        row = CtorBotUserSession(
            bot_user_id=bot_user_id,
            scenario_id=scenario_id,
            current_block_id=entry_block_id,
            status=self.STATUS_ACTIVE,
            context_json={},
        )
        self._repo.add(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        return ok_result(row)

    def move_to_block(
        self,
        session_id: int,
        block_id: int,
        *,
        commit: bool = True,
    ) -> ServiceResult[CtorBotUserSession]:
        session = self._repo.get_by_id(session_id)
        if not session:
            return err_result(ERR_NOT_FOUND, "сессия не найдена")
        if session.status != self.STATUS_ACTIVE:
            return err_result(ERR_SESSION, "сессия не активна")

        block = self.db.query(CtorBlock).filter(CtorBlock.id == block_id).first()
        if not block:
            return err_result(ERR_NOT_FOUND, "блок не найден")
        if block.scenario_id != session.scenario_id:
            return err_result(ERR_SESSION, "блок относится к другому сценарию")

        session.current_block_id = block_id
        self._repo.save(session)

        bu_row = (
            self.db.query(CtorBotUser)
            .filter(CtorBotUser.id == session.bot_user_id)
            .first()
        )
        if not bu_row:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")
        self._events.log_event(
            LogEventInput(
                bot_id=bu_row.bot_id,
                bot_user_id=session.bot_user_id,
                event_type="block_entered",
                payload_json={"block_id": block_id, "session_id": session_id},
                session_id=session_id,
                scenario_id=session.scenario_id,
                block_id=block_id,
            ),
            commit=False,
        )
        if commit:
            self.db.commit()
            self.db.refresh(session)
        return ok_result(session)

    def complete_session(
        self, session_id: int, *, commit: bool = True
    ) -> ServiceResult[CtorBotUserSession]:
        session = self._repo.get_by_id(session_id)
        if not session:
            return err_result(ERR_NOT_FOUND, "сессия не найдена")
        session.status = self.STATUS_COMPLETED
        self._repo.save(session)
        if commit:
            self.db.commit()
            self.db.refresh(session)
        return ok_result(session)

    def set_session_context(
        self,
        session_id: int,
        patch: Mapping[str, Any],
        *,
        commit: bool = True,
    ) -> ServiceResult[Dict[str, Any]]:
        if not isinstance(patch, Mapping):
            return err_result(ERR_VALIDATION, "patch должен быть объектом")
        session = self._repo.get_by_id(session_id)
        if not session:
            return err_result(ERR_NOT_FOUND, "сессия не найдена")

        base: Dict[str, Any] = dict(session.context_json or {})
        for k, v in patch.items():
            if not isinstance(k, str):
                return err_result(ERR_VALIDATION, "ключи контекста должны быть строками")
            base[str(k)] = v
        session.context_json = base
        self._repo.save(session)
        if commit:
            self.db.commit()
            self.db.refresh(session)
        return ok_result(dict(session.context_json or {}))
