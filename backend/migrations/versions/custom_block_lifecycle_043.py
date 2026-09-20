"""Add immutable, versioned custom block lifecycle.

Revision ID: custom_block_lifecycle_043
Revises: ai_provider_layer_042
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_lifecycle_043"
down_revision = "ai_provider_layer_042"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stable_key", sa.String(96), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("stable_key", name="uq_custom_blocks_stable_key"),
    )
    op.create_index("ix_custom_blocks_stable_key", "custom_blocks", ["stable_key"])
    op.create_index("ix_custom_blocks_owner_user_id", "custom_blocks", ["owner_user_id"])
    op.create_table(
        "custom_block_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("custom_block_id", sa.Integer(), sa.ForeignKey("custom_blocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="SET NULL")),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("passport", sa.JSON(), nullable=False),
        sa.Column("user_guide", sa.JSON(), nullable=False),
        sa.Column("runtime_kind", sa.String(48), nullable=False),
        sa.Column("runtime_definition", sa.JSON(), nullable=False),
        sa.Column("validation_result", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("published_at", sa.DateTime()),
        sa.Column("archived_at", sa.DateTime()),
        sa.UniqueConstraint("custom_block_id", "version", name="uq_custom_block_version_number"),
    )
    op.create_index("ix_custom_block_versions_custom_block_id", "custom_block_versions", ["custom_block_id"])
    op.create_index("ix_custom_block_versions_status", "custom_block_versions", ["status"])


def downgrade():
    op.drop_table("custom_block_versions")
    op.drop_table("custom_blocks")
