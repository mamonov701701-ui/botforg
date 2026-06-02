"""constructor core: platform_users, ctor_* relational scenario graph and user state

Revision ID: constructor_core_015
Revises: market_moderation_014
Create Date: 2026-03-31

Таблицы ctor_* не пересекают имена с существующими bots, scenarios, bot_tags.
Логическое «bots» ТЗ = ctor_bots, «scenarios» = ctor_scenarios и т.д.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "constructor_core_015"
down_revision: Union[str, Sequence[str], None] = "market_moderation_014"
branch_labels = None
depends_on = None


def _boolean_server_default_true():
    if op.get_bind().dialect.name == "postgresql":
        return sa.text("true")
    return sa.text("1")


def _boolean_server_default_false():
    if op.get_bind().dialect.name == "postgresql":
        return sa.text("false")
    return sa.text("0")


def upgrade() -> None:
    op.create_table(
        "platform_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_platform_users_id", "platform_users", ["id"], unique=False)
    op.create_index("ix_platform_users_email", "platform_users", ["email"], unique=True)

    op.create_table(
        "ctor_bots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["platform_users.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("slug", name="uq_ctor_bots_slug"),
    )
    op.create_index("ix_ctor_bots_id", "ctor_bots", ["id"], unique=False)
    op.create_index("ix_ctor_bots_owner_id", "ctor_bots", ["owner_id"], unique=False)
    op.create_index("ix_ctor_bots_status", "ctor_bots", ["status"], unique=False)

    op.create_table(
        "ctor_scenarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=_boolean_server_default_true(),
        ),
        sa.Column("entry_block_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_id"],
            ["ctor_bots.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_ctor_scenarios_id", "ctor_scenarios", ["id"], unique=False)
    op.create_index("ix_ctor_scenarios_bot_id", "ctor_scenarios", ["bot_id"], unique=False)
    op.create_index(
        "ix_ctor_scenarios_is_active", "ctor_scenarios", ["is_active"], unique=False
    )

    op.create_table(
        "ctor_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scenario_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("settings_json", sa.JSON(), nullable=True),
        sa.Column("position_x", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("position_y", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["ctor_scenarios.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_ctor_blocks_id", "ctor_blocks", ["id"], unique=False)
    op.create_index("ix_ctor_blocks_scenario_id", "ctor_blocks", ["scenario_id"], unique=False)
    op.create_index("ix_ctor_blocks_type", "ctor_blocks", ["type"], unique=False)

    with op.batch_alter_table("ctor_scenarios") as batch:
        batch.create_foreign_key(
            "fk_ctor_scenarios_entry_block_id",
            "ctor_blocks",
            ["entry_block_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "ctor_block_edges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scenario_id", sa.Integer(), nullable=False),
        sa.Column("source_block_id", sa.Integer(), nullable=False),
        sa.Column("target_block_id", sa.Integer(), nullable=False),
        sa.Column("handle_key", sa.String(length=128), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["ctor_scenarios.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_block_id"],
            ["ctor_blocks.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_block_id"],
            ["ctor_blocks.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_ctor_block_edges_id", "ctor_block_edges", ["id"], unique=False)
    op.create_index(
        "ix_ctor_block_edges_scenario_id",
        "ctor_block_edges",
        ["scenario_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_block_edges_source",
        "ctor_block_edges",
        ["source_block_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_block_edges_target",
        "ctor_block_edges",
        ["target_block_id"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_variable_definitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("data_type", sa.String(length=32), nullable=False, server_default="string"),
        sa.Column("scope", sa.String(length=32), nullable=False, server_default="session"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=_boolean_server_default_false(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_id"],
            ["ctor_bots.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("bot_id", "key", name="uq_ctor_bot_var_def_bot_key"),
    )
    op.create_index(
        "ix_ctor_bot_variable_definitions_id",
        "ctor_bot_variable_definitions",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_var_def_bot_id",
        "ctor_bot_variable_definitions",
        ["bot_id"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_id"],
            ["ctor_bots.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("bot_id", "key", name="uq_ctor_bot_tags_bot_key"),
    )
    op.create_index("ix_ctor_bot_tags_id", "ctor_bot_tags", ["id"], unique=False)
    op.create_index("ix_ctor_bot_tags_bot_id", "ctor_bot_tags", ["bot_id"], unique=False)

    op.create_table(
        "ctor_bot_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("external_user_id", sa.String(length=191), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("language_code", sa.String(length=32), nullable=True),
        sa.Column("avatar_url", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_id"],
            ["ctor_bots.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "bot_id",
            "channel",
            "external_user_id",
            name="uq_ctor_bot_users_bot_channel_external",
        ),
    )
    op.create_index("ix_ctor_bot_users_id", "ctor_bot_users", ["id"], unique=False)
    op.create_index("ix_ctor_bot_users_bot_id", "ctor_bot_users", ["bot_id"], unique=False)
    op.create_index(
        "ix_ctor_bot_users_last_message_at",
        "ctor_bot_users",
        ["last_message_at"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_user_variables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_user_id", sa.Integer(), nullable=False),
        sa.Column("variable_definition_id", sa.Integer(), nullable=False),
        sa.Column("value_text", sa.Text(), nullable=True),
        sa.Column("value_number", sa.Numeric(24, 8), nullable=True),
        sa.Column("value_boolean", sa.Boolean(), nullable=True),
        sa.Column("value_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("value_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_user_id"],
            ["ctor_bot_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["variable_definition_id"],
            ["ctor_bot_variable_definitions.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "bot_user_id",
            "variable_definition_id",
            name="uq_ctor_bot_user_var_user_def",
        ),
    )
    op.create_index(
        "ix_ctor_bot_user_variables_id",
        "ctor_bot_user_variables",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_var_bot_user",
        "ctor_bot_user_variables",
        ["bot_user_id"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_user_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_user_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by", sa.String(length=128), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_user_id"],
            ["ctor_bot_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["ctor_bot_tags.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "bot_user_id",
            "tag_id",
            name="uq_ctor_bot_user_tags_user_tag",
        ),
    )
    op.create_index("ix_ctor_bot_user_tags_id", "ctor_bot_user_tags", ["id"], unique=False)
    op.create_index(
        "ix_ctor_bot_user_tags_bot_user",
        "ctor_bot_user_tags",
        ["bot_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_tags_tag",
        "ctor_bot_user_tags",
        ["tag_id"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_user_id", sa.Integer(), nullable=False),
        sa.Column("scenario_id", sa.Integer(), nullable=False),
        sa.Column("current_block_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("last_input_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context_json", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_user_id"],
            ["ctor_bot_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["ctor_scenarios.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["current_block_id"],
            ["ctor_blocks.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_ctor_bot_user_sessions_id",
        "ctor_bot_user_sessions",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_sessions_bot_user",
        "ctor_bot_user_sessions",
        ["bot_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_sessions_scenario",
        "ctor_bot_user_sessions",
        ["scenario_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_sessions_status",
        "ctor_bot_user_sessions",
        ["status"],
        unique=False,
    )

    op.create_table(
        "ctor_bot_user_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("bot_user_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("scenario_id", sa.Integer(), nullable=True),
        sa.Column("block_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bot_id"],
            ["ctor_bots.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["bot_user_id"],
            ["ctor_bot_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ctor_bot_user_sessions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["ctor_scenarios.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["block_id"],
            ["ctor_blocks.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_ctor_bot_user_events_id",
        "ctor_bot_user_events",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_bot_id",
        "ctor_bot_user_events",
        ["bot_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_bot_user",
        "ctor_bot_user_events",
        ["bot_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_session",
        "ctor_bot_user_events",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_scenario",
        "ctor_bot_user_events",
        ["scenario_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_block",
        "ctor_bot_user_events",
        ["block_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_created",
        "ctor_bot_user_events",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_events_type",
        "ctor_bot_user_events",
        ["event_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("ctor_bot_user_events")
    op.drop_table("ctor_bot_user_sessions")
    op.drop_table("ctor_bot_user_tags")
    op.drop_table("ctor_bot_user_variables")
    op.drop_table("ctor_bot_users")

    with op.batch_alter_table("ctor_scenarios") as batch:
        batch.drop_constraint("fk_ctor_scenarios_entry_block_id", type_="foreignkey")

    op.drop_table("ctor_block_edges")
    op.drop_table("ctor_blocks")
    op.drop_table("ctor_bot_variable_definitions")
    op.drop_table("ctor_bot_tags")
    op.drop_table("ctor_scenarios")
    op.drop_table("ctor_bots")
    op.drop_table("platform_users")
