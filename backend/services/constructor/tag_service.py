"""Теги ctor_bot_tags / ctor_bot_user_tags."""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotTag
from backend.services.constructor.dto import LogEventInput, TagDefinitionOptions, TagView
from backend.services.constructor.event_log_service import EventLogService
from backend.services.constructor.repositories.ctor_tags_repository import CtorTagsRepository
from backend.services.constructor.types import (
    ERR_NOT_FOUND,
    ERR_VALIDATION,
    ServiceResult,
    err_result,
    ok_result,
)
from backend.services.constructor.validation import validate_snake_case_key


class TagService:
    def __init__(self, db: Session):
        self.db = db
        self._repo = CtorTagsRepository(db)
        self._events = EventLogService(db)

    def ensure_tag_definition(
        self,
        bot_id: int,
        tag_key: str,
        options: TagDefinitionOptions | None = None,
        *,
        commit: bool = False,
    ) -> ServiceResult[CtorBotTag]:
        msg = validate_snake_case_key(tag_key)
        if msg:
            return err_result(ERR_VALIDATION, msg)
        k = tag_key.strip()
        existing = self._repo.get_tag_by_bot_and_key(bot_id, k)
        if existing:
            return ok_result(existing)
        opts = options or TagDefinitionOptions()
        row = CtorBotTag(
            bot_id=bot_id,
            key=k,
            label=opts.label,
            color=opts.color,
            description=opts.description,
        )
        self._repo.add_tag_definition(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        return ok_result(row)

    def get_user_tags(self, bot_user_id: int) -> ServiceResult[List[TagView]]:
        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")
        rows = self._repo.list_user_tags(bot_user_id)
        out = [
            TagView(id=tag.id, key=tag.key, label=tag.label, color=tag.color)
            for _, tag in rows
        ]
        return ok_result(out)

    def add_tag_to_user(
        self,
        bot_user_id: int,
        tag_key: str,
        *,
        assigned_by: Optional[str] = None,
        commit: bool = True,
    ) -> ServiceResult[TagView]:
        msg = validate_snake_case_key(tag_key)
        if msg:
            return err_result(ERR_VALIDATION, msg)

        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")

        ensured = self.ensure_tag_definition(
            bu.bot_id, tag_key, TagDefinitionOptions(), commit=False
        )
        if not ensured.ok or ensured.data is None:
            return ensured  # type: ignore[return-value]
        tag = ensured.data

        existing_link = self._repo.get_user_tag_link(bot_user_id, tag.id)
        if existing_link:
            view = TagView(id=tag.id, key=tag.key, label=tag.label, color=tag.color)
            if commit:
                self.db.commit()
            return ok_result(view)

        self._repo.add_user_tag(bot_user_id, tag.id, assigned_by=assigned_by)
        self._events.log_event(
            LogEventInput(
                bot_id=bu.bot_id,
                bot_user_id=bot_user_id,
                event_type="tag_added",
                payload_json={"tag_key": tag.key, "tag_id": tag.id},
            ),
            commit=False,
        )
        if commit:
            self.db.commit()
        return ok_result(TagView(id=tag.id, key=tag.key, label=tag.label, color=tag.color))

    def remove_tag_from_user(
        self,
        bot_user_id: int,
        tag_key: str,
        *,
        commit: bool = True,
    ) -> ServiceResult[None]:
        msg = validate_snake_case_key(tag_key)
        if msg:
            return err_result(ERR_VALIDATION, msg)

        bu = self._repo.get_bot_user(bot_user_id)
        if not bu:
            return err_result(ERR_NOT_FOUND, "ctor_bot_user не найден")

        tag = self._repo.get_tag_by_bot_and_key(bu.bot_id, tag_key.strip())
        if not tag:
            return err_result(ERR_NOT_FOUND, "тег с таким ключом не определён для бота")

        link = self._repo.get_user_tag_link(bot_user_id, tag.id)
        if not link:
            return err_result(ERR_NOT_FOUND, "у пользователя нет этого тега")

        self._repo.delete_user_tag(link)
        self._events.log_event(
            LogEventInput(
                bot_id=bu.bot_id,
                bot_user_id=bot_user_id,
                event_type="tag_removed",
                payload_json={"tag_key": tag.key, "tag_id": tag.id},
            ),
            commit=False,
        )
        if commit:
            self.db.commit()
        return ok_result(None)
