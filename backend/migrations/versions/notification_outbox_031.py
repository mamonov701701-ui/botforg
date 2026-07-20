"""
Stage 6.14.10B: notification_outbox table + indexes.

SQLite + PostgreSQL compatible. Unique idempotency_key.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "notification_outbox_031"
down_revision = "refund_audit_timeline_030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "notification_outbox" in tables:
        return

    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("notification_type", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("recipient_user_id", sa.Integer(), nullable=True),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("aggregate_type", sa.String(length=64), nullable=False),
        sa.Column("aggregate_id", sa.String(length=64), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("locked_by", sa.String(length=128), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipient_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_notification_outbox_idempotency"),
    )
    op.create_index(
        "ix_notification_outbox_id", "notification_outbox", ["id"], unique=False
    )
    op.create_index(
        "ix_notification_outbox_status_available",
        "notification_outbox",
        ["status", "available_at"],
        unique=False,
    )
    op.create_index(
        "ix_notification_outbox_status_locked",
        "notification_outbox",
        ["status", "locked_at"],
        unique=False,
    )
    op.create_index(
        "ix_notification_outbox_aggregate",
        "notification_outbox",
        ["aggregate_type", "aggregate_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_outbox_recipient_user",
        "notification_outbox",
        ["recipient_user_id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "notification_outbox" not in tables:
        return
    for name in (
        "ix_notification_outbox_recipient_user",
        "ix_notification_outbox_aggregate",
        "ix_notification_outbox_status_locked",
        "ix_notification_outbox_status_available",
        "ix_notification_outbox_id",
    ):
        existing = {ix["name"] for ix in insp.get_indexes("notification_outbox")}
        if name in existing:
            op.drop_index(name, table_name="notification_outbox")
    op.drop_table("notification_outbox")
