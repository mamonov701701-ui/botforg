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
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
