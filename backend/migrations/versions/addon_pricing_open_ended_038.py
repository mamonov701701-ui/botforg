"""
Stage 7.2 follow-up: normalize fictitious upper bounds on live pricing tiers.

Sets range_end=NULL for the last tier of each grid version when the stored
upper bound is at/above the technical custom-quantity max (1_000_000).

Does not rewrite CheckoutIntent.price_grid_snapshot (historical purchases).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "addon_pricing_open_ended_038"
down_revision = "addon_pricing_grid_versions_037"
branch_labels = None
depends_on = None

# Must match backend.services.addon_custom_pack.MAX_CUSTOM_QUANTITY
_TECHNICAL_MAX = 1_000_000


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "addon_pricing_tiers" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("addon_pricing_tiers")}
    if "grid_version_id" not in cols or "range_end" not in cols:
        return

    tiers = sa.table(
        "addon_pricing_tiers",
        sa.column("id", sa.Integer),
        sa.column("grid_version_id", sa.Integer),
        sa.column("range_start", sa.Integer),
        sa.column("range_end", sa.Integer),
    )
    rows = bind.execute(
        sa.select(
            tiers.c.id,
            tiers.c.grid_version_id,
            tiers.c.range_start,
            tiers.c.range_end,
        ).where(tiers.c.grid_version_id.isnot(None))
    ).fetchall()

    by_version: dict[int, list] = {}
    for row in rows:
        vid = int(row.grid_version_id)
        by_version.setdefault(vid, []).append(row)

    for _vid, group in by_version.items():
        group.sort(key=lambda r: (int(r.range_start), int(r.id)))
        last = group[-1]
        if last.range_end is None:
            continue
        try:
            end = int(last.range_end)
        except (TypeError, ValueError):
            continue
        if end >= _TECHNICAL_MAX:
            bind.execute(
                tiers.update()
                .where(tiers.c.id == int(last.id))
                .values(range_end=None)
            )


def downgrade() -> None:
    # Cannot restore fictitious upper bounds without inventing data.
    pass
