"""
Stage 6.9: payment_provider_settings for admin (no secrets in DB).
"""
from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "payment_provider_settings_023"
down_revision = "payment_fulfillment_022"
branch_labels = None
depends_on = None


def _utcnow():
    return datetime.now(timezone.utc)


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def _boolean_default(value: bool):
    if op.get_bind().dialect.name == "postgresql":
        return sa.text("true" if value else "false")
    return sa.text("1" if value else "0")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "payment_provider_settings" in insp.get_table_names():
        return

    op.create_table(
        "payment_provider_settings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=_boolean_default(False),
        ),
        sa.Column("mode", sa.String(32), nullable=False, server_default="test"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column(
            "is_default_for_new_payments",
            sa.Boolean(),
            nullable=False,
            server_default=_boolean_default(False),
        ),
        sa.Column("last_health_check_at", sa.DateTime(), nullable=True),
        sa.Column("last_health_check_status", sa.String(32), nullable=True),
        sa.Column("last_health_check_message", sa.Text(), nullable=True),
        sa.Column("last_webhook_status", sa.String(32), nullable=True),
        sa.Column("last_webhook_at", sa.DateTime(), nullable=True),
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
        sa.UniqueConstraint("code", name="uq_payment_provider_settings_code"),
    )
    op.create_index(
        "ix_payment_provider_settings_code",
        "payment_provider_settings",
        ["code"],
        unique=True,
    )
    op.create_index(
        "ix_payment_provider_settings_enabled",
        "payment_provider_settings",
        ["enabled"],
    )
    op.create_index(
        "ix_payment_provider_settings_is_default",
        "payment_provider_settings",
        ["is_default_for_new_payments"],
    )

    seed = sa.table(
        "payment_provider_settings",
        sa.column("code", sa.String),
        sa.column("display_name", sa.String),
        sa.column("enabled", sa.Boolean),
        sa.column("mode", sa.String),
        sa.column("currency", sa.String),
        sa.column("priority", sa.Integer),
        sa.column("is_default_for_new_payments", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    now = _utcnow()
    op.bulk_insert(
        seed,
        [
            {
                "code": "yookassa",
                "display_name": "ЮKassa",
                "enabled": True,
                "mode": "test",
                "currency": "RUB",
                "priority": 10,
                "is_default_for_new_payments": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "code": "cloudpayments",
                "display_name": "CloudPayments",
                "enabled": False,
                "mode": "test",
                "currency": "RUB",
                "priority": 20,
                "is_default_for_new_payments": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "code": "stripe",
                "display_name": "Stripe",
                "enabled": False,
                "mode": "test",
                "currency": "RUB",
                "priority": 30,
                "is_default_for_new_payments": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "code": "robokassa",
                "display_name": "Robokassa",
                "enabled": False,
                "mode": "test",
                "currency": "RUB",
                "priority": 40,
                "is_default_for_new_payments": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "code": "fake",
                "display_name": "Fake (тесты)",
                "enabled": False,
                "mode": "test",
                "currency": "RUB",
                "priority": 100,
                "is_default_for_new_payments": False,
                "created_at": now,
                "updated_at": now,
            },
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "payment_provider_settings" not in insp.get_table_names():
        return
    op.drop_index(
        "ix_payment_provider_settings_is_default",
        table_name="payment_provider_settings",
    )
    op.drop_index(
        "ix_payment_provider_settings_enabled",
        table_name="payment_provider_settings",
    )
    op.drop_index(
        "ix_payment_provider_settings_code",
        table_name="payment_provider_settings",
    )
    op.drop_table("payment_provider_settings")
