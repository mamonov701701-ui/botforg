"""Add status, published_content to scenarios; version_type to scenario_versions

Revision ID: scenario_draft_011
Revises: scenario_versions_010
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "scenario_draft_011"
down_revision = "scenario_versions_010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # scenarios: status, published_content
    with op.batch_alter_table("scenarios", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(20), nullable=False, server_default="draft")
        )
        batch_op.add_column(
            sa.Column("published_content", sa.JSON(), nullable=True)
        )
    # Backfill: existing scenarios = published (content was used directly before)
    op.execute(
        sa.text("UPDATE scenarios SET published_content = content, status = 'published' WHERE content IS NOT NULL")
    )

    # scenario_versions: version_type
    with op.batch_alter_table("scenario_versions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("version_type", sa.String(20), nullable=False, server_default="draft")
        )


def downgrade() -> None:
    with op.batch_alter_table("scenario_versions", schema=None) as batch_op:
        batch_op.drop_column("version_type")
    with op.batch_alter_table("scenarios", schema=None) as batch_op:
        batch_op.drop_column("published_content")
        batch_op.drop_column("status")
