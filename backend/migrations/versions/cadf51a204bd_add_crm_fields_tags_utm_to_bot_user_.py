"""add_crm_fields_tags_utm_to_bot_user_states

Revision ID: cadf51a204bd
Revises: 58ddbef24e18
Create Date: 2025-12-08 21:54:42.226805

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cadf51a204bd'
down_revision: Union[str, Sequence[str], None] = '58ddbef24e18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Добавляем CRM-поля в bot_user_states
    op.add_column('bot_user_states', sa.Column('name', sa.String(length=100), nullable=True))
    op.add_column('bot_user_states', sa.Column('email', sa.String(length=100), nullable=True))
    op.add_column('bot_user_states', sa.Column('phone', sa.String(length=20), nullable=True))
    
    # Создаем индексы для email и phone для быстрого поиска
    op.create_index('ix_bot_user_states_email', 'bot_user_states', ['email'])
    op.create_index('ix_bot_user_states_phone', 'bot_user_states', ['phone'])
    
    # Добавляем UTM-метки и точку входа
    op.add_column('bot_user_states', sa.Column('entry_point', sa.String(length=50), nullable=True))
    op.add_column('bot_user_states', sa.Column('utm_source', sa.String(length=50), nullable=True))
    op.add_column('bot_user_states', sa.Column('utm_campaign', sa.String(length=50), nullable=True))
    
    # Создаем таблицу bot_tags (справочник тегов)
    op.create_table(
        'bot_tags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bot_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bot_id'], ['bot_instances.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_bot_tags_bot_id', 'bot_tags', ['bot_id'])
    
    # Создаем таблицу bot_contact_tags (связь многие-ко-многим)
    op.create_table(
        'bot_contact_tags',
        sa.Column('bot_contact_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bot_contact_id'], ['bot_user_states.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['bot_tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('bot_contact_id', 'tag_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Удаляем таблицы тегов
    op.drop_table('bot_contact_tags')
    op.drop_table('bot_tags')
    
    # Удаляем индексы
    op.drop_index('ix_bot_user_states_phone', table_name='bot_user_states')
    op.drop_index('ix_bot_user_states_email', table_name='bot_user_states')
    
    # Удаляем UTM-метки
    op.drop_column('bot_user_states', 'utm_campaign')
    op.drop_column('bot_user_states', 'utm_source')
    op.drop_column('bot_user_states', 'entry_point')
    
    # Удаляем CRM-поля
    op.drop_column('bot_user_states', 'phone')
    op.drop_column('bot_user_states', 'email')
    op.drop_column('bot_user_states', 'name')
