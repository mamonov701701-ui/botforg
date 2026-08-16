"""
Stage 7.2: graduated pricing tiers + hidden custom_messages catalog anchor.

Additive only. Does not rewrite purchased entitlements or checkout history.
Does not seed commercial unit prices.
"""
from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "addon_pricing_tiers_036"
down_revision = "addon_admin_catalog_035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "addon_pricing_tiers" not in tables:
        op.create_table(
            "addon_pricing_tiers",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("resource_type", sa.String(32), nullable=False),
            sa.Column("range_start", sa.Integer(), nullable=False),
            sa.Column("range_end", sa.Integer(), nullable=True),
            sa.Column("unit_price", sa.Numeric(12, 6), nullable=False),
            sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_addon_pricing_tiers_resource_type",
            "addon_pricing_tiers",
            ["resource_type"],
        )
        op.create_index(
            "ix_addon_pricing_tiers_is_active",
            "addon_pricing_tiers",
            ["is_active"],
        )
        op.create_index(
            "ix_addon_pricing_tiers_resource_active_start",
            "addon_pricing_tiers",
            ["resource_type", "is_active", "range_start"],
        )

    packages = sa.table(
        "addon_packages",
        sa.column("code", sa.String),
        sa.column("name_ru", sa.String),
        sa.column("description_ru", sa.Text),
        sa.column("type", sa.String),
        sa.column("amount", sa.Integer),
        sa.column("price", sa.Numeric),
        sa.column("currency", sa.String),
        sa.column("duration_type", sa.String),
        sa.column("validity_days", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("is_public", sa.Boolean),
        sa.column("sort_order", sa.Integer),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    existing = bind.execute(
        sa.text("SELECT id FROM addon_packages WHERE code = :code"),
        {"code": "custom_messages"},
    ).first()
    if existing is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        bind.execute(
            packages.insert().values(
                code="custom_messages",
                name_ru="Настроить пакет",
                description_ru=(
                    "Укажите нужное количество сообщений. "
                    "Итоговую стоимость рассчитывает сервер."
                ),
                type="messages",
                amount=0,
                price=0,
                currency="RUB",
                duration_type="current_period",
                validity_days=30,
                is_active=True,
                is_public=False,
                sort_order=10000,
                created_at=now,
                updated_at=now,
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "addon_pricing_tiers" in tables:
        op.drop_index(
            "ix_addon_pricing_tiers_resource_active_start",
            table_name="addon_pricing_tiers",
        )
        op.drop_index("ix_addon_pricing_tiers_is_active", table_name="addon_pricing_tiers")
        op.drop_index(
            "ix_addon_pricing_tiers_resource_type",
            table_name="addon_pricing_tiers",
        )
        op.drop_table("addon_pricing_tiers")
    # Keep custom_messages row: deleting it would break UserAddon FKs if any exist.
