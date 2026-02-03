"""add token_version to users (152-ФЗ revoke on delete)

Revision ID: legal_152_006
Revises: legal_152_005
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_006"
down_revision = "legal_152_005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
