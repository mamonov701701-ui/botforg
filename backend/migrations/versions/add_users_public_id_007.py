"""add public_id to users

Revision ID: users_public_id_007
Revises: legal_152_006
Create Date: 2026-02-02

"""
import random
from alembic import op
import sqlalchemy as sa

revision = "users_public_id_007"
down_revision = "legal_152_006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"]: c for c in insp.get_columns("users")}
    if "public_id" not in cols:
        op.add_column(
            "users",
            sa.Column("public_id", sa.BigInteger(), nullable=True),
        )

    rows = conn.execute(sa.text("SELECT id FROM users WHERE public_id IS NULL")).fetchall()
    used = set()
    for (user_id,) in rows:
        while True:
            public_id = random.randint(10000000, 99999999)
            if public_id not in used:
                used.add(public_id)
                break
        conn.execute(sa.text("UPDATE users SET public_id = :pid WHERE id = :id"), {"pid": public_id, "id": user_id})

    insp = sa.inspect(conn)
    pub_col = next(c for c in insp.get_columns("users") if c["name"] == "public_id")
    if pub_col.get("nullable", True):
        with op.batch_alter_table("users") as batch:
            batch.alter_column(
                "public_id",
                existing_type=sa.BigInteger(),
                nullable=False,
            )

    insp = sa.inspect(conn)
    idx_keys = {ix["name"] for ix in insp.get_indexes("users")}
    if "ix_users_public_id" not in idx_keys:
        op.create_index(op.f("ix_users_public_id"), "users", ["public_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_public_id"), table_name="users")
    op.drop_column("users", "public_id")
