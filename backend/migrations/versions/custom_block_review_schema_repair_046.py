"""Repair early Stage 7.8 review schema applied before revision 045 stabilized.

Revision ID: custom_block_review_schema_repair_046
Revises: custom_block_review_workflow_045

Revision 045 was applied to the development database while the Stage 7.8
schema was still being completed.  Fresh databases already receive the full
045 schema, so this migration deliberately converges both shapes without
recreating data or changing an already-applied migration.
"""

from alembic import op
import sqlalchemy as sa


revision = "custom_block_review_schema_repair_046"
down_revision = "custom_block_review_workflow_045"
branch_labels = None
depends_on = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "custom_block_security_reports" in table_names:
        columns = _column_names(inspector, "custom_block_security_reports")
        with op.batch_alter_table("custom_block_security_reports") as batch_op:
            if "status" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "status",
                        sa.String(24),
                        nullable=False,
                        server_default="succeeded",
                    )
                )
            if "provider_code" not in columns:
                batch_op.add_column(sa.Column("provider_code", sa.String(64), nullable=True))
            if "error_code" not in columns:
                batch_op.add_column(sa.Column("error_code", sa.String(64), nullable=True))

    if "custom_block_review_events" not in table_names:
        op.create_table(
            "custom_block_review_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "custom_block_version_id",
                sa.Integer(),
                sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("previous_state", sa.String(32), nullable=True),
            sa.Column("resulting_state", sa.String(32), nullable=True),
            sa.Column("actor_type", sa.String(32), nullable=False),
            sa.Column(
                "actor_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("artifact_hash", sa.String(64), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    inspector = sa.inspect(bind)
    event_indexes = _index_names(inspector, "custom_block_review_events")
    if "ix_custom_block_review_events_custom_block_version_id" not in event_indexes:
        op.create_index(
            "ix_custom_block_review_events_custom_block_version_id",
            "custom_block_review_events",
            ["custom_block_version_id"],
        )
    if "ix_custom_block_review_events_actor_user_id" not in event_indexes:
        op.create_index(
            "ix_custom_block_review_events_actor_user_id",
            "custom_block_review_events",
            ["actor_user_id"],
        )


def downgrade():
    # Revision 045 defines the converged schema already.  Downgrading this
    # repair marker must therefore preserve the 045 tables and columns.
    pass
