"""
Реляционное ядро конструктора сценариев (отдельный контур от JSON-полей в bots/scenarios).

Имена таблиц с префиксом ctor_ не пересекаются с существующими bots, scenarios, bot_tags.

Соответствие ТЗ (логические имена → таблица):
  platform_users, ctor_bots («bots»), ctor_bot_users («bot_users»), ctor_scenarios («scenarios»),
  ctor_blocks («blocks»), ctor_block_edges («block_edges»), далее по префиксу ctor_.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PlatformUser(Base):
    __tablename__ = "platform_users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    owned_bots = relationship(
        "CtorBot",
        back_populates="owner",
        foreign_keys="CtorBot.owner_id",
        cascade="all, delete-orphan",
    )


class CtorBot(Base):
    """Бот в модели конструктора (не путать с таблицей bots — интеграционные токены и т.д.)."""

    __tablename__ = "ctor_bots"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_ctor_bots_slug"),
        Index("ix_ctor_bots_owner_id", "owner_id"),
        Index("ix_ctor_bots_status", "status"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("platform_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(String(255), nullable=False)
    slug = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    owner = relationship("PlatformUser", back_populates="owned_bots")
    scenarios = relationship(
        "CtorScenario",
        back_populates="bot",
        cascade="all, delete-orphan",
    )
    bot_users = relationship(
        "CtorBotUser",
        back_populates="bot",
        cascade="all, delete-orphan",
    )
    variable_definitions = relationship(
        "CtorBotVariableDefinition",
        back_populates="bot",
        cascade="all, delete-orphan",
    )
    tags = relationship(
        "CtorBotTag",
        back_populates="bot",
        cascade="all, delete-orphan",
    )
    events = relationship(
        "CtorBotUserEvent",
        back_populates="bot",
        cascade="all, delete-orphan",
    )


class CtorBotUser(Base):
    __tablename__ = "ctor_bot_users"
    __table_args__ = (
        UniqueConstraint(
            "bot_id",
            "environment",
            "channel",
            "external_user_id",
            name="uq_ctor_bot_users_bot_env_channel_external",
        ),
        Index("ix_ctor_bot_users_bot_id", "bot_id"),
        Index("ix_ctor_bot_users_bot_env", "bot_id", "environment"),
        Index("ix_ctor_bot_users_last_message_at", "last_message_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    environment = Column(String(16), nullable=False, default="prod", server_default="prod")
    channel = Column(String(32), nullable=False)
    external_user_id = Column(String(191), nullable=False)
    username = Column(String(255), nullable=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True)
    language_code = Column(String(32), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot = relationship("CtorBot", back_populates="bot_users")
    variables = relationship(
        "CtorBotUserVariable",
        back_populates="bot_user",
        cascade="all, delete-orphan",
    )
    tag_links = relationship(
        "CtorBotUserTag",
        back_populates="bot_user",
        cascade="all, delete-orphan",
    )
    sessions = relationship(
        "CtorBotUserSession",
        back_populates="bot_user",
        cascade="all, delete-orphan",
    )
    events = relationship(
        "CtorBotUserEvent",
        back_populates="bot_user",
        cascade="all, delete-orphan",
    )


class CtorScenario(Base):
    __tablename__ = "ctor_scenarios"
    __table_args__ = (
        Index("ix_ctor_scenarios_bot_id", "bot_id"),
        Index("ix_ctor_scenarios_is_active", "is_active"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    # FK на ctor_blocks добавляется миграцией после создания ctor_blocks (цикл scenario↔block).
    entry_block_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot = relationship("CtorBot", back_populates="scenarios")
    blocks = relationship(
        "CtorBlock",
        back_populates="scenario",
        foreign_keys="CtorBlock.scenario_id",
        cascade="all, delete-orphan",
    )
    edges = relationship(
        "CtorBlockEdge",
        back_populates="scenario",
        cascade="all, delete-orphan",
    )


class CtorBlock(Base):
    __tablename__ = "ctor_blocks"
    __table_args__ = (
        Index("ix_ctor_blocks_scenario_id", "scenario_id"),
        Index("ix_ctor_blocks_type", "type"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(
        Integer,
        ForeignKey("ctor_scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    type = Column(String(64), nullable=False)
    name = Column(String(255), nullable=True)
    settings_json = Column(JSON, nullable=True)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    scenario = relationship(
        "CtorScenario",
        back_populates="blocks",
        foreign_keys=[scenario_id],
    )
    outgoing_edges = relationship(
        "CtorBlockEdge",
        foreign_keys="CtorBlockEdge.source_block_id",
        back_populates="source_block",
    )
    incoming_edges = relationship(
        "CtorBlockEdge",
        foreign_keys="CtorBlockEdge.target_block_id",
        back_populates="target_block",
    )


class CtorBlockEdge(Base):
    __tablename__ = "ctor_block_edges"
    __table_args__ = (
        Index("ix_ctor_block_edges_scenario_id", "scenario_id"),
        Index("ix_ctor_block_edges_source", "source_block_id"),
        Index("ix_ctor_block_edges_target", "target_block_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(
        Integer,
        ForeignKey("ctor_scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_block_id = Column(
        Integer,
        ForeignKey("ctor_blocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_block_id = Column(
        Integer,
        ForeignKey("ctor_blocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    handle_key = Column(String(128), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    scenario = relationship("CtorScenario", back_populates="edges")
    source_block = relationship(
        "CtorBlock",
        foreign_keys=[source_block_id],
        back_populates="outgoing_edges",
    )
    target_block = relationship(
        "CtorBlock",
        foreign_keys=[target_block_id],
        back_populates="incoming_edges",
    )


class CtorBotVariableDefinition(Base):
    __tablename__ = "ctor_bot_variable_definitions"
    __table_args__ = (
        UniqueConstraint("bot_id", "key", name="uq_ctor_bot_var_def_bot_key"),
        Index("ix_ctor_bot_var_def_bot_id", "bot_id"),
        Index("ix_ctor_bot_var_def_archived", "bot_id", "is_archived"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    key = Column(String(128), nullable=False)
    label = Column(String(255), nullable=True)
    data_type = Column(String(32), nullable=False, default="string")
    scope = Column(String(32), nullable=False, default="session")
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot = relationship("CtorBot", back_populates="variable_definitions")
    user_values = relationship(
        "CtorBotUserVariable",
        back_populates="variable_definition",
        cascade="all, delete-orphan",
    )


class CtorBotUserVariable(Base):
    __tablename__ = "ctor_bot_user_variables"
    __table_args__ = (
        UniqueConstraint(
            "bot_user_id",
            "variable_definition_id",
            name="uq_ctor_bot_user_var_user_def",
        ),
        Index("ix_ctor_bot_user_var_bot_user", "bot_user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_user_id = Column(
        Integer,
        ForeignKey("ctor_bot_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    variable_definition_id = Column(
        Integer,
        ForeignKey("ctor_bot_variable_definitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    value_text = Column(Text, nullable=True)
    value_number = Column(Numeric(24, 8), nullable=True)
    value_boolean = Column(Boolean, nullable=True)
    value_date = Column(DateTime(timezone=True), nullable=True)
    value_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot_user = relationship("CtorBotUser", back_populates="variables")
    variable_definition = relationship(
        "CtorBotVariableDefinition",
        back_populates="user_values",
    )


class CtorBotTag(Base):
    __tablename__ = "ctor_bot_tags"
    __table_args__ = (
        UniqueConstraint("bot_id", "key", name="uq_ctor_bot_tags_bot_key"),
        Index("ix_ctor_bot_tags_bot_id", "bot_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    key = Column(String(128), nullable=False)
    label = Column(String(255), nullable=True)
    color = Column(String(32), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot = relationship("CtorBot", back_populates="tags")
    user_links = relationship(
        "CtorBotUserTag",
        back_populates="tag",
        cascade="all, delete-orphan",
    )


class CtorBotUserTag(Base):
    __tablename__ = "ctor_bot_user_tags"
    __table_args__ = (
        UniqueConstraint("bot_user_id", "tag_id", name="uq_ctor_bot_user_tags_user_tag"),
        Index("ix_ctor_bot_user_tags_bot_user", "bot_user_id"),
        Index("ix_ctor_bot_user_tags_tag", "tag_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_user_id = Column(
        Integer,
        ForeignKey("ctor_bot_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_id = Column(
        Integer,
        ForeignKey("ctor_bot_tags.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_by = Column(String(128), nullable=True)
    assigned_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    bot_user = relationship("CtorBotUser", back_populates="tag_links")
    tag = relationship("CtorBotTag", back_populates="user_links")


class CtorBotUserSession(Base):
    __tablename__ = "ctor_bot_user_sessions"
    __table_args__ = (
        Index("ix_ctor_bot_user_sessions_bot_user", "bot_user_id"),
        Index("ix_ctor_bot_user_sessions_scenario", "scenario_id"),
        Index("ix_ctor_bot_user_sessions_status", "status"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_user_id = Column(
        Integer,
        ForeignKey("ctor_bot_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    scenario_id = Column(
        Integer,
        ForeignKey("ctor_scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_block_id = Column(
        Integer,
        ForeignKey("ctor_blocks.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String(32), nullable=False, default="active")
    last_input_at = Column(DateTime(timezone=True), nullable=True)
    context_json = Column(JSON, nullable=True)
    started_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    bot_user = relationship("CtorBotUser", back_populates="sessions")
    scenario = relationship("CtorScenario")
    current_block = relationship("CtorBlock", foreign_keys=[current_block_id])
    events = relationship(
        "CtorBotUserEvent",
        back_populates="session",
        foreign_keys="CtorBotUserEvent.session_id",
    )


class CtorBotUserEvent(Base):
    __tablename__ = "ctor_bot_user_events"
    __table_args__ = (
        Index("ix_ctor_bot_user_events_bot_id", "bot_id"),
        Index("ix_ctor_bot_user_events_bot_user", "bot_user_id"),
        Index("ix_ctor_bot_user_events_session", "session_id"),
        Index("ix_ctor_bot_user_events_scenario", "scenario_id"),
        Index("ix_ctor_bot_user_events_block", "block_id"),
        Index("ix_ctor_bot_user_events_created", "created_at"),
        Index("ix_ctor_bot_user_events_type", "event_type"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    bot_user_id = Column(
        Integer,
        ForeignKey("ctor_bot_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id = Column(
        Integer,
        ForeignKey("ctor_bot_user_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    scenario_id = Column(
        Integer,
        ForeignKey("ctor_scenarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    block_id = Column(
        Integer,
        ForeignKey("ctor_blocks.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    bot = relationship("CtorBot", back_populates="events")
    bot_user = relationship("CtorBotUser", back_populates="events")
    session = relationship(
        "CtorBotUserSession",
        back_populates="events",
        foreign_keys=[session_id],
    )


class CtorCrmOverviewAggregate(Base):
    __tablename__ = "ctor_crm_overview_aggregates"
    __table_args__ = (
        UniqueConstraint(
            "bot_id",
            "environment",
            name="uq_ctor_crm_overview_aggregates_bot_env",
        ),
        Index("ix_ctor_crm_overview_aggregates_bot_env", "bot_id", "environment"),
        Index("ix_ctor_crm_overview_aggregates_computed_at", "computed_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(
        Integer,
        ForeignKey("ctor_bots.id", ondelete="CASCADE"),
        nullable=False,
    )
    environment = Column(String(16), nullable=False, default="prod", server_default="prod")
    payload_json = Column(JSON, nullable=False)
    computed_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
