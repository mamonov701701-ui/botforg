"""add plans table and user plan_code

Revision ID: plans_012
Revises: scenario_draft_011
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa


revision = "plans_012"
down_revision = "scenario_draft_011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("limits", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_plans_id"), "plans", ["id"], unique=False)
    op.create_index(op.f("ix_plans_code"), "plans", ["code"], unique=True)

    op.add_column("users", sa.Column("plan_code", sa.String(32), nullable=False, server_default="free"))

    # Сидер тарифов: Free, Pro, Team
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO plans (code, name, limits, created_at) VALUES "
        "('free', 'Free', '{\"max_bots\": 1, \"can_publish\": false, \"can_use_analytics\": false, \"max_team_members\": 0}', datetime('now')), "
        "('pro', 'Pro', '{\"max_bots\": 5, \"can_publish\": true, \"can_use_analytics\": true, \"max_team_members\": 3}', datetime('now')), "
        "('team', 'Team', '{\"max_bots\": 20, \"can_publish\": true, \"can_use_analytics\": true, \"max_team_members\": 10}', datetime('now'))"
    ))


def downgrade() -> None:
    op.drop_column("users", "plan_code")
    op.drop_index(op.f("ix_plans_code"), table_name="plans")
    op.drop_index(op.f("ix_plans_id"), table_name="plans")
    op.drop_table("plans")
