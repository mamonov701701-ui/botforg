"""add user_settings table for dashboard settings

Revision ID: user_settings_001
Revises: marketplace_tables_001
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa


revision = "user_settings_001"
down_revision = "marketplace_tables_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=True),
        sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("interface_settings", sa.JSON(), nullable=True),
        sa.Column("notification_settings", sa.JSON(), nullable=True),
        sa.Column("agent_settings", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_user_settings_id"), "user_settings", ["id"], unique=False)
    op.create_index(op.f("ix_user_settings_user_id"), "user_settings", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_settings_user_id"), table_name="user_settings")
    op.drop_index(op.f("ix_user_settings_id"), table_name="user_settings")
    op.drop_table("user_settings")
