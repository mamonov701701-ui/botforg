"""ctor_bot_variable_definitions: is_archived for CRM"""

from alembic import op
import sqlalchemy as sa


revision = "ctor_var_archived_016"
down_revision = "constructor_core_015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ctor_bot_variable_definitions",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_ctor_bot_var_def_archived",
        "ctor_bot_variable_definitions",
        ["bot_id", "is_archived"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ctor_bot_var_def_archived", table_name="ctor_bot_variable_definitions")
    op.drop_column("ctor_bot_variable_definitions", "is_archived")
