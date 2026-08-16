"""
Stage 7.2: versioned addon pricing grids.

Creates addon_pricing_grid_versions, backfills from existing tiers, then
requires grid_version_id on addon_pricing_tiers (SQLite-friendly batch).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "addon_pricing_grid_versions_037"
down_revision = "addon_pricing_tiers_036"
branch_labels = None
depends_on = None


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    dialect = bind.dialect.name

    if "addon_pricing_grid_versions" not in tables:
        op.create_table(
            "addon_pricing_grid_versions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("resource_type", sa.String(32), nullable=False),
            sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
            sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
            sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("based_on_version_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ["based_on_version_id"],
                ["addon_pricing_grid_versions.id"],
                ondelete="SET NULL",
            ),
        )
        op.create_index(
            "ix_addon_pricing_grid_versions_resource_type",
            "addon_pricing_grid_versions",
            ["resource_type"],
        )
        op.create_index(
            "ix_addon_pricing_grid_versions_status",
            "addon_pricing_grid_versions",
            ["status"],
        )
        op.create_index(
            "ix_addon_pricing_grid_versions_resource_currency_status",
            "addon_pricing_grid_versions",
            ["resource_type", "currency", "status"],
        )

    inspector = sa.inspect(bind)
    tier_cols = {c["name"] for c in inspector.get_columns("addon_pricing_tiers")}
    if "grid_version_id" not in tier_cols:
        if dialect == "sqlite":
            with op.batch_alter_table("addon_pricing_tiers") as batch_op:
                batch_op.add_column(
                    sa.Column("grid_version_id", sa.Integer(), nullable=True)
                )
        else:
            op.add_column(
                "addon_pricing_tiers",
                sa.Column("grid_version_id", sa.Integer(), nullable=True),
            )

    # --- Backfill versions from existing tiers ---
    tiers = bind.execute(
        sa.text(
            "SELECT id, resource_type, currency, is_active "
            "FROM addon_pricing_tiers "
            "WHERE grid_version_id IS NULL "
            "ORDER BY id ASC"
        )
    ).fetchall()

    groups: dict[tuple[str, str], list] = defaultdict(list)
    for row in tiers:
        rt = str(row[1] or "").strip()
        cur = str(row[2] or "RUB").strip().upper() or "RUB"
        groups[(rt, cur)].append(row)

    now = _utcnow_naive()
    versions = sa.table(
        "addon_pricing_grid_versions",
        sa.column("id", sa.Integer),
        sa.column("resource_type", sa.String),
        sa.column("currency", sa.String),
        sa.column("status", sa.String),
        sa.column("version_number", sa.Integer),
        sa.column("based_on_version_id", sa.Integer),
        sa.column("created_at", sa.DateTime),
        sa.column("published_at", sa.DateTime),
        sa.column("archived_at", sa.DateTime),
        sa.column("note", sa.Text),
    )

    def _insert_version(*, resource_type: str, currency: str, status: str) -> int:
        published_at = now if status == "active" else None
        archived_at = now if status == "archived" else None
        result = bind.execute(
            versions.insert().values(
                resource_type=resource_type,
                currency=currency,
                status=status,
                version_number=1,
                based_on_version_id=None,
                created_at=now,
                published_at=published_at,
                archived_at=archived_at,
                note="backfill from flat tiers (037)",
            )
        )
        pk = getattr(result, "inserted_primary_key", None)
        if pk and len(pk) > 0 and pk[0] is not None:
            return int(pk[0])
        # SQLite / Core insert may omit inserted_primary_key for bare Table inserts.
        if dialect == "sqlite":
            rid = bind.execute(sa.text("SELECT last_insert_rowid()")).scalar()
            if rid is not None:
                return int(rid)
        rid = bind.execute(
            sa.text(
                "SELECT id FROM addon_pricing_grid_versions "
                "WHERE resource_type = :rt AND currency = :cur AND status = :st "
                "ORDER BY id DESC LIMIT 1"
            ),
            {"rt": resource_type, "cur": currency, "st": status},
        ).scalar()
        if rid is None:
            raise RuntimeError(
                "addon_pricing_grid_versions_037: failed to resolve new version id"
            )
        return int(rid)

    for (resource_type, currency), rows in groups.items():
        active_ids = [int(r[0]) for r in rows if bool(r[3])]
        inactive_ids = [int(r[0]) for r in rows if not bool(r[3])]

        if active_ids:
            active_vid = _insert_version(
                resource_type=resource_type, currency=currency, status="active"
            )
            for tid in active_ids:
                bind.execute(
                    sa.text(
                        "UPDATE addon_pricing_tiers "
                        "SET grid_version_id = :vid WHERE id = :tid"
                    ),
                    {"vid": active_vid, "tid": tid},
                )
            if inactive_ids:
                archived_vid = _insert_version(
                    resource_type=resource_type, currency=currency, status="archived"
                )
                for tid in inactive_ids:
                    bind.execute(
                        sa.text(
                            "UPDATE addon_pricing_tiers "
                            "SET grid_version_id = :vid WHERE id = :tid"
                        ),
                        {"vid": archived_vid, "tid": tid},
                    )
        elif inactive_ids:
            archived_vid = _insert_version(
                resource_type=resource_type, currency=currency, status="archived"
            )
            for tid in inactive_ids:
                bind.execute(
                    sa.text(
                        "UPDATE addon_pricing_tiers "
                        "SET grid_version_id = :vid WHERE id = :tid"
                    ),
                    {"vid": archived_vid, "tid": tid},
                )

    # Orphan safety: any remaining NULL grid_version_id → archived catch-all
    orphans = bind.execute(
        sa.text(
            "SELECT id, resource_type, currency FROM addon_pricing_tiers "
            "WHERE grid_version_id IS NULL"
        )
    ).fetchall()
    for row in orphans:
        tid, rt, cur = int(row[0]), str(row[1] or "messages"), str(row[2] or "RUB").upper()
        vid = _insert_version(resource_type=rt, currency=cur, status="archived")
        bind.execute(
            sa.text(
                "UPDATE addon_pricing_tiers SET grid_version_id = :vid WHERE id = :tid"
            ),
            {"vid": vid, "tid": tid},
        )

    # Make NOT NULL + FK (SQLite via batch recreate)
    inspector = sa.inspect(bind)
    tier_cols = {c["name"] for c in inspector.get_columns("addon_pricing_tiers")}
    if "grid_version_id" in tier_cols:
        nulls = bind.execute(
            sa.text(
                "SELECT COUNT(*) FROM addon_pricing_tiers WHERE grid_version_id IS NULL"
            )
        ).scalar()
        if int(nulls or 0) > 0:
            raise RuntimeError(
                "addon_pricing_grid_versions_037: unresolved NULL grid_version_id"
            )

        if dialect == "sqlite":
            with op.batch_alter_table("addon_pricing_tiers") as batch_op:
                batch_op.alter_column(
                    "grid_version_id",
                    existing_type=sa.Integer(),
                    nullable=False,
                )
                batch_op.create_foreign_key(
                    "fk_addon_pricing_tiers_grid_version_id",
                    "addon_pricing_grid_versions",
                    ["grid_version_id"],
                    ["id"],
                    ondelete="CASCADE",
                )
                batch_op.create_index(
                    "ix_addon_pricing_tiers_grid_version_id",
                    ["grid_version_id"],
                )
        else:
            op.alter_column(
                "addon_pricing_tiers",
                "grid_version_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
            op.create_foreign_key(
                "fk_addon_pricing_tiers_grid_version_id",
                "addon_pricing_tiers",
                "addon_pricing_grid_versions",
                ["grid_version_id"],
                ["id"],
                ondelete="CASCADE",
            )
            op.create_index(
                "ix_addon_pricing_tiers_grid_version_id",
                "addon_pricing_tiers",
                ["grid_version_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    dialect = bind.dialect.name

    if "addon_pricing_tiers" in tables:
        tier_cols = {c["name"] for c in inspector.get_columns("addon_pricing_tiers")}
        if "grid_version_id" in tier_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("addon_pricing_tiers") as batch_op:
                    try:
                        batch_op.drop_constraint(
                            "fk_addon_pricing_tiers_grid_version_id",
                            type_="foreignkey",
                        )
                    except Exception:
                        pass
                    try:
                        batch_op.drop_index("ix_addon_pricing_tiers_grid_version_id")
                    except Exception:
                        pass
                    batch_op.drop_column("grid_version_id")
            else:
                try:
                    op.drop_constraint(
                        "fk_addon_pricing_tiers_grid_version_id",
                        "addon_pricing_tiers",
                        type_="foreignkey",
                    )
                except Exception:
                    pass
                try:
                    op.drop_index(
                        "ix_addon_pricing_tiers_grid_version_id",
                        table_name="addon_pricing_tiers",
                    )
                except Exception:
                    pass
                op.drop_column("addon_pricing_tiers", "grid_version_id")

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "addon_pricing_grid_versions" in tables:
        op.drop_index(
            "ix_addon_pricing_grid_versions_resource_currency_status",
            table_name="addon_pricing_grid_versions",
        )
        op.drop_index(
            "ix_addon_pricing_grid_versions_status",
            table_name="addon_pricing_grid_versions",
        )
        op.drop_index(
            "ix_addon_pricing_grid_versions_resource_type",
            table_name="addon_pricing_grid_versions",
        )
        op.drop_table("addon_pricing_grid_versions")
