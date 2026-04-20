"""Доступ к ctor_bot_tags и ctor_bot_user_tags."""

from __future__ import annotations

from typing import List, Literal, Optional, Sequence

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotTag, CtorBotUser, CtorBotUserTag

TagCountEnvironment = Optional[Literal["dev", "prod", "all"]]


class CtorTagsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_bot_user(self, bot_user_id: int) -> Optional[CtorBotUser]:
        return self.db.query(CtorBotUser).filter(CtorBotUser.id == bot_user_id).first()

    def get_tag_by_bot_and_key(self, bot_id: int, key: str) -> Optional[CtorBotTag]:
        return (
            self.db.query(CtorBotTag)
            .filter(CtorBotTag.bot_id == bot_id, CtorBotTag.key == key)
            .first()
        )

    def get_tag_by_id(self, tag_id: int) -> Optional[CtorBotTag]:
        return self.db.query(CtorBotTag).filter(CtorBotTag.id == tag_id).first()

    def list_tags_for_bot(self, bot_id: int) -> List[CtorBotTag]:
        return (
            self.db.query(CtorBotTag)
            .filter(CtorBotTag.bot_id == bot_id)
            .order_by(CtorBotTag.key)
            .all()
        )

    def count_users_for_tag(
        self,
        tag_id: int,
        *,
        environment: TagCountEnvironment = None,
    ) -> int:
        """
        Число назначений тега. По умолчанию — по всем средам (для удаления и т.п.).
        При environment dev|prod — только контакты этой среды.
        """
        q = self.db.query(CtorBotUserTag).filter(CtorBotUserTag.tag_id == tag_id)
        if environment in ("dev", "prod"):
            q = q.join(CtorBotUser, CtorBotUser.id == CtorBotUserTag.bot_user_id).filter(
                CtorBotUser.environment == environment
            )
        return q.count()

    def delete_tag_row(self, row: CtorBotTag) -> None:
        self.db.delete(row)
        self.db.flush()

    def add_tag_definition(self, row: CtorBotTag) -> CtorBotTag:
        self.db.add(row)
        self.db.flush()
        return row

    def list_user_tags(self, bot_user_id: int) -> Sequence[tuple[CtorBotUserTag, CtorBotTag]]:
        return (
            self.db.query(CtorBotUserTag, CtorBotTag)
            .join(CtorBotTag, CtorBotUserTag.tag_id == CtorBotTag.id)
            .filter(CtorBotUserTag.bot_user_id == bot_user_id)
            .order_by(CtorBotTag.key)
            .all()
        )

    def get_user_tag_link(
        self, bot_user_id: int, tag_id: int
    ) -> Optional[CtorBotUserTag]:
        return (
            self.db.query(CtorBotUserTag)
            .filter(
                CtorBotUserTag.bot_user_id == bot_user_id,
                CtorBotUserTag.tag_id == tag_id,
            )
            .first()
        )

    def add_user_tag(
        self,
        bot_user_id: int,
        tag_id: int,
        *,
        assigned_by: Optional[str] = None,
    ) -> CtorBotUserTag:
        row = CtorBotUserTag(
            bot_user_id=bot_user_id,
            tag_id=tag_id,
            assigned_by=assigned_by,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def delete_user_tag(self, link: CtorBotUserTag) -> None:
        self.db.delete(link)
        self.db.flush()
