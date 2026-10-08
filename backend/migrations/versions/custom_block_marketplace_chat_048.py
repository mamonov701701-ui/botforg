"""Link Custom Block marketplace requests to the existing private chat.

Revision ID: custom_block_marketplace_chat_048
Revises: custom_block_marketplace_047
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_marketplace_chat_048"
down_revision = "custom_block_marketplace_047"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("custom_block_access_requests") as batch:
        batch.add_column(sa.Column("chat_room_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_cb_access_request_chat_room",
            "chat_rooms",
            ["chat_room_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_cb_access_request_chat_room", ["chat_room_id"])


def downgrade():
    with op.batch_alter_table("custom_block_access_requests") as batch:
        batch.drop_index("ix_cb_access_request_chat_room")
        batch.drop_constraint("fk_cb_access_request_chat_room", type_="foreignkey")
        batch.drop_column("chat_room_id")
