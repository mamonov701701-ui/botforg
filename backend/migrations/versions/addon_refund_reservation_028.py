"""
Stage 6.14.9A: addon refund unit reservations (reserved_units workflow).

SQLite + PostgreSQL compatible.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "addon_refund_reservation_028"
down_revision = "addon_fifo_ledger_027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "addon_refund_unit_reservations" not in tables:
        op.create_table(
            "addon_refund_unit_reservations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("refund_request_id", sa.Integer(), nullable=False),
            sa.Column("refund_revision_id", sa.Integer(), nullable=True),
            sa.Column("user_addon_id", sa.Integer(), nullable=False),
            sa.Column("units", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["refund_request_id"],
                ["refund_requests.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["refund_revision_id"],
                ["refund_revisions.id"],
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(
                ["user_addon_id"],
                ["user_addons.id"],
                ondelete="CASCADE",
            ),
            sa.UniqueConstraint(
                "refund_request_id",
                name="uq_addon_refund_unit_reservations_request",
            ),
        )
        op.create_index(
            "ix_addon_refund_reservations_user_addon_id",
            "addon_refund_unit_reservations",
            ["user_addon_id"],
        )
        op.create_index(
            "ix_addon_refund_reservations_status",
            "addon_refund_unit_reservations",
            ["status"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "addon_refund_unit_reservations" in tables:
        op.drop_table("addon_refund_unit_reservations")
