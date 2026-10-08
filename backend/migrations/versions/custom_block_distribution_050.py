"""Exact-version distribution rights and published Market attribution.

Revision ID: custom_block_distribution_050
Revises: custom_block_marketplace_library_049
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_distribution_050"
down_revision = "custom_block_marketplace_library_049"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_block_distribution_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("original_author_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("block_title", sa.String(160), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "custom_block_version_id", name="uq_cb_distribution_user_version"),
    )
    op.create_index("ix_custom_block_distribution_grants_user_id", "custom_block_distribution_grants", ["user_id"])
    op.create_index("ix_custom_block_distribution_grants_custom_block_version_id", "custom_block_distribution_grants", ["custom_block_version_id"])
    op.create_table(
        "custom_block_market_dependencies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("market_item_id", sa.Integer(), sa.ForeignKey("market_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("original_author_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("block_title", sa.String(160), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("market_item_id", "custom_block_version_id", name="uq_cb_market_dependency_item_version"),
    )
    op.create_index("ix_custom_block_market_dependencies_market_item_id", "custom_block_market_dependencies", ["market_item_id"])
    # Existing free/public installations acquired before this migration retain
    # their exact-version distribution right, including archived listings.
    op.execute("""
        INSERT INTO custom_block_distribution_grants
            (user_id, custom_block_version_id, granted_by_user_id, source,
             original_author_user_id, block_title, version_number, created_at)
        SELECT i.user_id, i.custom_block_version_id, b.owner_user_id, 'free_public',
               b.owner_user_id, v.title, v.version, i.created_at
        FROM custom_block_library_installs AS i
        JOIN custom_block_access_grants AS g
          ON g.recipient_user_id = i.user_id AND g.custom_block_version_id = i.custom_block_version_id
        JOIN custom_block_versions AS v ON v.id = i.custom_block_version_id
        JOIN custom_blocks AS b ON b.id = v.custom_block_id
        JOIN custom_block_marketplace_listings AS l ON l.custom_block_version_id = v.id
        WHERE g.grant_source = 'self_install' AND l.commercial_mode = 'free'
          AND l.visibility = 'public' AND l.access_policy = 'self_install'
    """)


def downgrade():
    op.drop_index("ix_custom_block_market_dependencies_market_item_id", table_name="custom_block_market_dependencies")
    op.drop_table("custom_block_market_dependencies")
    op.drop_index("ix_custom_block_distribution_grants_custom_block_version_id", table_name="custom_block_distribution_grants")
    op.drop_index("ix_custom_block_distribution_grants_user_id", table_name="custom_block_distribution_grants")
    op.drop_table("custom_block_distribution_grants")
