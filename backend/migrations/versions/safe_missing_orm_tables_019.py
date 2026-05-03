"""Additive-only: отсутствующие таблицы ORM (nodes, edges, scenario_events, user_sessions, bf_team_members).

Условное создание через SQLAlchemy inspector — безопасно для повторных запусков Postgres/SQLite.
Не трогает legacy ``team_members`` и не переименовывает таблицы.

revision ID: safe_missing_orm_tables_019
Revises: crm_perf_indexes_018
"""

from alembic import op
import sqlalchemy as sa


revision = "safe_missing_orm_tables_019"
down_revision = "crm_perf_indexes_018"
branch_labels = None
depends_on = None


def _ensure_index(
    bind,
    table_name: str,
    index_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return
    existing = {ix["name"] for ix in insp.get_indexes(table_name)}
    if index_name in existing:
        return
    op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()

    if not sa.inspect(bind).has_table("nodes"):
        op.create_table(
            "nodes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("position_x", sa.Integer(), nullable=True),
            sa.Column("position_y", sa.Integer(), nullable=True),
            sa.Column("data", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(
                ["template_id"],
                ["templates.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    _ensure_index(bind, "nodes", "ix_nodes_id", ["id"])
    _ensure_index(bind, "nodes", "ix_nodes_template_id", ["template_id"])

    if not sa.inspect(bind).has_table("edges"):
        op.create_table(
            "edges",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("target", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=True),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("data", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(
                ["template_id"],
                ["templates.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    _ensure_index(bind, "edges", "ix_edges_id", ["id"])
    _ensure_index(bind, "edges", "ix_edges_template_id", ["template_id"])

    if not sa.inspect(bind).has_table("scenario_events"):
        op.create_table(
            "scenario_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("scenario_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("step", sa.String(length=255), nullable=True),
            sa.Column("event_type", sa.String(length=40), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _ensure_index(bind, "scenario_events", "ix_scenario_events_step", ["step"])
    _ensure_index(bind, "scenario_events", "ix_scenario_events_event_type", ["event_type"])
    _ensure_index(bind, "scenario_events", "ix_scenario_events_user_id", ["user_id"])
    _ensure_index(bind, "scenario_events", "ix_scenario_events_id", ["id"])
    _ensure_index(bind, "scenario_events", "ix_scenario_events_scenario_id", ["scenario_id"])
    _ensure_index(bind, "scenario_events", "ix_scenario_events_created_at", ["created_at"])

    if not sa.inspect(bind).has_table("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("scenario_id", sa.Integer(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _ensure_index(bind, "user_sessions", "ix_user_sessions_id", ["id"])
    _ensure_index(bind, "user_sessions", "ix_user_sessions_user_id", ["user_id"])
    _ensure_index(bind, "user_sessions", "ix_user_sessions_started_at", ["started_at"])
    _ensure_index(bind, "user_sessions", "ix_user_sessions_status", ["status"])
    _ensure_index(bind, "user_sessions", "ix_user_sessions_scenario_id", ["scenario_id"])

    if not sa.inspect(bind).has_table("bf_team_members"):
        op.create_table(
            "bf_team_members",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("added_by", sa.Integer(), nullable=False),
            sa.Column("added_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.ForeignKeyConstraint(["added_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _ensure_index(bind, "bf_team_members", "ix_bf_team_members_id", ["id"])
    _ensure_index(
        bind,
        "bf_team_members",
        "ix_bf_team_members_user_id",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    raise NotImplementedError(
        "safe_missing_orm_tables_019 is irreversible (additive stabilization)."
    )
