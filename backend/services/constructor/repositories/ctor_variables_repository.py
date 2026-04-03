"""Доступ к ctor_bot_variable_definitions и ctor_bot_user_variables."""

from __future__ import annotations

from typing import Any, List, Optional, Sequence

from sqlalchemy.orm import Session

from backend.models.constructor_core import (
    CtorBotUser,
    CtorBotUserVariable,
    CtorBotVariableDefinition,
)


class CtorVariablesRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_bot_user(self, bot_user_id: int) -> Optional[CtorBotUser]:
        return self.db.query(CtorBotUser).filter(CtorBotUser.id == bot_user_id).first()

    def get_definition_by_bot_and_key(
        self, bot_id: int, key: str
    ) -> Optional[CtorBotVariableDefinition]:
        return (
            self.db.query(CtorBotVariableDefinition)
            .filter(
                CtorBotVariableDefinition.bot_id == bot_id,
                CtorBotVariableDefinition.key == key,
            )
            .first()
        )

    def list_definitions_for_bot(self, bot_id: int) -> List[CtorBotVariableDefinition]:
        return (
            self.db.query(CtorBotVariableDefinition)
            .filter(CtorBotVariableDefinition.bot_id == bot_id)
            .order_by(CtorBotVariableDefinition.key)
            .all()
        )

    def add_definition(self, row: CtorBotVariableDefinition) -> CtorBotVariableDefinition:
        self.db.add(row)
        self.db.flush()
        return row

    def list_user_variables_with_definitions(
        self, bot_user_id: int
    ) -> Sequence[tuple[CtorBotUserVariable, CtorBotVariableDefinition]]:
        q = (
            self.db.query(CtorBotUserVariable, CtorBotVariableDefinition)
            .join(
                CtorBotVariableDefinition,
                CtorBotUserVariable.variable_definition_id
                == CtorBotVariableDefinition.id,
            )
            .filter(CtorBotUserVariable.bot_user_id == bot_user_id)
            .order_by(CtorBotVariableDefinition.key)
        )
        return q.all()

    def list_definitions_with_values_for_bot_user(
        self, bot_id: int, bot_user_id: int
    ) -> Sequence[tuple[CtorBotVariableDefinition, Optional[CtorBotUserVariable]]]:
        """Все определения бота и значения пользователя (если есть)."""
        Def = CtorBotVariableDefinition
        Val = CtorBotUserVariable
        q = (
            self.db.query(Def, Val)
            .outerjoin(
                Val,
                (Val.variable_definition_id == Def.id)
                & (Val.bot_user_id == bot_user_id),
            )
            .filter(Def.bot_id == bot_id)
            .order_by(Def.key)
        )
        return q.all()

    def get_user_value_by_definition(
        self, bot_user_id: int, definition_id: int
    ) -> Optional[CtorBotUserVariable]:
        return (
            self.db.query(CtorBotUserVariable)
            .filter(
                CtorBotUserVariable.bot_user_id == bot_user_id,
                CtorBotUserVariable.variable_definition_id == definition_id,
            )
            .first()
        )

    def upsert_user_variable(
        self,
        bot_user_id: int,
        definition_id: int,
        *,
        value_text: Optional[str] = None,
        value_number: Optional[Any] = None,
        value_boolean: Optional[bool] = None,
        value_date: Optional[Any] = None,
        value_json: Optional[Any] = None,
    ) -> CtorBotUserVariable:
        row = self.get_user_value_by_definition(bot_user_id, definition_id)
        if row is None:
            row = CtorBotUserVariable(
                bot_user_id=bot_user_id,
                variable_definition_id=definition_id,
            )
            self.db.add(row)
        row.value_text = value_text
        row.value_number = value_number
        row.value_boolean = value_boolean
        row.value_date = value_date
        row.value_json = value_json
        self.db.flush()
        return row
