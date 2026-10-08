"""Add exact-version Custom Block marketplace and licensing records.

Revision ID: custom_block_marketplace_047
Revises: custom_block_review_schema_repair_046
"""
from alembic import op
import sqlalchemy as sa

revision = "custom_block_marketplace_047"
down_revision = "custom_block_review_schema_repair_046"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("custom_block_marketplace_listings", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False), sa.Column("lifecycle", sa.String(24), nullable=False), sa.Column("visibility", sa.String(24), nullable=False), sa.Column("access_policy", sa.String(32), nullable=False), sa.Column("commercial_mode", sa.String(32), nullable=False), sa.Column("title", sa.String(160)), sa.Column("description", sa.Text()), sa.Column("category", sa.String(64)), sa.Column("tags", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.Column("published_at", sa.DateTime()), sa.Column("archived_at", sa.DateTime()), sa.UniqueConstraint("custom_block_version_id", name="uq_cb_marketplace_listing_version"))
    op.create_index("ix_cb_marketplace_listing_discovery", "custom_block_marketplace_listings", ["lifecycle", "visibility", "category"])
    op.create_index("ix_custom_block_marketplace_listings_custom_block_version_id", "custom_block_marketplace_listings", ["custom_block_version_id"])
    for table, columns in (("custom_block_access_grants", [sa.Column("id", sa.Integer(), primary_key=True), sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False), sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("granted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("grant_source", sa.String(32), nullable=False), sa.Column("note", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("revoked_at", sa.DateTime()), sa.Column("revoked_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")), sa.UniqueConstraint("custom_block_version_id", "recipient_user_id", name="uq_cb_access_grant_version_recipient")]),):
        op.create_table(table, *columns)
    op.create_index("ix_cb_access_grant_recipient_status", "custom_block_access_grants", ["recipient_user_id", "status"])
    op.create_index("ix_custom_block_access_grants_custom_block_version_id", "custom_block_access_grants", ["custom_block_version_id"])
    op.create_table("custom_block_access_requests", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False), sa.Column("requester_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("state", sa.String(24), nullable=False), sa.Column("message", sa.Text(), nullable=False), sa.Column("decision_note", sa.Text(), nullable=False), sa.Column("decided_at", sa.DateTime()), sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_index("ix_cb_access_request_author_state", "custom_block_access_requests", ["author_user_id", "state"])
    op.create_index("ix_cb_access_request_version_requester", "custom_block_access_requests", ["custom_block_version_id", "requester_user_id"])
    op.create_table("custom_block_marketplace_reviews", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False), sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("rating", sa.Integer(), nullable=False), sa.Column("text", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.UniqueConstraint("custom_block_version_id", "author_user_id", name="uq_cb_marketplace_review_version_author"))
    op.create_index("ix_custom_block_marketplace_reviews_custom_block_version_id", "custom_block_marketplace_reviews", ["custom_block_version_id"])
    op.create_table("custom_block_marketplace_audit_events", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False), sa.Column("listing_id", sa.Integer(), sa.ForeignKey("custom_block_marketplace_listings.id", ondelete="RESTRICT")), sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT")), sa.Column("event_type", sa.String(64), nullable=False), sa.Column("metadata", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_cb_marketplace_audit_version_created", "custom_block_marketplace_audit_events", ["custom_block_version_id", "created_at"])


def downgrade():
    op.drop_table("custom_block_marketplace_audit_events")
    op.drop_table("custom_block_marketplace_reviews")
    op.drop_table("custom_block_access_requests")
    op.drop_table("custom_block_access_grants")
    op.drop_table("custom_block_marketplace_listings")
