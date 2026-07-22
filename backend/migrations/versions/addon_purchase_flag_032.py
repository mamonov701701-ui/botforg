"""
Stage 8.2: Plan.limits.addon_purchase + addon available_from_plan alignment.

- start / free / pro / developer → addon_purchase=false
- business / business_pro / team / corporate → addon_purchase=true
- public addon packages that allowed start → available_from_plan=business
"""
from __future__ import annotations

import json
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "addon_purchase_flag_032"
down_revision = "notification_outbox_031"
branch_labels = None
depends_on = None

_ADDON_PURCHASE_BY_CODE: dict[str, bool] = {
    "start": False,
    "free": False,
    "pro": False,
    "developer": False,
    "business": True,
    "business_pro": True,
    "team": True,
    "corporate": True,
}


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
    rows = bind.execute(sa.select(plans.c.id, plans.c.code, plans.c.limits)).fetchall()
    for row in rows:
        plan_id, code, limits_raw = row[0], row[1], row[2]
        limits = _as_dict(limits_raw)
        if code in _ADDON_PURCHASE_BY_CODE:
            limits["addon_purchase"] = _ADDON_PURCHASE_BY_CODE[code]
        elif "addon_purchase" not in limits:
            # Unknown plans: fail-closed.
            limits["addon_purchase"] = False
        bind.execute(
            plans.update().where(plans.c.id == plan_id).values(limits=limits)
        )

    if "addon_packages" not in insp.get_table_names():
        return

    addons = sa.table(
        "addon_packages",
        sa.column("id", sa.Integer),
        sa.column("available_from_plan", sa.JSON),
    )
    addon_rows = bind.execute(
        sa.select(addons.c.id, addons.c.available_from_plan)
    ).fetchall()
    for row in addon_rows:
        addon_id, raw = row[0], row[1]
        # Normalize single-string "start" → "business" (packages from Business+).
        if raw == "start" or raw == '"start"':
            bind.execute(
                addons.update()
                .where(addons.c.id == addon_id)
                .values(available_from_plan="business")
            )
            continue
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw
        else:
            parsed = raw
        if parsed == "start":
            bind.execute(
                addons.update()
                .where(addons.c.id == addon_id)
                .values(available_from_plan="business")
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "plans" not in insp.get_table_names():
        return

    plans = sa.table(
        "plans",
        sa.column("id", sa.Integer),
        sa.column("limits", sa.JSON),
    )
    rows = bind.execute(sa.select(plans.c.id, plans.c.limits)).fetchall()
    for row in rows:
        plan_id, limits_raw = row[0], row[1]
        limits = _as_dict(limits_raw)
        if "addon_purchase" in limits:
            limits.pop("addon_purchase", None)
            bind.execute(
                plans.update().where(plans.c.id == plan_id).values(limits=limits)
            )
