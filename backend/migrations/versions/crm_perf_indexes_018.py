"""CRM production indexes, search and aggregate snapshot table"""

from alembic import op
import sqlalchemy as sa


revision = "crm_perf_indexes_018"
down_revision = "ctor_user_environment_017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_ctor_bot_users_bot_env_created_at",
        "ctor_bot_users",
        ["bot_id", "environment", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_users_bot_env_status",
        "ctor_bot_users",
        ["bot_id", "environment", "status"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_users_bot_env_last_message_at",
        "ctor_bot_users",
        ["bot_id", "environment", "last_message_at"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_sessions_bot_user_updated_at",
        "ctor_bot_user_sessions",
        ["bot_user_id", "updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_variables_bot_user_def",
        "ctor_bot_user_variables",
        ["bot_user_id", "variable_definition_id"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_bot_user_tags_tag_user",
        "ctor_bot_user_tags",
        ["tag_id", "bot_user_id"],
        unique=False,
    )
    op.create_table(
        "ctor_crm_overview_aggregates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("environment", sa.String(length=16), nullable=False, server_default="prod"),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["bot_id"], ["ctor_bots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "bot_id",
            "environment",
            name="uq_ctor_crm_overview_aggregates_bot_env",
        ),
    )
    op.create_index(
        "ix_ctor_crm_overview_aggregates_bot_env",
        "ctor_crm_overview_aggregates",
        ["bot_id", "environment"],
        unique=False,
    )
    op.create_index(
        "ix_ctor_crm_overview_aggregates_computed_at",
        "ctor_crm_overview_aggregates",
        ["computed_at"],
        unique=False,
    )
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_ctor_bot_users_search_trgm
            ON ctor_bot_users
            USING gin (
                lower(
                    coalesce(first_name, '') || ' ' ||
                    coalesce(last_name, '') || ' ' ||
                    coalesce(username, '') || ' ' ||
                    coalesce(phone, '') || ' ' ||
                    coalesce(email, '') || ' ' ||
                    coalesce(external_user_id, '')
                ) gin_trgm_ops
            )
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_ctor_bot_users_search_trgm")
    op.drop_index(
        "ix_ctor_crm_overview_aggregates_computed_at",
        table_name="ctor_crm_overview_aggregates",
    )
    op.drop_index(
        "ix_ctor_crm_overview_aggregates_bot_env",
        table_name="ctor_crm_overview_aggregates",
    )
    op.drop_table("ctor_crm_overview_aggregates")
    op.drop_index("ix_ctor_bot_user_tags_tag_user", table_name="ctor_bot_user_tags")
    op.drop_index(
        "ix_ctor_bot_user_variables_bot_user_def", table_name="ctor_bot_user_variables"
    )
    op.drop_index(
        "ix_ctor_bot_user_sessions_bot_user_updated_at", table_name="ctor_bot_user_sessions"
    )
    op.drop_index(
        "ix_ctor_bot_users_bot_env_last_message_at", table_name="ctor_bot_users"
    )
    op.drop_index("ix_ctor_bot_users_bot_env_status", table_name="ctor_bot_users")
    op.drop_index("ix_ctor_bot_users_bot_env_created_at", table_name="ctor_bot_users")
