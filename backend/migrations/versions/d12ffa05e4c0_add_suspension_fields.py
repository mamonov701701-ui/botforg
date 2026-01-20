"""add_suspension_fields

Revision ID: d12ffa05e4c0
Revises: 891de05b15e2
Create Date: 2026-01-19 21:17:39.256747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd12ffa05e4c0'
down_revision: Union[str, Sequence[str], None] = '891de05b15e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add suspension fields to users and bots tables."""
    # Add suspension columns to users table
    op.add_column('users', sa.Column('is_suspended', sa.Boolean(), nullable=True, server_default='0'))
    op.add_column('users', sa.Column('suspension_type', sa.String(), nullable=True))
    op.add_column('users', sa.Column('suspension_reason', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('suspended_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('suspended_until', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('suspended_by_id', sa.Integer(), nullable=True))
    
    # Add suspension columns to bots table
    op.add_column('bots', sa.Column('is_suspended', sa.Boolean(), nullable=True, server_default='0'))
    op.add_column('bots', sa.Column('suspension_type', sa.String(), nullable=True))
    op.add_column('bots', sa.Column('suspension_reason', sa.Text(), nullable=True))
    op.add_column('bots', sa.Column('suspended_at', sa.DateTime(), nullable=True))
    op.add_column('bots', sa.Column('suspended_until', sa.DateTime(), nullable=True))
    op.add_column('bots', sa.Column('suspended_by_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Remove suspension fields from users and bots tables."""
    # Remove suspension columns from users table
    op.drop_column('users', 'suspended_by_id')
    op.drop_column('users', 'suspended_until')
    op.drop_column('users', 'suspended_at')
    op.drop_column('users', 'suspension_reason')
    op.drop_column('users', 'suspension_type')
    op.drop_column('users', 'is_suspended')
    
    # Remove suspension columns from bots table
    op.drop_column('bots', 'suspended_by_id')
    op.drop_column('bots', 'suspended_until')
    op.drop_column('bots', 'suspended_at')
    op.drop_column('bots', 'suspension_reason')
    op.drop_column('bots', 'suspension_type')
    op.drop_column('bots', 'is_suspended')
