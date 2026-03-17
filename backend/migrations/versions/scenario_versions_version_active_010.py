"""Add version and is_active to scenario_versions

Revision ID: scenario_versions_010
Revises: processed_updates_009
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "scenario_versions_010"
down_revision = "processed_updates_009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scenario_versions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("version", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("scenario_versions", schema=None) as batch_op:
        batch_op.drop_column("is_active")
        batch_op.drop_column("version")
