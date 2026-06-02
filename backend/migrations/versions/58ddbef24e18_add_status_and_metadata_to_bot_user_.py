"""add_status_and_metadata_to_bot_user_states

Revision ID: 58ddbef24e18
Revises: 3a8f2b1c4d5e
Create Date: 2025-12-08 21:50:52.825432

"""
from typing import Sequence, Union

import random

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '58ddbef24e18'
down_revision: Union[str, Sequence[str], None] = '3a8f2b1c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return False
    return column_name in {c["name"] for c in insp.get_columns(table_name)}


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'

    if not _column_exists(conn, 'bot_user_states', 'public_id'):
        op.add_column('bot_user_states', sa.Column('public_id', sa.BigInteger(), nullable=True))

        result = conn.execute(sa.text("SELECT id FROM bot_user_states"))
        rows = result.fetchall()
        used_ids = set()
        for row in rows:
            while True:
                public_id = random.randint(100000000000, 999999999999)
                if public_id not in used_ids:
                    used_ids.add(public_id)
                    break
            conn.execute(
                sa.text("UPDATE bot_user_states SET public_id = :pid WHERE id = :id"),
                {"pid": public_id, "id": row[0]},
            )

        if is_sqlite:
            op.create_index(
                'ix_bot_user_states_public_id',
                'bot_user_states',
                ['public_id'],
                unique=True,
            )
        else:
            op.alter_column('bot_user_states', 'public_id', nullable=False)
            op.create_unique_constraint(
                'uq_bot_user_states_public_id', 'bot_user_states', ['public_id']
            )
            op.create_index('ix_bot_user_states_public_id', 'bot_user_states', ['public_id'])

    if not _column_exists(conn, 'bot_user_states', 'channel'):
        if is_sqlite:
            op.add_column(
                'bot_user_states',
                sa.Column(
                    'channel',
                    sa.String(length=20),
                    nullable=True,
                    server_default='telegram',
                ),
            )
            conn.execute(
                sa.text(
                    "UPDATE bot_user_states SET channel = 'telegram' WHERE channel IS NULL"
                )
            )
        else:
            op.add_column(
                'bot_user_states',
                sa.Column(
                    'channel',
                    sa.String(length=20),
                    server_default='telegram',
                    nullable=False,
                ),
            )

    if not _column_exists(conn, 'bot_user_states', 'status'):
        if is_sqlite:
            op.add_column(
                'bot_user_states',
                sa.Column(
                    'status',
                    sa.String(length=20),
                    nullable=True,
                    server_default='active',
                ),
            )
            conn.execute(
                sa.text(
                    "UPDATE bot_user_states SET status = 'active' WHERE status IS NULL"
                )
            )
        else:
            op.add_column(
                'bot_user_states',
                sa.Column(
                    'status',
                    sa.String(length=20),
                    server_default='active',
                    nullable=False,
                ),
            )
        op.create_index('ix_bot_user_states_status', 'bot_user_states', ['status'])

    if not _column_exists(conn, 'bot_user_states', 'last_interaction_at'):
        op.add_column(
            'bot_user_states',
            sa.Column('last_interaction_at', sa.DateTime(), nullable=True),
        )
        op.create_index(
            'ix_bot_user_states_last_interaction_at',
            'bot_user_states',
            ['last_interaction_at'],
        )
        conn.execute(
            sa.text(
                "UPDATE bot_user_states SET last_interaction_at = updated_at "
                "WHERE last_interaction_at IS NULL"
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_bot_user_states_last_interaction_at', table_name='bot_user_states')
    op.drop_index('ix_bot_user_states_status', table_name='bot_user_states')
    op.drop_index('ix_bot_user_states_public_id', table_name='bot_user_states')
    op.drop_constraint('uq_bot_user_states_public_id', 'bot_user_states', type_='unique')

    op.drop_column('bot_user_states', 'last_interaction_at')
    op.drop_column('bot_user_states', 'status')
    op.drop_column('bot_user_states', 'channel')
    op.drop_column('bot_user_states', 'public_id')
