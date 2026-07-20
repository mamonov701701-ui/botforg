"""
Stage 6.14.9A: FIFO addon usage ledger + reserved_units + cutover marker.

SQLite + PostgreSQL compatible.
"""
from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "addon_fifo_ledger_027"
down_revision = "refund_submit_026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "user_addons" in tables:
        cols = {c["name"] for c in insp.get_columns("user_addons")}
        if "reserved_units" not in cols:
            op.add_column(
                "user_addons",
                sa.Column(
                    "reserved_units",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
            )

    if "tariff_fifo_cutover" not in tables:
        op.create_table(
            "tariff_fifo_cutover",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("cutover_at", sa.DateTime(), nullable=False),
            sa.Column("note", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if "addon_usage_ledger_entries" not in tables:
        op.create_table(
            "addon_usage_ledger_entries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("source_type", sa.String(length=32), nullable=False),
            sa.Column("user_addon_id", sa.Integer(), nullable=True),
            sa.Column("gift_grant_id", sa.Integer(), nullable=True),
            sa.Column("units", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("operation", sa.String(length=32), nullable=False),
            sa.Column("source_event_key", sa.String(length=255), nullable=False),
            sa.Column("compensates_event_key", sa.String(length=255), nullable=True),
            sa.Column("period_start", sa.DateTime(), nullable=False),
            sa.Column("period_end", sa.DateTime(), nullable=False),
            sa.Column("usage_counter_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["user_addon_id"], ["user_addons.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["gift_grant_id"], ["gift_grants.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["usage_counter_id"], ["usage_counters.id"], ondelete="SET NULL"
            ),
            sa.UniqueConstraint(
                "source_event_key",
                name="uq_addon_usage_ledger_source_event_key",
            ),
        )
        op.create_index(
            "ix_addon_usage_ledger_user_id",
            "addon_usage_ledger_entries",
            ["user_id"],
        )
        op.create_index(
            "ix_addon_usage_ledger_user_addon_id",
            "addon_usage_ledger_entries",
            ["user_addon_id"],
        )
        op.create_index(
            "ix_addon_usage_ledger_gift_grant_id",
            "addon_usage_ledger_entries",
            ["gift_grant_id"],
        )
        op.create_index(
            "ix_addon_usage_ledger_period",
            "addon_usage_ledger_entries",
            ["period_start", "period_end"],
        )
        op.create_index(
            "ix_addon_usage_ledger_source_type",
            "addon_usage_ledger_entries",
            ["source_type"],
        )

    # Cutover marker + legacy pool snapshot (no per-addon fiction).
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutover_rows = bind.execute(sa.text("SELECT COUNT(*) FROM tariff_fifo_cutover")).scalar()
    if not cutover_rows:
        bind.execute(
            sa.text(
                "INSERT INTO tariff_fifo_cutover (id, cutover_at, note, created_at) "
                "VALUES (1, :cutover_at, :note, :created_at)"
            ),
            {
                "cutover_at": now,
                "note": "6.14.9A FIFO cutover",
                "created_at": now,
            },
        )

    if "usage_counters" in tables and "addon_usage_ledger_entries" in set(
        sa.inspect(bind).get_table_names()
    ):
        counters = bind.execute(
            sa.text(
                "SELECT id, user_id, period_start, period_end, messages_used "
                "FROM usage_counters WHERE messages_used > 0"
            )
        ).fetchall()
        for row in counters:
            uc_id, user_id, p_start, p_end, used = row
            key = f"legacy-cutover:uc:{uc_id}"
            exists = bind.execute(
                sa.text(
                    "SELECT 1 FROM addon_usage_ledger_entries "
                    "WHERE source_event_key = :key LIMIT 1"
                ),
                {"key": key},
            ).fetchone()
            if exists:
                continue
            bind.execute(
                sa.text(
                    "INSERT INTO addon_usage_ledger_entries ("
                    "user_id, source_type, user_addon_id, gift_grant_id, units, "
                    "operation, source_event_key, compensates_event_key, "
                    "period_start, period_end, usage_counter_id, created_at"
                    ") VALUES ("
                    ":user_id, 'legacy_unattributed', NULL, NULL, :units, "
                    "'debit', :key, NULL, "
                    ":period_start, :period_end, :usage_counter_id, :created_at"
                    ")"
                ),
                {
                    "user_id": user_id,
                    "units": int(used),
                    "key": key,
                    "period_start": p_start,
                    "period_end": p_end,
                    "usage_counter_id": uc_id,
                    "created_at": now,
                },
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "addon_usage_ledger_entries" in tables:
        op.drop_table("addon_usage_ledger_entries")
    if "tariff_fifo_cutover" in tables:
        op.drop_table("tariff_fifo_cutover")
    if "user_addons" in tables:
        cols = {c["name"] for c in insp.get_columns("user_addons")}
        if "reserved_units" in cols:
            op.drop_column("user_addons", "reserved_units")
