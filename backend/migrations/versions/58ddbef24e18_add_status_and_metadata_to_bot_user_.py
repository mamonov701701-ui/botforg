"""add_status_and_metadata_to_bot_user_states

Revision ID: 58ddbef24e18
Revises: 3a8f2b1c4d5e
Create Date: 2025-12-08 21:50:52.825432

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '58ddbef24e18'
down_revision: Union[str, Sequence[str], None] = '3a8f2b1c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    import random
    
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    # Проверяем существование колонок (для SQLite)
    def column_exists(table_name, column_name):
        """Проверка существования колонки в SQLite"""
        if not is_sqlite:
            return False
        result = conn.execute(sa.text(f"PRAGMA table_info({table_name})"))
        columns = [row[1] for row in result.fetchall()]
        return column_name in columns
    
    # Добавляем public_id если не существует
    if not column_exists('bot_user_states', 'public_id'):
        op.add_column('bot_user_states', sa.Column('public_id', sa.BigInteger(), nullable=True))
        
        # Генерируем public_id для существующих записей
        result = conn.execute(sa.text("SELECT id FROM bot_user_states"))
        rows = result.fetchall()
        used_ids = set()
        for row in rows:
            while True:
                public_id = random.randint(100000000000, 999999999999)
                if public_id not in used_ids:
                    used_ids.add(public_id)
                    break
            conn.execute(sa.text(f"UPDATE bot_user_states SET public_id = {public_id} WHERE id = {row[0]}"))
        conn.commit()
        
        # Для SQLite создаем уникальный индекс, для других БД - constraint
        if is_sqlite:
            op.create_index('ix_bot_user_states_public_id', 'bot_user_states', ['public_id'], unique=True)
        else:
            op.alter_column('bot_user_states', 'public_id', nullable=False)
            op.create_unique_constraint('uq_bot_user_states_public_id', 'bot_user_states', ['public_id'])
            op.create_index('ix_bot_user_states_public_id', 'bot_user_states', ['public_id'])
    
    # Добавляем channel если не существует
    if not column_exists('bot_user_states', 'channel'):
        if is_sqlite:
            op.add_column('bot_user_states', sa.Column('channel', sa.String(length=20), nullable=True, server_default='telegram'))
            # Обновляем существующие записи
            conn.execute(sa.text("UPDATE bot_user_states SET channel = 'telegram' WHERE channel IS NULL"))
            conn.commit()
        else:
            op.add_column('bot_user_states', sa.Column('channel', sa.String(length=20), server_default='telegram', nullable=False))
    
    # Добавляем status если не существует
    if not column_exists('bot_user_states', 'status'):
        if is_sqlite:
            op.add_column('bot_user_states', sa.Column('status', sa.String(length=20), nullable=True, server_default='active'))
            # Обновляем существующие записи
            conn.execute(sa.text("UPDATE bot_user_states SET status = 'active' WHERE status IS NULL"))
            conn.commit()
        else:
            op.add_column('bot_user_states', sa.Column('status', sa.String(length=20), server_default='active', nullable=False))
        op.create_index('ix_bot_user_states_status', 'bot_user_states', ['status'])
    
    # Добавляем last_interaction_at если не существует
    if not column_exists('bot_user_states', 'last_interaction_at'):
        op.add_column('bot_user_states', sa.Column('last_interaction_at', sa.DateTime(), nullable=True))
        op.create_index('ix_bot_user_states_last_interaction_at', 'bot_user_states', ['last_interaction_at'])
        # Устанавливаем last_interaction_at = updated_at для существующих записей
        conn.execute(sa.text("UPDATE bot_user_states SET last_interaction_at = updated_at WHERE last_interaction_at IS NULL"))
        conn.commit()


def downgrade() -> None:
    """Downgrade schema."""
    # Удаляем индексы
    op.drop_index('ix_bot_user_states_last_interaction_at', table_name='bot_user_states')
    op.drop_index('ix_bot_user_states_status', table_name='bot_user_states')
    op.drop_index('ix_bot_user_states_public_id', table_name='bot_user_states')
    op.drop_constraint('uq_bot_user_states_public_id', 'bot_user_states', type_='unique')
    
    # Удаляем колонки
    op.drop_column('bot_user_states', 'last_interaction_at')
    op.drop_column('bot_user_states', 'status')
    op.drop_column('bot_user_states', 'channel')
    op.drop_column('bot_user_states', 'public_id')
