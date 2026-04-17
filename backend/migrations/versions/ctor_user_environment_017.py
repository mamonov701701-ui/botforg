"""ctor_bot_users: add environment dev/prod"""

from alembic import op
import sqlalchemy as sa


revision = "ctor_user_environment_017"
down_revision = "ctor_var_archived_016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ctor_bot_users") as batch:
        batch.add_column(
            sa.Column("environment", sa.String(length=16), nullable=False, server_default="prod")
        )
    op.execute(
        "UPDATE ctor_bot_users SET environment = 'prod' "
        "WHERE environment IS NULL OR environment NOT IN ('dev','prod')"
    )
    with op.batch_alter_table("ctor_bot_users") as batch:
        batch.create_check_constraint(
            "ck_ctor_bot_users_environment", "environment IN ('dev','prod')"
        )
        batch.drop_constraint("uq_ctor_bot_users_bot_channel_external", type_="unique")
        batch.create_unique_constraint(
            "uq_ctor_bot_users_bot_env_channel_external",
            ["bot_id", "environment", "channel", "external_user_id"],
        )
        batch.create_index("ix_ctor_bot_users_bot_env", ["bot_id", "environment"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("ctor_bot_users") as batch:
        batch.drop_index("ix_ctor_bot_users_bot_env")
        batch.drop_constraint("uq_ctor_bot_users_bot_env_channel_external", type_="unique")
        batch.create_unique_constraint(
            "uq_ctor_bot_users_bot_channel_external",
            ["bot_id", "channel", "external_user_id"],
        )
        batch.drop_constraint("ck_ctor_bot_users_environment", type_="check")
        batch.drop_column("environment")
