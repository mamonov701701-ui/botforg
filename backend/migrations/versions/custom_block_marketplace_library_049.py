"""Persist an exact-version user's Marketplace library installation.

Revision ID: custom_block_marketplace_library_049
Revises: custom_block_marketplace_chat_048
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_marketplace_library_049"
down_revision = "custom_block_marketplace_chat_048"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_block_library_installs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "custom_block_version_id", name="uq_cb_library_install_user_version"),
    )
    op.create_index("ix_custom_block_library_installs_user_id", "custom_block_library_installs", ["user_id"])
    op.create_index("ix_custom_block_library_installs_custom_block_version_id", "custom_block_library_installs", ["custom_block_version_id"])


def downgrade():
    op.drop_index("ix_custom_block_library_installs_custom_block_version_id", table_name="custom_block_library_installs")
    op.drop_index("ix_custom_block_library_installs_user_id", table_name="custom_block_library_installs")
    op.drop_table("custom_block_library_installs")
