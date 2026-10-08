"""Repair incomplete 051 Trust & Safety schema without replacing existing data.

Revision ID: custom_block_trust_schema_repair_052
Revises: custom_block_free_paid_trust_051
"""
from alembic import op
import sqlalchemy as sa


revision = "custom_block_trust_schema_repair_052"
down_revision = "custom_block_free_paid_trust_051"
branch_labels = None
depends_on = None


def _table_columns():
    return {
        "marketplace_disputes": [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("buyer_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("seller_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("listing_id", sa.Integer(), sa.ForeignKey("custom_block_marketplace_listings.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("custom_block_version_id", sa.Integer(), sa.ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("price_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("price_currency", sa.String(3), nullable=False),
            sa.Column("listing_snapshot", sa.JSON(), nullable=False),
            sa.Column("chat_room_id", sa.Integer(), sa.ForeignKey("chat_rooms.id", ondelete="SET NULL"), nullable=True),
            sa.Column("reason_code", sa.String(48), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("evidence_metadata", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("admin_decision", sa.Text(), nullable=True),
            sa.Column("enforcement_action_id", sa.Integer(), nullable=True),
            sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
        ],
        "trust_safety_enforcements": [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("subject_type", sa.String(32), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("action", sa.String(48), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("dispute_id", sa.Integer(), sa.ForeignKey("marketplace_disputes.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        ],
        "trust_safety_audit_events": [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("subject_type", sa.String(32), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=False),
            sa.Column("metadata", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        ],
        "trust_safety_reports": [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("reporter_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("subject_type", sa.String(32), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=False),
            sa.Column("reason_code", sa.String(48), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
            sa.Column("decision", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
        ],
    }


_INDEXES = {
    "marketplace_disputes": ("buyer_user_id", "seller_user_id", "listing_id", "status"),
    "trust_safety_enforcements": ("subject_type", "subject_id", "user_id"),
    "trust_safety_audit_events": ("actor_user_id",),
    "trust_safety_reports": ("reporter_user_id", "subject_type", "status"),
}


def _foreign_keys(columns):
    return {
        (column.name, *foreign_key.target_fullname.split(".", 1),
         foreign_key.ondelete)
        for column in columns for foreign_key in column.foreign_keys
    }


def _verify_existing_table(bind, table_name, expected_columns):
    inspector = sa.inspect(bind)
    actual_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
    expected_names = {column.name for column in expected_columns}
    if set(actual_columns) != expected_names:
        raise RuntimeError(f"051 schema drift in {table_name}: column set differs; manual review required")
    for column in expected_columns:
        actual = actual_columns[column.name]
        if bool(actual["nullable"]) != bool(column.nullable) and not column.primary_key:
            raise RuntimeError(f"051 schema drift in {table_name}.{column.name}: nullability differs")
        if str(actual["type"]).upper().replace(" ", "") != str(column.type.compile(dialect=bind.dialect)).upper().replace(" ", ""):
            raise RuntimeError(f"051 schema drift in {table_name}.{column.name}: type differs")
    actual_pk = set(inspector.get_pk_constraint(table_name)["constrained_columns"])
    if actual_pk != {column.name for column in expected_columns if column.primary_key}:
        raise RuntimeError(f"051 schema drift in {table_name}: primary key differs")
    actual_fks = {
        (fk["constrained_columns"][0], fk["referred_table"], fk["referred_columns"][0],
         (fk.get("options") or {}).get("ondelete"))
        for fk in inspector.get_foreign_keys(table_name)
    }
    if actual_fks != _foreign_keys(expected_columns):
        raise RuntimeError(f"051 schema drift in {table_name}: foreign keys differ")
    if inspector.get_unique_constraints(table_name):
        raise RuntimeError(f"051 schema drift in {table_name}: unexpected unique constraint")


def upgrade():
    bind = op.get_bind()
    listing_table = "custom_block_marketplace_listings"
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns(listing_table)}
    for name, column_type in (("price_amount", sa.Numeric(12, 2)), ("price_currency", sa.String(3))):
        if name not in columns:
            with op.batch_alter_table(listing_table) as batch:
                batch.add_column(sa.Column(name, column_type, nullable=True))
        elif columns[name]["nullable"] is not True or str(columns[name]["type"]).upper().replace(" ", "") != str(column_type.compile(dialect=bind.dialect)).upper().replace(" ", ""):
            raise RuntimeError(f"051 schema drift in {listing_table}.{name}: incompatible column")

    for table_name, expected_columns in _table_columns().items():
        if table_name not in sa.inspect(bind).get_table_names():
            op.create_table(table_name, *expected_columns)
        else:
            _verify_existing_table(bind, table_name, expected_columns)
        existing_indexes = {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}
        for column_name in _INDEXES[table_name]:
            index_name = f"ix_{table_name}_{column_name}"
            if index_name not in existing_indexes:
                op.create_index(index_name, table_name, [column_name])


def downgrade():
    # 051 owns these objects. Removing them here would destroy valid 051 data.
    pass
