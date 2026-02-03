"""add message_retention_days to bots (152-ФЗ retention)

Revision ID: legal_152_002
Revises: legal_152_001
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_002"
down_revision = "legal_152_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bots", sa.Column("message_retention_days", sa.Integer(), nullable=False, server_default="30"))


def downgrade() -> None:
    op.drop_column("bots", "message_retention_days")
