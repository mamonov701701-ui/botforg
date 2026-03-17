"""add Developer plan

Revision ID: plans_developer_013
Revises: plans_012
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa


revision = "plans_developer_013"
down_revision = "plans_012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO plans (code, name, limits, created_at) VALUES "
        "('developer', 'Developer', "
        "'{\"max_bots\": 10, \"can_publish\": true, \"can_use_analytics\": true, "
        "\"max_team_members\": 5, \"can_publish_templates\": true, "
        "\"can_sell_templates\": true, \"can_view_marketplace_stats\": true}', "
        "datetime('now'))"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM plans WHERE code = 'developer'"))
