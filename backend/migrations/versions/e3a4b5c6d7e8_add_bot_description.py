"""Add bot description field

Revision ID: e3a4b5c6d7e8
Revises: d12ffa05e4c0
Create Date: 2026-01-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3a4b5c6d7e8'
down_revision = 'd12ffa05e4c0'
branch_labels = None
depends_on = None


def upgrade():
    # Add description column to bots table
    op.add_column('bots', sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    # Remove description column from bots table
    op.drop_column('bots', 'description')
