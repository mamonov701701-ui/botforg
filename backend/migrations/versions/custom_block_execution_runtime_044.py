"""Add immutable custom block execution artifacts and metadata audit.

Revision ID: custom_block_execution_runtime_044
Revises: custom_block_lifecycle_043
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_execution_runtime_044"
down_revision = "custom_block_lifecycle_043"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("custom_block_versions", sa.Column("execution_spec", sa.JSON(), nullable=True))
    op.add_column("custom_block_versions", sa.Column("execution_artifact_hash", sa.String(64), nullable=True))
    op.add_column(
        "custom_block_versions",
        sa.Column("execution_state", sa.String(32), nullable=False, server_default="enabled"),
    )
    op.create_index(
        "ix_custom_block_versions_execution_artifact_hash",
        "custom_block_versions",
        ["execution_artifact_hash"],
    )
    op.create_index("ix_custom_block_versions_execution_state", "custom_block_versions", ["execution_state"])
    op.create_table(
        "custom_block_execution_audits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("execution_id", sa.String(64), nullable=False),
        sa.Column(
            "custom_block_version_id",
            sa.Integer(),
            sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("artifact_hash", sa.String(64), nullable=False),
        sa.Column("execution_mode", sa.String(16), nullable=False),
        sa.Column("runner_profile", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("error_category", sa.String(32), nullable=True),
        sa.Column("input_size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("execution_id", name="uq_custom_block_execution_audits_execution_id"),
    )
    op.create_index("ix_custom_block_execution_audits_execution_id", "custom_block_execution_audits", ["execution_id"])
    op.create_index("ix_custom_block_execution_audits_custom_block_version_id", "custom_block_execution_audits", ["custom_block_version_id"])


def downgrade():
    op.drop_table("custom_block_execution_audits")
    op.drop_index("ix_custom_block_versions_execution_state", table_name="custom_block_versions")
    op.drop_index("ix_custom_block_versions_execution_artifact_hash", table_name="custom_block_versions")
    op.drop_column("custom_block_versions", "execution_state")
    op.drop_column("custom_block_versions", "execution_artifact_hash")
    op.drop_column("custom_block_versions", "execution_spec")
