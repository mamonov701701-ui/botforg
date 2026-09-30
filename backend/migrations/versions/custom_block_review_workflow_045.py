"""Add version-scoped custom block review workflow.

Revision ID: custom_block_review_workflow_045
Revises: custom_block_execution_runtime_044
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_review_workflow_045"
down_revision = "custom_block_execution_runtime_044"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "custom_block_versions",
        sa.Column("review_state", sa.String(32), nullable=False, server_default="draft"),
    )
    op.create_index("ix_custom_block_versions_review_state", "custom_block_versions", ["review_state"])
    op.create_table(
        "custom_block_security_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("artifact_hash", sa.String(64), nullable=True),
        sa.Column("report_kind", sa.String(32), nullable=False, server_default="ai_security"),
        sa.Column("status", sa.String(24), nullable=False, server_default="succeeded"),
        sa.Column("provider_code", sa.String(64), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("summary", sa.String(512), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_custom_block_security_reports_custom_block_version_id", "custom_block_security_reports", ["custom_block_version_id"])
    op.create_table(
        "custom_block_review_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("artifact_hash", sa.String(64), nullable=True),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("reviewer_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_custom_block_review_decisions_custom_block_version_id", "custom_block_review_decisions", ["custom_block_version_id"])
    op.create_index("ix_custom_block_review_decisions_reviewer_user_id", "custom_block_review_decisions", ["reviewer_user_id"])
    op.create_table(
        "custom_block_review_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("previous_state", sa.String(32), nullable=True),
        sa.Column("resulting_state", sa.String(32), nullable=True),
        sa.Column("actor_type", sa.String(32), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("artifact_hash", sa.String(64), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_custom_block_review_events_custom_block_version_id", "custom_block_review_events", ["custom_block_version_id"])
    op.create_index("ix_custom_block_review_events_actor_user_id", "custom_block_review_events", ["actor_user_id"])


def downgrade():
    op.drop_table("custom_block_review_events")
    op.drop_table("custom_block_review_decisions")
    op.drop_table("custom_block_security_reports")
    op.drop_index("ix_custom_block_versions_review_state", table_name="custom_block_versions")
    op.drop_column("custom_block_versions", "review_state")
