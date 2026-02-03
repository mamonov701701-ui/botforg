"""add allow_ai_text to bots (152-ФЗ AI safety)

Revision ID: legal_152_003
Revises: legal_152_002
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_003"
down_revision = "legal_152_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bots",
        sa.Column("allow_ai_text", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("bots", "allow_ai_text")
