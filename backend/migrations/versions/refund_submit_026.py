"""
Stage 6.14.3.2: refund submit — idempotency_key + one open request per intent.

SQLite + PostgreSQL compatible (partial unique index via portable SQL).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "refund_submit_026"
down_revision = "refund_requests_025"
branch_labels = None
depends_on = None

OPEN_INTENT_INDEX = "uq_refund_requests_one_open_per_intent"
USER_IDEMPOTENCY_INDEX = "uq_refund_requests_user_idempotency"


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "refund_requests" not in tables:
        return

    cols = {c["name"] for c in insp.get_columns("refund_requests")}
    if "idempotency_key" not in cols:
        op.add_column(
            "refund_requests",
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        )

    existing_uniques = {
        u["name"] for u in insp.get_unique_constraints("refund_requests") if u.get("name")
    }
    existing_indexes = {i["name"] for i in insp.get_indexes("refund_requests") if i.get("name")}

    if (
        USER_IDEMPOTENCY_INDEX not in existing_uniques
        and USER_IDEMPOTENCY_INDEX not in existing_indexes
    ):
        op.create_index(
            USER_IDEMPOTENCY_INDEX,
            "refund_requests",
            ["user_id", "idempotency_key"],
            unique=True,
        )

    if OPEN_INTENT_INDEX not in existing_indexes:
        # Partial unique: at most one non-terminal request per checkout_intent_id.
        # Same SQL works on SQLite 3.8+ and PostgreSQL.
        op.execute(
            sa.text(
                f"CREATE UNIQUE INDEX {OPEN_INTENT_INDEX} "
                f"ON refund_requests (checkout_intent_id) "
                f"WHERE status NOT IN ('completed', 'rejected', 'canceled')"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "refund_requests" not in tables:
        return

    existing_indexes = {i["name"] for i in insp.get_indexes("refund_requests") if i.get("name")}
    if OPEN_INTENT_INDEX in existing_indexes:
        op.drop_index(OPEN_INTENT_INDEX, table_name="refund_requests")

    existing_uniques = {
        u["name"] for u in insp.get_unique_constraints("refund_requests") if u.get("name")
    }
    if USER_IDEMPOTENCY_INDEX in existing_indexes or USER_IDEMPOTENCY_INDEX in existing_uniques:
        op.drop_index(USER_IDEMPOTENCY_INDEX, table_name="refund_requests")

    cols = {c["name"] for c in insp.get_columns("refund_requests")}
    if "idempotency_key" in cols:
        op.drop_column("refund_requests", "idempotency_key")
