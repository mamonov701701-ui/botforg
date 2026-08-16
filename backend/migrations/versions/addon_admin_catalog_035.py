"""
Stage 7.2: admin catalog of addon packages.

Additive only:
- addon_packages.validity_days (default 30, matches current fulfillment)
- PostgreSQL enum value ai_credits (catalog type only)

Does not rewrite financial history or change existing package rows beyond the default.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "addon_admin_catalog_035"
down_revision = "business_pro_team_members_034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    if dialect == "postgresql":
        op.execute(
            sa.text(
                "ALTER TYPE addonpackagetype ADD VALUE IF NOT EXISTS 'ai_credits'"
            )
        )

    cols = {c["name"] for c in inspector.get_columns("addon_packages")}
    if "validity_days" not in cols:
        op.add_column(
            "addon_packages",
            sa.Column(
                "validity_days",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("30"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("addon_packages")}
    if "validity_days" in cols:
        op.drop_column("addon_packages", "validity_days")
    # PostgreSQL enum values cannot be removed safely; leave ai_credits in place.
