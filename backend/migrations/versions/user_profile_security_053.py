"""Stage 8 account profile and security foundation.

Existing users remain in the legacy-compatible verification/session mode. New
registrations opt in to the strict contract at creation time.
"""

from alembic import op
import sqlalchemy as sa


revision = "user_profile_security_053"
down_revision = "custom_block_trust_schema_repair_052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("reserved_user_public_ids", sa.Column("public_id", sa.BigInteger(), primary_key=True))
    op.execute("INSERT INTO reserved_user_public_ids (public_id) SELECT public_id FROM users")
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email_verification_required", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("date_of_birth", sa.Date(), nullable=True))
        batch.add_column(sa.Column("phone", sa.String(32), nullable=True))
        batch.add_column(sa.Column("phone_verified_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("pending_email", sa.String(320), nullable=True))
        batch.add_column(sa.Column("session_required", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "account_action_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("target_email", sa.String(320), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_account_action_tokens_user_id", "account_action_tokens", ["user_id"])
    op.create_index("ix_account_action_tokens_token_hash", "account_action_tokens", ["token_hash"], unique=True)
    op.create_table(
        "account_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_account_sessions_user_id", "account_sessions", ["user_id"])
    op.create_table(
        "display_name_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_name", sa.String(100), nullable=True),
        sa.Column("new_name", sa.String(100), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_display_name_history_user_id", "display_name_history", ["user_id"])
    op.create_table(
        "account_deletion_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_account_deletion_requests_user_id", "account_deletion_requests", ["user_id"])
    op.create_table(
        "security_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_security_audit_events_user_id", "security_audit_events", ["user_id"])
    op.create_table(
        "user_totp",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("secret_ciphertext", sa.String(512), nullable=False),
        sa.Column("enabled_at", sa.DateTime(), nullable=True),
        sa.Column("last_counter", sa.Integer(), nullable=True),
    )
    op.create_table(
        "totp_backup_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_totp_backup_codes_user_id", "totp_backup_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_totp_backup_codes_user_id", table_name="totp_backup_codes")
    op.drop_table("totp_backup_codes")
    op.drop_table("user_totp")
    op.drop_index("ix_security_audit_events_user_id", table_name="security_audit_events")
    op.drop_table("security_audit_events")
    op.drop_index("ix_account_deletion_requests_user_id", table_name="account_deletion_requests")
    op.drop_table("account_deletion_requests")
    op.drop_index("ix_display_name_history_user_id", table_name="display_name_history")
    op.drop_table("display_name_history")
    op.drop_index("ix_account_sessions_user_id", table_name="account_sessions")
    op.drop_table("account_sessions")
    op.drop_index("ix_account_action_tokens_token_hash", table_name="account_action_tokens")
    op.drop_index("ix_account_action_tokens_user_id", table_name="account_action_tokens")
    op.drop_table("account_action_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("session_required")
        batch.drop_column("pending_email")
        batch.drop_column("phone_verified_at")
        batch.drop_column("phone")
        batch.drop_column("date_of_birth")
        batch.drop_column("email_verification_required")
    op.drop_table("reserved_user_public_ids")
