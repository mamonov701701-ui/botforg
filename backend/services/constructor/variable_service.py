"""Переменные ctor_bot_user / ctor_bot_variable_definitions."""

from __future__ import annotations

from typing import Any, List, Mapping, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotVariableDefinition
from backend.services.constructor.dto import LogEventInput, UserVariableView, VariableDefinitionOptions
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.repositories.ctor_variables_repository import (
    CtorVariablesRepository,
)
from backend.services.constructor.types import (
    ERR_DEFINITION,
    ERR_NOT_FOUND,
    ERR_VALIDATION,
    ServiceResult,
    err_result,
    ok_result,
)
from backend.services.constructor.validation import (
    is_system_variable_key,
    validate_snake_case_key,
)
from backend.services.constructor.value_codec import normalize_for_definition
from backend.services.bot_crm.overview_aggregate_service import mark_crm_overview_dirty


class VariableService:
    def __init__(self, db: Session):
        self.db = db
        self._repo = CtorVariablesRepository(db)
        self._events = EventLogService(db)

    def validate_variable_key(self, key: str) -> ServiceResult[None]:
        msg = validate_snake_case_key(key)
        if msg:
            return err_result(ERR_VALIDATION, msg)
        return ok_result(None)

    def ensure_variable_definition(
        self,
        bot_id: int,
        key: str,
        options: VariableDefinitionOptions | None = None,
        *,
        commit: bool = False,
    ) -> ServiceResult[CtorBotVariableDefinition]:
        opts = options or VariableDefinitionOptions()
        v = self.validate_variable_key(key)
        if not v.ok:
            return v  # type: ignore[return-value]

        existing = self._repo.get_definition_by_bot_and_key(bot_id, key.strip())
        if existing:
            return ok_result(existing)

        if is_system_variable_key(key.strip()):
            if not opts.is_system:
                return err_result(
                    ERR_DEFINITION,
                    "системное определение переменной отсутствует: выполните сид или создайте вручную с флагом is_system",
                )
            is_system_flag = True
        else:
            # Пользовательские ключи никогда не помечаются системными через этот API.
            is_system_flag = False
            if opts.is_system:
                return err_result(
                    ERR_VALIDATION,
                    "флаг is_system допустим только для зарезервированных системных ключей",
                )

        row = CtorBotVariableDefinition(
            bot_id=bot_id,
            key=key.strip(),
            label=opts.label,
            data_type=opts.data_type,
            scope=opts.scope,
            description=opts.description,
            is_system=is_system_flag,
        )
        self._repo.add_definition(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        return ok_result(row)

    def get_user_variables(self, bot_user_id: int) -> ServiceResult[List[UserVariableView]]:
        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")
        rows = self._repo.list_definitions_with_values_for_bot_user(bu.bot_id, bot_user_id)
        out: List[UserVariableView] = []
        for defin, val in rows:
            out.append(
                UserVariableView(
                    key=defin.key,
                    definition_id=defin.id,
                    data_type=defin.data_type,
                    scope=defin.scope,
                    is_system=defin.is_system,
                    value_text=val.value_text if val else None,
                    value_number=val.value_number if val else None,
                    value_boolean=val.value_boolean if val else None,
                    value_date=val.value_date if val else None,
                    value_json=val.value_json if val else None,
                )
            )
        return ok_result(out)

    def get_user_variable_by_key(
        self, bot_user_id: int, key: str
    ) -> ServiceResult[Optional[UserVariableView]]:
        v = self.validate_variable_key(key)
        if not v.ok:
            return v  # type: ignore[return-value]

        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")

        defin = self._repo.get_definition_by_bot_and_key(bu.bot_id, key.strip())
        if not defin:
            return ok_result(None)

        val = self._repo.get_user_value_by_definition(bot_user_id, defin.id)
        if not val:
            return ok_result(
                UserVariableView(
                    key=defin.key,
                    definition_id=defin.id,
                    data_type=defin.data_type,
                    scope=defin.scope,
                    is_system=defin.is_system,
                )
            )
        return ok_result(
            UserVariableView(
                key=defin.key,
                definition_id=defin.id,
                data_type=defin.data_type,
                scope=defin.scope,
                is_system=defin.is_system,
                value_text=val.value_text,
                value_number=val.value_number,
                value_boolean=val.value_boolean,
                value_date=val.value_date,
                value_json=val.value_json,
            )
        )

    def set_user_variable(
        self,
        bot_user_id: int,
        key: str,
        value: Any,
        *,
        commit: bool = True,
    ) -> ServiceResult[UserVariableView]:
        v = self.validate_variable_key(key)
        if not v.ok:
            return v  # type: ignore[return-value]

        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")

        k = key.strip()
        defin = self._repo.get_definition_by_bot_and_key(bu.bot_id, k)
        if defin is None:
            if is_system_variable_key(k):
                return err_result(
                    ERR_DEFINITION,
                    "определение системной переменной отсутствует: сначала сид или ensure_variable_definition",
                )
            created = self.ensure_variable_definition(
                bu.bot_id,
                k,
                VariableDefinitionOptions(),
                commit=False,
            )
            if not created.ok or created.data is None:
                return created  # type: ignore[return-value]
            defin = created.data

        packed = normalize_for_definition(defin.data_type, value)
        if not packed.ok:
            return packed  # type: ignore[return-value]

        vt, vn, vb, vd, vj = packed.data
        existing = self._repo.get_user_value_by_definition(bot_user_id, defin.id)
        changed = (
            existing is None
            or existing.value_text != vt
            or existing.value_number != vn
            or existing.value_boolean != vb
            or existing.value_date != vd
            or existing.value_json != vj
        )

        if not changed and existing is not None:
            return ok_result(
                UserVariableView(
                    key=defin.key,
                    definition_id=defin.id,
                    data_type=defin.data_type,
                    scope=defin.scope,
                    is_system=defin.is_system,
                    value_text=existing.value_text,
                    value_number=existing.value_number,
                    value_boolean=existing.value_boolean,
                    value_date=existing.value_date,
                    value_json=existing.value_json,
                )
            )

        row = self._repo.upsert_user_variable(
            bot_user_id,
            defin.id,
            value_text=vt,
            value_number=vn,
            value_boolean=vb,
            value_date=vd,
            value_json=vj,
        )

        self._events.log_event(
            LogEventInput(
                bot_id=bu.bot_id,
                bot_user_id=bot_user_id,
                event_type="variable_set",
                payload_json={
                    "key": k,
                    "definition_id": defin.id,
                    "data_type": defin.data_type,
                },
                session_id=None,
                scenario_id=None,
            ),
            commit=False,
        )

        if commit:
            self.db.commit()
            self.db.refresh(row)
            mark_crm_overview_dirty(bu.bot_id, bu.environment)

        return ok_result(
            UserVariableView(
                key=defin.key,
                definition_id=defin.id,
                data_type=defin.data_type,
                scope=defin.scope,
                is_system=defin.is_system,
                value_text=row.value_text,
                value_number=row.value_number,
                value_boolean=row.value_boolean,
                value_date=row.value_date,
                value_json=row.value_json,
            )
        )

    def set_many_user_variables(
        self,
        bot_user_id: int,
        record: Mapping[str, Any],
        *,
        commit: bool = True,
    ) -> ServiceResult[List[UserVariableView]]:
        if not isinstance(record, Mapping):
            return err_result(ERR_VALIDATION, "record должен быть объектом ключ→значение")

        results: List[UserVariableView] = []
        try:
            for k, val in record.items():
                r = self.set_user_variable(bot_user_id, str(k), val, commit=False)
                if not r.ok:
                    self.db.rollback()
                    return r  # type: ignore[return-value]
                if r.data is not None:
                    results.append(r.data)
            if commit:
                self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return ok_result(results)
