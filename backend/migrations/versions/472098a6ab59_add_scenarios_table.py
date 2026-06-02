"""Add scenarios table

Revision ID: 472098a6ab59
Revises: 24b5f3912745
Create Date: 2025-11-07 20:39:12.662532

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '472098a6ab59'
down_revision: Union[str, Sequence[str], None] = '24b5f3912745'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_index(
    bind,
    table_name: str,
    index_name: str,
    columns: list[str],
) -> None:
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return
    existing = {ix["name"] for ix in insp.get_indexes(table_name)}
    if index_name in existing:
        return
    op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("scenarios"):
        op.create_table(
            "scenarios",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("bot_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(length=50), nullable=True),
            sa.Column("category", sa.String(length=50), nullable=True),
            sa.Column("is_main", sa.Boolean(), nullable=True),
            sa.Column("is_library", sa.Boolean(), nullable=True),
            sa.Column("is_standard", sa.Boolean(), nullable=True),
            sa.Column("is_public", sa.Boolean(), nullable=True),
            sa.Column("content", sa.JSON(), nullable=True),
            sa.Column("order", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    _ensure_index(bind, "scenarios", "ix_scenarios_id", ["id"])
    _ensure_index(bind, "scenarios", "ix_scenarios_bot_id", ["bot_id"])
    _ensure_index(bind, "scenarios", "ix_scenarios_user_id", ["user_id"])

    if not insp.has_table("scenario_versions"):
        op.create_table(
            "scenario_versions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("scenario_id", sa.Integer(), nullable=False),
            sa.Column("content", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                ["scenario_id"], ["scenarios.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    _ensure_index(bind, "scenario_versions", "ix_scenario_versions_id", ["id"])
    _ensure_index(
        bind,
        "scenario_versions",
        "ix_scenario_versions_scenario_id",
        ["scenario_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_scenario_versions_scenario_id'), table_name='scenario_versions')
    op.drop_index(op.f('ix_scenario_versions_id'), table_name='scenario_versions')
    op.drop_table('scenario_versions')
    op.drop_index(op.f('ix_scenarios_user_id'), table_name='scenarios')
    op.drop_index(op.f('ix_scenarios_id'), table_name='scenarios')
    op.drop_index(op.f('ix_scenarios_bot_id'), table_name='scenarios')
    op.drop_table('scenarios')
