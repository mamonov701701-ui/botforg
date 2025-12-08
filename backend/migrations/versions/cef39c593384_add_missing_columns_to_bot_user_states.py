"""add_missing_columns_to_bot_user_states

Revision ID: cef39c593384
Revises: cadf51a204bd
Create Date: 2025-12-08 22:10:53.991480

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cef39c593384'
down_revision: Union[str, Sequence[str], None] = 'cadf51a204bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
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
    
    # Добавляем current_scenario_id если не существует
    if not column_exists('bot_user_states', 'current_scenario_id'):
        op.add_column('bot_user_states', sa.Column('current_scenario_id', sa.Integer(), nullable=True))
        if is_sqlite:
            # Для SQLite добавляем внешний ключ отдельно
            conn.execute(sa.text("""
                CREATE INDEX IF NOT EXISTS ix_bot_user_states_current_scenario_id 
                ON bot_user_states(current_scenario_id)
            """))
    
    # Добавляем context если не существует
    if not column_exists('bot_user_states', 'context'):
        op.add_column('bot_user_states', sa.Column('context', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Удаляем колонки (только если они были добавлены этой миграцией)
    # В реальности лучше не удалять, так как могут быть данные
    # op.drop_column('bot_user_states', 'context')
    # op.drop_column('bot_user_states', 'current_scenario_id')
    pass
