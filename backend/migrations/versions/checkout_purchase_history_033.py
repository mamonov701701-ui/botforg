"""
Этап 8.3.1: индекс для user purchase history.

WHERE user_id = ? ORDER BY created_at DESC, id DESC
"""
from __future__ import annotations

from alembic import op


revision = "checkout_purchase_history_033"
down_revision = "addon_purchase_flag_032"
branch_labels = None
depends_on = None

_INDEX = "ix_checkout_intents_user_created_id"


def upgrade() -> None:
    op.create_index(
        _INDEX,
        "checkout_intents",
        ["user_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="checkout_intents")
