"""add processed_updates table (dedup webhook by bot_id, channel, message_id)

Revision ID: processed_updates_009
Revises: bot_channel_008
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "processed_updates_009"
down_revision = "bot_channel_008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processed_updates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("message_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bot_id", "channel", "message_id", name="uq_processed_updates_bot_channel_message"),
    )
    op.create_index(op.f("ix_processed_updates_bot_id"), "processed_updates", ["bot_id"], unique=False)
    op.create_index(op.f("ix_processed_updates_channel"), "processed_updates", ["channel"], unique=False)
    op.create_index(op.f("ix_processed_updates_message_id"), "processed_updates", ["message_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_processed_updates_message_id"), table_name="processed_updates")
    op.drop_index(op.f("ix_processed_updates_channel"), table_name="processed_updates")
    op.drop_index(op.f("ix_processed_updates_bot_id"), table_name="processed_updates")
    op.drop_table("processed_updates")
