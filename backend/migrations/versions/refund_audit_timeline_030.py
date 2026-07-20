"""
Stage 6.14.10A: composite index for per-request audit timeline ordering.

(refund_request_id, created_at, id) — эффективная выборка истории одной заявки.
Не дублирует данные событий. SQLite + PostgreSQL.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "refund_audit_timeline_030"
down_revision = "legal_versioning_029"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_refund_audit_events_request_created_id"


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "refund_audit_events" not in tables:
        return
    existing = {ix["name"] for ix in insp.get_indexes("refund_audit_events")}
    if INDEX_NAME in existing:
        return
    op.create_index(
        INDEX_NAME,
        "refund_audit_events",
        ["refund_request_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "refund_audit_events" not in tables:
        return
    existing = {ix["name"] for ix in insp.get_indexes("refund_audit_events")}
    if INDEX_NAME not in existing:
        return
    op.drop_index(INDEX_NAME, table_name="refund_audit_events")
