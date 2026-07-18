"""
Stage 6.14.1: refund_requests, refund_revisions, refund_ledger_entries, refund_audit_events.

SQLite + PostgreSQL compatible. No provider refund execution.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "refund_requests_025"
down_revision = "payment_provider_connections_024"
branch_labels = None
depends_on = None


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "refund_requests" not in tables:
        op.create_table(
            "refund_requests",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("checkout_intent_id", sa.Integer(), nullable=False),
            sa.Column("payment_attempt_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.String(64),
                nullable=False,
                server_default="submitted",
            ),
            sa.Column("reason_category", sa.String(64), nullable=False),
            sa.Column("user_comment", sa.Text(), nullable=True),
            sa.Column(
                "current_revision_number",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("approved_revision_id", sa.Integer(), nullable=True),
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
            sa.Column(
                "submitted_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column(
                "version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["checkout_intent_id"],
                ["checkout_intents.id"],
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["payment_attempt_id"],
                ["payment_attempts.id"],
                ondelete="RESTRICT",
            ),
        )
        op.create_index(
            "ix_refund_requests_user_id", "refund_requests", ["user_id"]
        )
        op.create_index(
            "ix_refund_requests_status", "refund_requests", ["status"]
        )
        op.create_index(
            "ix_refund_requests_checkout_intent_id",
            "refund_requests",
            ["checkout_intent_id"],
        )
        op.create_index(
            "ix_refund_requests_payment_attempt_id",
            "refund_requests",
            ["payment_attempt_id"],
        )
        op.create_index("ix_refund_requests_id", "refund_requests", ["id"])

    tables = set(sa.inspect(bind).get_table_names())
    if "refund_revisions" not in tables:
        op.create_table(
            "refund_revisions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("refund_request_id", sa.Integer(), nullable=False),
            sa.Column("revision_number", sa.Integer(), nullable=False),
            sa.Column("revision_type", sa.String(32), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("based_on_revision_id", sa.Integer(), nullable=True),
            sa.Column("calculation_status", sa.String(32), nullable=False),
            sa.Column("refund_type", sa.String(32), nullable=False),
            sa.Column(
                "currency",
                sa.String(10),
                nullable=False,
                server_default="RUB",
            ),
            sa.Column("paid_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column(
                "prior_refunded_amount",
                sa.Numeric(10, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column("proposed_refund_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("final_refund_amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("calculation_at", sa.DateTime(), nullable=False),
            sa.Column("period_start", sa.DateTime(), nullable=True),
            sa.Column("period_end", sa.DateTime(), nullable=True),
            sa.Column("used_time_seconds", sa.Integer(), nullable=True),
            sa.Column("total_time_seconds", sa.Integer(), nullable=True),
            sa.Column("addon_total_units", sa.Integer(), nullable=True),
            sa.Column("addon_used_units", sa.Integer(), nullable=True),
            sa.Column("addon_revoke_units", sa.Integer(), nullable=True),
            sa.Column("entitlement_action", sa.String(64), nullable=False),
            sa.Column("entitlement_effective_at", sa.DateTime(), nullable=True),
            sa.Column("adjustment_reason_category", sa.String(64), nullable=True),
            sa.Column("adjustment_comment", sa.Text(), nullable=True),
            sa.Column("calculation_snapshot", sa.JSON(), nullable=True),
            sa.Column("entitlement_snapshot", sa.JSON(), nullable=True),
            sa.Column("usage_snapshot", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
            sa.ForeignKeyConstraint(
                ["refund_request_id"],
                ["refund_requests.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["based_on_revision_id"],
                ["refund_revisions.id"],
                ondelete="SET NULL",
            ),
            sa.UniqueConstraint(
                "refund_request_id",
                "revision_number",
                name="uq_refund_revisions_request_number",
            ),
        )
        op.create_index(
            "ix_refund_revisions_refund_request_id",
            "refund_revisions",
            ["refund_request_id"],
        )
        op.create_index("ix_refund_revisions_id", "refund_revisions", ["id"])

    # Circular FK: refund_requests.approved_revision_id → refund_revisions.id
    insp = sa.inspect(bind)
    fk_names = {
        fk.get("name")
        for fk in insp.get_foreign_keys("refund_requests")
        if fk.get("name")
    }
    if "fk_refund_requests_approved_revision_id" not in fk_names:
        # SQLite: batch_alter for adding FK; PostgreSQL: create_foreign_key
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("refund_requests") as batch_op:
                batch_op.create_foreign_key(
                    "fk_refund_requests_approved_revision_id",
                    "refund_revisions",
                    ["approved_revision_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
        else:
            op.create_foreign_key(
                "fk_refund_requests_approved_revision_id",
                "refund_requests",
                "refund_revisions",
                ["approved_revision_id"],
                ["id"],
                ondelete="SET NULL",
            )

    tables = set(sa.inspect(bind).get_table_names())
    if "refund_ledger_entries" not in tables:
        op.create_table(
            "refund_ledger_entries",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("refund_request_id", sa.Integer(), nullable=False),
            sa.Column("refund_revision_id", sa.Integer(), nullable=False),
            sa.Column("checkout_intent_id", sa.Integer(), nullable=False),
            sa.Column("payment_attempt_id", sa.Integer(), nullable=False),
            sa.Column("entry_type", sa.String(32), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column(
                "currency",
                sa.String(10),
                nullable=False,
                server_default="RUB",
            ),
            sa.Column("idempotency_key", sa.String(128), nullable=False),
            sa.Column("provider_refund_id", sa.String(255), nullable=True),
            sa.Column("provider_status", sa.String(64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
            sa.ForeignKeyConstraint(
                ["refund_request_id"],
                ["refund_requests.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["refund_revision_id"],
                ["refund_revisions.id"],
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["checkout_intent_id"],
                ["checkout_intents.id"],
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["payment_attempt_id"],
                ["payment_attempts.id"],
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "idempotency_key",
                name="uq_refund_ledger_entries_idempotency",
            ),
        )
        op.create_index(
            "ix_refund_ledger_entries_refund_request_id",
            "refund_ledger_entries",
            ["refund_request_id"],
        )
        op.create_index(
            "ix_refund_ledger_entries_checkout_intent_id",
            "refund_ledger_entries",
            ["checkout_intent_id"],
        )
        op.create_index(
            "ix_refund_ledger_entries_id", "refund_ledger_entries", ["id"]
        )

    tables = set(sa.inspect(bind).get_table_names())
    if "refund_audit_events" not in tables:
        op.create_table(
            "refund_audit_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("refund_request_id", sa.Integer(), nullable=False),
            sa.Column("refund_revision_id", sa.Integer(), nullable=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("actor_type", sa.String(32), nullable=False),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("previous_status", sa.String(64), nullable=True),
            sa.Column("new_status", sa.String(64), nullable=True),
            sa.Column("changed_fields", sa.JSON(), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
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
                ["actor_user_id"], ["users.id"], ondelete="SET NULL"
            ),
        )
        op.create_index(
            "ix_refund_audit_events_refund_request_id",
            "refund_audit_events",
            ["refund_request_id"],
        )
        op.create_index(
            "ix_refund_audit_events_created_at",
            "refund_audit_events",
            ["created_at"],
        )
        op.create_index(
            "ix_refund_audit_events_id", "refund_audit_events", ["id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "refund_audit_events" in tables:
        op.drop_table("refund_audit_events")
    if "refund_ledger_entries" in tables:
        op.drop_table("refund_ledger_entries")

    # Drop circular FK before revisions/requests
    if "refund_requests" in tables:
        insp = sa.inspect(bind)
        fk_names = {
            fk.get("name")
            for fk in insp.get_foreign_keys("refund_requests")
            if fk.get("name")
        }
        if "fk_refund_requests_approved_revision_id" in fk_names:
            if bind.dialect.name == "sqlite":
                with op.batch_alter_table("refund_requests") as batch_op:
                    batch_op.drop_constraint(
                        "fk_refund_requests_approved_revision_id",
                        type_="foreignkey",
                    )
            else:
                op.drop_constraint(
                    "fk_refund_requests_approved_revision_id",
                    "refund_requests",
                    type_="foreignkey",
                )

    tables = set(sa.inspect(bind).get_table_names())
    if "refund_revisions" in tables:
        op.drop_table("refund_revisions")
    if "refund_requests" in tables:
        op.drop_table("refund_requests")
