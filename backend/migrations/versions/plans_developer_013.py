"""add Developer plan

Revision ID: plans_developer_013
Revises: plans_012
Create Date: 2026-02-02

"""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "plans_developer_013"
down_revision = "plans_012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text("SELECT 1 FROM plans WHERE code = 'developer' LIMIT 1")
    ).first()
    if exists:
        return
    conn.execute(
        sa.text(
            "INSERT INTO plans (code, name, limits, created_at) "
            "VALUES (:code, :name, :limits, :created_at)"
        ),
        {
            "code": "developer",
            "name": "Developer",
            "limits": (
                '{"max_bots": 10, "can_publish": true, "can_use_analytics": true, '
                '"max_team_members": 5, "can_publish_templates": true, '
                '"can_sell_templates": true, "can_view_marketplace_stats": true}'
            ),
            "created_at": datetime.now(timezone.utc),
        },
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM plans WHERE code = 'developer'"))
