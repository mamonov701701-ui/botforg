"""Сервис: контекст из БД ctor_* + единый рендер."""

from __future__ import annotations

import logging
from typing import Any, Mapping, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotUserSession
from backend.services.constructor.repositories.ctor_variables_repository import (
    CtorVariablesRepository,
)
from backend.services.template_render.engine import render_template
from backend.services.template_render.serialize import stringify, stringify_map
from backend.services.template_render.types import TemplateContext, TemplateRenderResult

logger = logging.getLogger(__name__)

_PROFILE_FIELDS = (
    "first_name",
    "last_name",
    "username",
    "phone",
    "email",
    "language_code",
    "avatar_url",
    "status",
    "channel",
    "external_user_id",
)


class TemplateRenderService:
    def __init__(self, db: Session):
        self.db = db
        self._var_repo = CtorVariablesRepository(db)

    @staticmethod
    def build_context_from_flat(
        variables: Mapping[str, Any],
        *,
        last_user_input: Optional[str] = None,
        user_profile: Optional[Mapping[str, Any]] = None,
        system_extra: Optional[Mapping[str, Any]] = None,
    ) -> TemplateContext:
        """
        Контекст без БД: для legacy runtime, предпросмотра API или тестов.
        - variables: плоский словарь имя → значение (как variables в симуляторе).
        - last_user_input: кладётся в system.last_input.
        - user_profile: поля user.*.
        - system_extra: дополнительные ключи в system.
        """
        v = stringify_map(dict(variables))
        u = stringify_map(dict(user_profile or {}))
        s: dict[str, str] = {}
        if last_user_input is not None:
            s["last_input"] = stringify(last_user_input)
        if system_extra:
            s.update(stringify_map(dict(system_extra)))
        return TemplateContext(variables=v, user_profile=u, system=s)

    def build_template_context(
        self,
        bot_user_id: int,
        session_id: Optional[int] = None,
    ) -> TemplateContext:
        """
        Загружает ctor_bot_user, все определения переменных бота и значения,
        профиль user.*, system.* из системных определений + context_json сессии.
        """
        bu = self._var_repo.get_bot_user(bot_user_id)
        if not bu:
            logger.warning("TemplateRenderService: ctor_bot_user id=%s не найден", bot_user_id)
            return TemplateContext()

        user_profile_full: dict[str, str] = {}
        for k in _PROFILE_FIELDS:
            v = getattr(bu, k, None)
            if v is not None:
                user_profile_full[k] = stringify(v)

        rows = self._var_repo.list_definitions_with_values_for_bot_user(bu.bot_id, bot_user_id)
        variables: dict[str, str] = {}
        system_from_defs: dict[str, str] = {}

        for defin, val in rows:
            raw: Any = None
            if val is not None:
                if val.value_json is not None:
                    raw = val.value_json
                elif val.value_date is not None:
                    raw = val.value_date
                elif val.value_boolean is not None:
                    raw = val.value_boolean
                elif val.value_number is not None:
                    raw = val.value_number
                else:
                    raw = val.value_text
            sval = stringify(raw)
            variables[defin.key] = sval
            if defin.is_system:
                system_from_defs[defin.key] = sval

        system = dict(system_from_defs)
        if session_id is not None:
            sess = (
                self.db.query(CtorBotUserSession)
                .filter(
                    CtorBotUserSession.id == session_id,
                    CtorBotUserSession.bot_user_id == bot_user_id,
                )
                .first()
            )
            if sess and sess.context_json and isinstance(sess.context_json, dict):
                for k, v in sess.context_json.items():
                    if isinstance(k, str):
                        system[k] = stringify(v)

        return TemplateContext(
            variables=variables,
            user_profile=user_profile_full,
            system=system,
        )

    def render(self, template: str, context: TemplateContext) -> TemplateRenderResult:
        result = render_template(template, context)
        if result.missing_keys:
            logger.warning(
                "template render: missing keys %s in template snippet %.80r",
                result.missing_keys,
                template,
            )
        return result

    def render_for_user(
        self,
        bot_user_id: int,
        template: str,
        *,
        session_id: Optional[int] = None,
    ) -> TemplateRenderResult:
        ctx = self.build_template_context(bot_user_id, session_id=session_id)
        return self.render(template, ctx)
