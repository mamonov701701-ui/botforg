"""
Stage 6.10A: payment_provider_connections + payment_attempts.connection_id.

Совместимость SQLite / PostgreSQL.
Legacy payment_provider_settings сохраняется (этап 6.9 UI); данные не теряются.
Connections создаются пустыми только для available адаптеров при необходимости —
seed из settings не копирует секреты (их не было в БД).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "payment_provider_connections_024"
down_revision = "payment_provider_settings_023"
branch_labels = None
depends_on = None


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def _boolean_default(value: bool):
    if op.get_bind().dialect.name == "postgresql":
        return sa.text("true" if value else "false")
    return sa.text("1" if value else "0")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "payment_provider_connections" not in tables:
        op.create_table(
            "payment_provider_connections",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("provider_code", sa.String(64), nullable=False),
            sa.Column("connection_name", sa.String(128), nullable=False),
            sa.Column("mode", sa.String(32), nullable=False, server_default="test"),
            sa.Column(
                "enabled",
                sa.Boolean(),
                nullable=False,
                server_default=_boolean_default(False),
            ),
            sa.Column(
                "verified",
                sa.Boolean(),
                nullable=False,
                server_default=_boolean_default(False),
            ),
            sa.Column(
                "is_default",
                sa.Boolean(),
                nullable=False,
                server_default=_boolean_default(False),
            ),
            sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("public_identifier_masked", sa.String(255), nullable=True),
            sa.Column(
                "credentials_version",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("credentials_key_id", sa.String(64), nullable=True),
            sa.Column("credentials_encryption_version", sa.Integer(), nullable=True),
            sa.Column("credentials_nonce", sa.LargeBinary(), nullable=True),
            sa.Column("credentials_ciphertext", sa.LargeBinary(), nullable=True),
            sa.Column("credentials_auth_tag", sa.LargeBinary(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("updated_by", sa.Integer(), nullable=True),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("last_health_check_at", sa.DateTime(), nullable=True),
            sa.Column("last_health_check_status", sa.String(64), nullable=True),
            sa.Column("legacy_settings_code", sa.String(64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=_timestamp_server_default(),
            ),
            sa.ForeignKeyConstraint(
                ["created_by"], ["users.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["updated_by"], ["users.id"], ondelete="SET NULL"
            ),
            sa.UniqueConstraint(
                "provider_code",
                "connection_name",
                name="uq_ppc_provider_connection_name",
            ),
        )
        op.create_index(
            "ix_ppc_provider_code",
            "payment_provider_connections",
            ["provider_code"],
        )
        op.create_index(
            "ix_ppc_enabled",
            "payment_provider_connections",
            ["enabled"],
        )
        op.create_index(
            "ix_ppc_is_default",
            "payment_provider_connections",
            ["is_default"],
        )
        op.create_index(
            "ix_ppc_mode",
            "payment_provider_connections",
            ["mode"],
        )
        op.create_index(
            "ix_payment_provider_connections_id",
            "payment_provider_connections",
            ["id"],
        )

    # payment_attempts.connection_id (nullable FK, SET NULL on delete)
    if "payment_attempts" in tables:
        cols = {c["name"] for c in insp.get_columns("payment_attempts")}
        if "connection_id" not in cols:
            dialect = bind.dialect.name
            if dialect == "sqlite":
                with op.batch_alter_table("payment_attempts") as batch:
                    batch.add_column(
                        sa.Column("connection_id", sa.Integer(), nullable=True)
                    )
                    batch.create_foreign_key(
                        "fk_payment_attempts_connection_id",
                        "payment_provider_connections",
                        ["connection_id"],
                        ["id"],
                        ondelete="SET NULL",
                    )
                    batch.create_index(
                        "ix_payment_attempts_connection_id",
                        ["connection_id"],
                    )
            else:
                op.add_column(
                    "payment_attempts",
                    sa.Column("connection_id", sa.Integer(), nullable=True),
                )
                op.create_foreign_key(
                    "fk_payment_attempts_connection_id",
                    "payment_attempts",
                    "payment_provider_connections",
                    ["connection_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
                op.create_index(
                    "ix_payment_attempts_connection_id",
                    "payment_attempts",
                    ["connection_id"],
                )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "payment_attempts" in tables:
        cols = {c["name"] for c in insp.get_columns("payment_attempts")}
        if "connection_id" in cols:
            dialect = bind.dialect.name
            if dialect == "sqlite":
                with op.batch_alter_table("payment_attempts") as batch:
                    batch.drop_index("ix_payment_attempts_connection_id")
                    batch.drop_constraint(
                        "fk_payment_attempts_connection_id", type_="foreignkey"
                    )
                    batch.drop_column("connection_id")
            else:
                op.drop_index(
                    "ix_payment_attempts_connection_id",
                    table_name="payment_attempts",
                )
                op.drop_constraint(
                    "fk_payment_attempts_connection_id",
                    "payment_attempts",
                    type_="foreignkey",
                )
                op.drop_column("payment_attempts", "connection_id")

    if "payment_provider_connections" in tables:
        op.drop_table("payment_provider_connections")
