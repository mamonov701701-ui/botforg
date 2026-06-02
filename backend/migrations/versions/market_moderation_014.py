"""add moderation_status to market_items

Revision ID: market_moderation_014
Revises: plans_developer_013
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa


revision = "market_moderation_014"
down_revision = "plans_developer_013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support ADD COLUMN with Enum easily - use VARCHAR
    op.add_column(
        "market_items",
        sa.Column("moderation_status", sa.String(32), nullable=False, server_default="draft"),
    )
    op.add_column(
        "market_items",
        sa.Column("moderation_rejection_reason", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_market_items_moderation_status",
        "market_items",
        ["moderation_status"],
        unique=False,
    )
    # Существующие опубликованные шаблоны считаем одобренными
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        published_clause = "is_published = 1"
    else:
        published_clause = "is_published IS TRUE"
    conn.execute(
        sa.text(
            "UPDATE market_items SET moderation_status = 'approved' "
            f"WHERE item_type = 'template' AND {published_clause}"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_market_items_moderation_status", table_name="market_items")
    op.drop_column("market_items", "moderation_rejection_reason")
    op.drop_column("market_items", "moderation_status")
