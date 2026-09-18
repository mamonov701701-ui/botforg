"""AI Credits ledger, grant buckets and debit allocations (stage 7.4)."""
from alembic import op
import sqlalchemy as sa

revision = "ai_credit_ledger_040"
down_revision = "addon_pricing_open_ended_038"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("ai_credit_ledger_entries", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("delta", sa.Integer(), nullable=False), sa.Column("operation_type", sa.String(32), nullable=False), sa.Column("source_type", sa.String(64), nullable=False), sa.Column("source_ref_type", sa.String(64), nullable=False), sa.Column("source_ref_id", sa.String(128), nullable=False), sa.Column("reason_code", sa.String(64), nullable=False), sa.Column("capability", sa.String(96)), sa.Column("idempotency_key", sa.String(191), nullable=False), sa.Column("actor_kind", sa.String(32), nullable=False), sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("metadata", sa.JSON()), sa.Column("created_at", sa.DateTime(), nullable=False), sa.CheckConstraint("delta <> 0", name="ck_ai_credit_ledger_delta_nonzero"), sa.UniqueConstraint("idempotency_key", name="uq_ai_credit_ledger_idempotency"))
    op.create_index("ix_ai_credit_ledger_user_created", "ai_credit_ledger_entries", ["user_id", "created_at", "id"]); op.create_index("ix_ai_credit_ledger_source_ref", "ai_credit_ledger_entries", ["source_ref_type", "source_ref_id"])
    op.create_table("ai_credit_buckets", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("credit_class", sa.String(16), nullable=False), sa.Column("original_amount", sa.Integer(), nullable=False), sa.Column("remaining_amount", sa.Integer(), nullable=False), sa.Column("source_type", sa.String(64), nullable=False), sa.Column("source_ref_type", sa.String(64), nullable=False), sa.Column("source_ref_id", sa.String(128), nullable=False), sa.Column("grant_ledger_entry_id", sa.Integer(), sa.ForeignKey("ai_credit_ledger_entries.id", ondelete="RESTRICT"), nullable=False), sa.Column("granted_at", sa.DateTime(), nullable=False), sa.Column("expires_at", sa.DateTime()), sa.Column("status", sa.String(16), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.CheckConstraint("original_amount > 0", name="ck_ai_credit_bucket_original_positive"), sa.CheckConstraint("remaining_amount >= 0", name="ck_ai_credit_bucket_remaining_nonnegative"), sa.CheckConstraint("remaining_amount <= original_amount", name="ck_ai_credit_bucket_remaining_bounded"), sa.UniqueConstraint("grant_ledger_entry_id", name="uq_ai_credit_bucket_grant_entry"))
    op.create_index("ix_ai_credit_buckets_spend", "ai_credit_buckets", ["user_id", "credit_class", "status", "expires_at", "granted_at", "id"]); op.create_index("ix_ai_credit_buckets_source_ref", "ai_credit_buckets", ["source_ref_type", "source_ref_id"])
    op.create_table("ai_credit_debit_allocations", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("debit_ledger_entry_id", sa.Integer(), sa.ForeignKey("ai_credit_ledger_entries.id", ondelete="RESTRICT"), nullable=False), sa.Column("bucket_id", sa.Integer(), sa.ForeignKey("ai_credit_buckets.id", ondelete="RESTRICT"), nullable=False), sa.Column("amount", sa.Integer(), nullable=False), sa.CheckConstraint("amount > 0", name="ck_ai_credit_debit_allocation_positive"), sa.UniqueConstraint("debit_ledger_entry_id", "bucket_id", name="uq_ai_credit_debit_allocation_bucket"))
    op.create_index("ix_ai_credit_debit_allocations_bucket", "ai_credit_debit_allocations", ["bucket_id"])

def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "ai_credit_ledger_entries" not in inspector.get_table_names():
        return
    # Empty schema can be reverted in an isolated/rehearsal database. Once
    # resource history exists, fail closed rather than silently deleting it.
    count = bind.execute(sa.text("SELECT COUNT(*) FROM ai_credit_ledger_entries")).scalar() or 0
    if int(count) > 0:
        raise RuntimeError("AI Credits ledger downgrade is blocked after ledger history exists")
    op.drop_table("ai_credit_debit_allocations")
    op.drop_table("ai_credit_buckets")
    op.drop_table("ai_credit_ledger_entries")
