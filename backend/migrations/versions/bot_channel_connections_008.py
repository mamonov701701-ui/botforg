"""add bot_channel_connections table (channel connectors)

Revision ID: bot_channel_008
Revises: users_public_id_007
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "bot_channel_008"
down_revision = "users_public_id_007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bot_channel_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("credentials_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bot_channel_connections_bot_id"), "bot_channel_connections", ["bot_id"], unique=False)
    op.create_index(op.f("ix_bot_channel_connections_channel"), "bot_channel_connections", ["channel"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bot_channel_connections_channel"), table_name="bot_channel_connections")
    op.drop_index(op.f("ix_bot_channel_connections_bot_id"), table_name="bot_channel_connections")
    op.drop_table("bot_channel_connections")
