"""
Add checkout_intents table for pending tariff/addon purchase intents (stage 6.5).

Does not create payments, subscriptions, or entitlements.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "checkout_intents_021"
down_revision = "tariff_system_007"
branch_labels = None
depends_on = None


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "checkout_intents" in insp.get_table_names():
        return

    op.create_table(
        "checkout_intents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_type", sa.String(32), nullable=False),
        sa.Column("product_code", sa.String(64), nullable=False),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=_timestamp_server_default(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=_timestamp_server_default(),
        ),
        sa.UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_checkout_intents_user_idempotency",
        ),
    )
    op.create_index("ix_checkout_intents_user_id", "checkout_intents", ["user_id"])
    op.create_index("ix_checkout_intents_status", "checkout_intents", ["status"])
    op.create_index(
        "ix_checkout_intents_product",
        "checkout_intents",
        ["product_type", "product_code"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "checkout_intents" not in insp.get_table_names():
        return
    op.drop_index("ix_checkout_intents_product", table_name="checkout_intents")
    op.drop_index("ix_checkout_intents_status", table_name="checkout_intents")
    op.drop_index("ix_checkout_intents_user_id", table_name="checkout_intents")
    op.drop_table("checkout_intents")
