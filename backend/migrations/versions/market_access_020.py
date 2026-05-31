"""market access requests and manual access grants

Revision ID: market_access_020
Revises: safe_missing_orm_tables_019
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa


revision = "market_access_020"
down_revision = "safe_missing_orm_tables_019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_access_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_item_id", sa.Integer(), nullable=False),
        sa.Column("requester_user_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("chat_room_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "in_discussion",
                "access_granted",
                "rejected",
                "closed",
                name="marketaccessrequeststatus",
            ),
            nullable=False,
            server_default="new",
        ),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["market_item_id"], ["market_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chat_room_id"], ["chat_rooms.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_market_access_requests_market_item_id",
        "market_access_requests",
        ["market_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_access_requests_requester_user_id",
        "market_access_requests",
        ["requester_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_access_requests_author_user_id",
        "market_access_requests",
        ["author_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_access_requests_status",
        "market_access_requests",
        ["status"],
        unique=False,
    )
    op.create_index(op.f("ix_market_access_requests_id"), "market_access_requests", ["id"], unique=False)
    op.create_index(
        op.f("ix_market_access_requests_created_at"),
        "market_access_requests",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "market_item_access_grants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_item_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["market_item_id"], ["market_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["granted_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["request_id"], ["market_access_requests.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "market_item_id",
            "user_id",
            name="uq_market_item_access_grants_item_user",
        ),
    )
    op.create_index(
        "ix_market_item_access_grants_market_item_id",
        "market_item_access_grants",
        ["market_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_item_access_grants_user_id",
        "market_item_access_grants",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_market_item_access_grants_granted_by_user_id",
        "market_item_access_grants",
        ["granted_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_item_access_grants_id"),
        "market_item_access_grants",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_item_access_grants_created_at"),
        "market_item_access_grants",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_market_item_access_grants_created_at"), table_name="market_item_access_grants")
    op.drop_index(op.f("ix_market_item_access_grants_id"), table_name="market_item_access_grants")
    op.drop_index(
        "ix_market_item_access_grants_granted_by_user_id",
        table_name="market_item_access_grants",
    )
    op.drop_index("ix_market_item_access_grants_user_id", table_name="market_item_access_grants")
    op.drop_index("ix_market_item_access_grants_market_item_id", table_name="market_item_access_grants")
    op.drop_table("market_item_access_grants")

    op.drop_index(op.f("ix_market_access_requests_created_at"), table_name="market_access_requests")
    op.drop_index(op.f("ix_market_access_requests_id"), table_name="market_access_requests")
    op.drop_index("ix_market_access_requests_status", table_name="market_access_requests")
    op.drop_index("ix_market_access_requests_author_user_id", table_name="market_access_requests")
    op.drop_index("ix_market_access_requests_requester_user_id", table_name="market_access_requests")
    op.drop_index("ix_market_access_requests_market_item_id", table_name="market_access_requests")
    op.drop_table("market_access_requests")
