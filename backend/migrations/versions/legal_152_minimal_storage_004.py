"""add store_messages to bots (minimal PII storage mode)

Revision ID: legal_152_004
Revises: legal_152_003
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_004"
down_revision = "legal_152_003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bots",
        sa.Column("store_messages", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("bots", "store_messages")
