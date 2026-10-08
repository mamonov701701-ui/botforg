"""Free/Paid offers and cross-object Trust & Safety foundation.

Revision ID: custom_block_free_paid_trust_051
Revises: custom_block_distribution_050
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_free_paid_trust_051"
down_revision = "custom_block_distribution_050"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("custom_block_marketplace_listings") as batch:
        batch.add_column(sa.Column("price_amount", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("price_currency", sa.String(3), nullable=True))
    op.create_table(
        "marketplace_disputes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("buyer_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("seller_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("custom_block_marketplace_listings.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("price_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("price_currency", sa.String(3), nullable=False),
        sa.Column("listing_snapshot", sa.JSON(), nullable=False),
        sa.Column("chat_room_id", sa.Integer(), sa.ForeignKey("chat_rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason_code", sa.String(48), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_metadata", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("admin_decision", sa.Text(), nullable=True),
        sa.Column("enforcement_action_id", sa.Integer(), nullable=True),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
    )
    for column in ("buyer_user_id", "seller_user_id", "listing_id", "status"):
        op.create_index(f"ix_marketplace_disputes_{column}", "marketplace_disputes", [column])
    op.create_table(
        "trust_safety_enforcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("dispute_id", sa.Integer(), sa.ForeignKey("marketplace_disputes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    for column in ("subject_type", "subject_id", "user_id"):
        op.create_index(f"ix_trust_safety_enforcements_{column}", "trust_safety_enforcements", [column])
    op.create_table(
        "trust_safety_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_trust_safety_audit_events_actor_user_id", "trust_safety_audit_events", ["actor_user_id"])
    op.create_table(
        "trust_safety_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reporter_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("reason_code", sa.String(48), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
    )
    for column in ("reporter_user_id", "subject_type", "status"):
        op.create_index(f"ix_trust_safety_reports_{column}", "trust_safety_reports", [column])


def downgrade():
    for column in ("reporter_user_id", "subject_type", "status"):
        op.drop_index(f"ix_trust_safety_reports_{column}", table_name="trust_safety_reports")
    op.drop_table("trust_safety_reports")
    op.drop_index("ix_trust_safety_audit_events_actor_user_id", table_name="trust_safety_audit_events")
    op.drop_table("trust_safety_audit_events")
    for column in ("subject_type", "subject_id", "user_id"):
        op.drop_index(f"ix_trust_safety_enforcements_{column}", table_name="trust_safety_enforcements")
    op.drop_table("trust_safety_enforcements")
    for column in ("buyer_user_id", "seller_user_id", "listing_id", "status"):
        op.drop_index(f"ix_marketplace_disputes_{column}", table_name="marketplace_disputes")
    op.drop_table("marketplace_disputes")
    with op.batch_alter_table("custom_block_marketplace_listings") as batch:
        batch.drop_column("price_currency")
        batch.drop_column("price_amount")
