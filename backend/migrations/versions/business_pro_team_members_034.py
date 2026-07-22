"""
Stage 8.3.5: Business PRO team_members = 3.

Product:
- business: team_members remains 0
- business_pro: team_members / max_team_members → 3
- team / corporate / start / legacy: unchanged

Canonical source for existing DBs (after tariff_system_007 historically seeded 0).
Seed defaults in tariff_system_007 are aligned to the same product values for new installs;
this revision remains the idempotent data fix for databases already on 007+.
"""
from __future__ import annotations

import json
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "business_pro_team_members_034"
down_revision = "checkout_purchase_history_033"
branch_labels = None
depends_on = None

_BUSINESS_PRO_TEAM_MEMBERS = 3


def _as_dict(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "plans" not in insp.get_table_names():
        return

    plans = sa.table(
        "plans",
        sa.column("id", sa.Integer),
        sa.column("code", sa.String),
        sa.column("limits", sa.JSON),
    )
    rows = bind.execute(
        sa.select(plans.c.id, plans.c.code, plans.c.limits).where(
            plans.c.code == "business_pro"
        )
    ).fetchall()
    for row in rows:
        plan_id, _code, limits_raw = row[0], row[1], row[2]
        limits = _as_dict(limits_raw)
        limits["team_members"] = _BUSINESS_PRO_TEAM_MEMBERS
        limits["max_team_members"] = _BUSINESS_PRO_TEAM_MEMBERS
        bind.execute(plans.update().where(plans.c.id == plan_id).values(limits=limits))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "plans" not in insp.get_table_names():
        return

    plans = sa.table(
        "plans",
        sa.column("id", sa.Integer),
        sa.column("code", sa.String),
        sa.column("limits", sa.JSON),
    )
    rows = bind.execute(
        sa.select(plans.c.id, plans.c.code, plans.c.limits).where(
            plans.c.code == "business_pro"
        )
    ).fetchall()
    for row in rows:
        plan_id, _code, limits_raw = row[0], row[1], row[2]
        limits = _as_dict(limits_raw)
        limits["team_members"] = 0
        limits["max_team_members"] = 0
        bind.execute(plans.update().where(plans.c.id == plan_id).values(limits=limits))
