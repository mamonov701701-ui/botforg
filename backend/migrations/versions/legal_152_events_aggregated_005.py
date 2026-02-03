"""add channel, chat_hash, node_id to events (aggregated-only storage)

Revision ID: legal_152_005
Revises: legal_152_004
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_005"
down_revision = "legal_152_004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("channel", sa.String(50), nullable=True))
    op.add_column("events", sa.Column("chat_hash", sa.String(64), nullable=True))
    op.add_column("events", sa.Column("node_id", sa.String(100), nullable=True))
    op.create_index(op.f("ix_events_channel"), "events", ["channel"], unique=False)
    op.create_index(op.f("ix_events_chat_hash"), "events", ["chat_hash"], unique=False)
    op.create_index(op.f("ix_events_node_id"), "events", ["node_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_events_node_id"), table_name="events")
    op.drop_index(op.f("ix_events_chat_hash"), table_name="events")
    op.drop_index(op.f("ix_events_channel"), table_name="events")
    op.drop_column("events", "node_id")
    op.drop_column("events", "chat_hash")
    op.drop_column("events", "channel")
