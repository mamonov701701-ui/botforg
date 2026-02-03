"""add consents table for 152-FZ (legal consent tracking)

Revision ID: legal_152_001
Revises: user_settings_001
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "legal_152_001"
down_revision = "user_settings_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(64), nullable=False),
        sa.Column("doc_version", sa.String(32), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_consents_id"), "consents", ["id"], unique=False)
    op.create_index(op.f("ix_consents_user_id"), "consents", ["user_id"], unique=False)
    op.create_index("ix_consents_user_doc", "consents", ["user_id", "doc_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_consents_user_doc", table_name="consents")
    op.drop_index(op.f("ix_consents_user_id"), table_name="consents")
    op.drop_index(op.f("ix_consents_id"), table_name="consents")
    op.drop_table("consents")
