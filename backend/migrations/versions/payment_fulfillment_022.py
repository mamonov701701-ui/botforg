"""
Stage 6.7: payment attempts, webhook events, checkout lifecycle, addon provider_ref.

- extend checkout_intents with payment/fulfillment fields
- create payment_attempts, payment_webhook_events
- add user_addons.provider_ref (unique)

SQLite: FK columns via batch_alter_table.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "payment_fulfillment_022"
down_revision = "checkout_intents_021"
branch_labels = None
depends_on = None


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def _column_names(insp: sa.engine.Inspector, table: str) -> set[str]:
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name

    # --- user_addons.provider_ref ---
    addon_cols = _column_names(insp, "user_addons")
    if "provider_ref" not in addon_cols:
        if dialect == "sqlite":
            with op.batch_alter_table("user_addons") as batch_op:
                batch_op.add_column(
                    sa.Column("provider_ref", sa.String(255), nullable=True)
                )
                batch_op.create_index(
                    "ix_user_addons_provider_ref",
                    ["provider_ref"],
                    unique=True,
                )
        else:
            op.add_column(
                "user_addons",
                sa.Column("provider_ref", sa.String(255), nullable=True),
            )
            op.create_index(
                "ix_user_addons_provider_ref",
                "user_addons",
                ["provider_ref"],
                unique=True,
            )

    # --- checkout_intents lifecycle columns ---
    insp = sa.inspect(bind)
    intent_cols = _column_names(insp, "checkout_intents")
    need_intent_cols = [
        c
        for c in (
            "payment_provider",
            "provider_payment_id",
            "paid_at",
            "fulfilled_at",
            "failed_at",
            "cancelled_at",
            "refunded_at",
            "fulfilled_subscription_id",
            "fulfilled_addon_id",
        )
        if c not in intent_cols
    ]
    if need_intent_cols:
        if dialect == "sqlite":
            with op.batch_alter_table("checkout_intents") as batch_op:
                if "payment_provider" in need_intent_cols:
                    batch_op.add_column(
                        sa.Column("payment_provider", sa.String(64), nullable=True)
                    )
                if "provider_payment_id" in need_intent_cols:
                    batch_op.add_column(
                        sa.Column("provider_payment_id", sa.String(255), nullable=True)
                    )
                    batch_op.create_index(
                        "ix_checkout_intents_provider_payment_id",
                        ["provider_payment_id"],
                    )
                for ts in (
                    "paid_at",
                    "fulfilled_at",
                    "failed_at",
                    "cancelled_at",
                    "refunded_at",
                ):
                    if ts in need_intent_cols:
                        batch_op.add_column(sa.Column(ts, sa.DateTime(), nullable=True))
                if "fulfilled_subscription_id" in need_intent_cols:
                    batch_op.add_column(
                        sa.Column("fulfilled_subscription_id", sa.Integer(), nullable=True)
                    )
                    batch_op.create_foreign_key(
                        "fk_checkout_intents_fulfilled_subscription_id",
                        "user_subscriptions",
                        ["fulfilled_subscription_id"],
                        ["id"],
                        ondelete="SET NULL",
                    )
                if "fulfilled_addon_id" in need_intent_cols:
                    batch_op.add_column(
                        sa.Column("fulfilled_addon_id", sa.Integer(), nullable=True)
                    )
                    batch_op.create_foreign_key(
                        "fk_checkout_intents_fulfilled_addon_id",
                        "user_addons",
                        ["fulfilled_addon_id"],
                        ["id"],
                        ondelete="SET NULL",
                    )
        else:
            if "payment_provider" in need_intent_cols:
                op.add_column(
                    "checkout_intents",
                    sa.Column("payment_provider", sa.String(64), nullable=True),
                )
            if "provider_payment_id" in need_intent_cols:
                op.add_column(
                    "checkout_intents",
                    sa.Column("provider_payment_id", sa.String(255), nullable=True),
                )
                op.create_index(
                    "ix_checkout_intents_provider_payment_id",
                    "checkout_intents",
                    ["provider_payment_id"],
                )
            for ts in (
                "paid_at",
                "fulfilled_at",
                "failed_at",
                "cancelled_at",
                "refunded_at",
            ):
                if ts in need_intent_cols:
                    op.add_column(
                        "checkout_intents", sa.Column(ts, sa.DateTime(), nullable=True)
                    )
            if "fulfilled_subscription_id" in need_intent_cols:
                op.add_column(
                    "checkout_intents",
                    sa.Column(
                        "fulfilled_subscription_id",
                        sa.Integer(),
                        sa.ForeignKey("user_subscriptions.id", ondelete="SET NULL"),
                        nullable=True,
                    ),
                )
            if "fulfilled_addon_id" in need_intent_cols:
                op.add_column(
                    "checkout_intents",
                    sa.Column(
                        "fulfilled_addon_id",
                        sa.Integer(),
                        sa.ForeignKey("user_addons.id", ondelete="SET NULL"),
                        nullable=True,
                    ),
                )

    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "payment_attempts" not in tables:
        op.create_table(
            "payment_attempts",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "checkout_intent_id",
                sa.Integer(),
                sa.ForeignKey("checkout_intents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("provider", sa.String(64), nullable=False),
            sa.Column("provider_payment_id", sa.String(255), nullable=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
            sa.Column("status", sa.String(32), nullable=False, server_default="created"),
            sa.Column("idempotency_key", sa.String(128), nullable=False),
            sa.Column("confirmation_url", sa.Text(), nullable=True),
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
                "provider",
                "provider_payment_id",
                name="uq_payment_attempts_provider_payment",
            ),
            sa.UniqueConstraint(
                "checkout_intent_id",
                "idempotency_key",
                name="uq_payment_attempts_intent_idempotency",
            ),
        )
        op.create_index(
            "ix_payment_attempts_checkout_intent_id",
            "payment_attempts",
            ["checkout_intent_id"],
        )
        op.create_index("ix_payment_attempts_user_id", "payment_attempts", ["user_id"])
        op.create_index("ix_payment_attempts_status", "payment_attempts", ["status"])

    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "payment_webhook_events" not in tables:
        op.create_table(
            "payment_webhook_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("provider", sa.String(64), nullable=False),
            sa.Column("provider_event_id", sa.String(255), nullable=False),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column(
                "payment_attempt_id",
                sa.Integer(),
                sa.ForeignKey("payment_attempts.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "checkout_intent_id",
                sa.Integer(),
                sa.ForeignKey("checkout_intents.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "process_status",
                sa.String(32),
                nullable=False,
                server_default="received",
            ),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
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
                "provider",
                "provider_event_id",
                name="uq_payment_webhook_events_provider_event",
            ),
        )
        op.create_index(
            "ix_payment_webhook_events_process_status",
            "payment_webhook_events",
            ["process_status"],
        )
        op.create_index(
            "ix_payment_webhook_events_checkout_intent_id",
            "payment_webhook_events",
            ["checkout_intent_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name
    tables = set(insp.get_table_names())

    if "payment_webhook_events" in tables:
        op.drop_index(
            "ix_payment_webhook_events_checkout_intent_id",
            table_name="payment_webhook_events",
        )
        op.drop_index(
            "ix_payment_webhook_events_process_status",
            table_name="payment_webhook_events",
        )
        op.drop_table("payment_webhook_events")

    if "payment_attempts" in tables:
        op.drop_index("ix_payment_attempts_status", table_name="payment_attempts")
        op.drop_index("ix_payment_attempts_user_id", table_name="payment_attempts")
        op.drop_index(
            "ix_payment_attempts_checkout_intent_id", table_name="payment_attempts"
        )
        op.drop_table("payment_attempts")

    intent_cols = _column_names(insp, "checkout_intents")
    drop_cols = [
        c
        for c in (
            "fulfilled_addon_id",
            "fulfilled_subscription_id",
            "refunded_at",
            "cancelled_at",
            "failed_at",
            "fulfilled_at",
            "paid_at",
            "provider_payment_id",
            "payment_provider",
        )
        if c in intent_cols
    ]
    if drop_cols:
        if dialect == "sqlite":
            with op.batch_alter_table("checkout_intents") as batch_op:
                if "provider_payment_id" in drop_cols:
                    try:
                        batch_op.drop_index("ix_checkout_intents_provider_payment_id")
                    except Exception:
                        pass
                for col in drop_cols:
                    batch_op.drop_column(col)
        else:
            if "provider_payment_id" in drop_cols:
                try:
                    op.drop_index(
                        "ix_checkout_intents_provider_payment_id",
                        table_name="checkout_intents",
                    )
                except Exception:
                    pass
            for col in drop_cols:
                op.drop_column("checkout_intents", col)

    addon_cols = _column_names(insp, "user_addons")
    if "provider_ref" in addon_cols:
        if dialect == "sqlite":
            with op.batch_alter_table("user_addons") as batch_op:
                try:
                    batch_op.drop_index("ix_user_addons_provider_ref")
                except Exception:
                    pass
                batch_op.drop_column("provider_ref")
        else:
            try:
                op.drop_index("ix_user_addons_provider_ref", table_name="user_addons")
            except Exception:
                pass
            op.drop_column("user_addons", "provider_ref")
