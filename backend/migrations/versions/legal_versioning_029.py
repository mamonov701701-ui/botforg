"""
Stage 6.14.9B-1A: legal document revisions, consent extensions, launch checklist,
CheckoutIntent legal snapshot fields.

SQLite + PostgreSQL compatible.
"""
from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "legal_versioning_029"
down_revision = "addon_refund_reservation_028"
branch_labels = None
depends_on = None


CHECKLIST_SEED = (
    ("seller_details", "Реквизиты продавца"),
    ("payment_provider", "Платёжный провайдер"),
    ("fiscal_cash_register", "Касса"),
    ("hosting_datacenter", "Хостинг и ЦОД"),
    ("subprocessors", "Субобработчики"),
    ("retention_periods", "Сроки хранения"),
    ("lawyer_documents_approved", "Документы проверены юристом"),
    ("required_revisions_published", "Обязательные редакции опубликованы"),
    ("owner_launch_confirmation", "Ручное подтверждение владельца запуска"),
)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "legal_document_revisions" not in tables:
        op.create_table(
            "legal_document_revisions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("doc_type", sa.String(length=64), nullable=False),
            sa.Column("slug", sa.String(length=64), nullable=False),
            sa.Column("version", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("body_markdown", sa.Text(), nullable=False),
            sa.Column("content_sha256", sa.String(length=64), nullable=False),
            sa.Column("internal_notes", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("lawyer_approved_by_user_id", sa.Integer(), nullable=True),
            sa.Column("published_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("lawyer_approved_at", sa.DateTime(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["updated_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["lawyer_approved_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["published_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.UniqueConstraint(
                "doc_type",
                "version",
                name="uq_legal_document_revisions_type_version",
            ),
        )
        op.create_index(
            "ix_legal_document_revisions_doc_type",
            "legal_document_revisions",
            ["doc_type"],
        )
        op.create_index(
            "ix_legal_document_revisions_status",
            "legal_document_revisions",
            ["status"],
        )
        op.create_index(
            "ix_legal_document_revisions_slug",
            "legal_document_revisions",
            ["slug"],
        )

    if "legal_launch_checklist_items" not in tables:
        op.create_table(
            "legal_launch_checklist_items",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("item_key", sa.String(length=64), nullable=False),
            sa.Column("label_ru", sa.String(length=255), nullable=False),
            sa.Column(
                "is_completed",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("completed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["completed_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.UniqueConstraint(
                "item_key", name="uq_legal_launch_checklist_item_key"
            ),
        )

    if "consents" in tables:
        cols = {c["name"] for c in insp.get_columns("consents")}
        if "revision_id" not in cols:
            op.add_column(
                "consents",
                sa.Column("revision_id", sa.Integer(), nullable=True),
            )
            # FK via ALTER not portable on SQLite; ORM enforces in app layer.
        if "source" not in cols:
            op.add_column(
                "consents", sa.Column("source", sa.String(length=32), nullable=True)
            )
        if "content_sha256" not in cols:
            op.add_column(
                "consents",
                sa.Column("content_sha256", sa.String(length=64), nullable=True),
            )
        if "confirmation_result" not in cols:
            op.add_column(
                "consents",
                sa.Column(
                    "confirmation_result", sa.String(length=32), nullable=True
                ),
            )
        # Refresh insp after adds for index check
        insp = sa.inspect(bind)
        indexes = {i["name"] for i in insp.get_indexes("consents")}
        if "ix_consents_revision_id" not in indexes:
            op.create_index(
                "ix_consents_revision_id", "consents", ["revision_id"]
            )

    if "checkout_intents" in tables:
        cols = {c["name"] for c in insp.get_columns("checkout_intents")}
        add_cols = [
            ("product_units", sa.Column("product_units", sa.Integer(), nullable=True)),
            (
                "offer_revision_id",
                sa.Column("offer_revision_id", sa.Integer(), nullable=True),
            ),
            (
                "refund_policy_revision_id",
                sa.Column("refund_policy_revision_id", sa.Integer(), nullable=True),
            ),
            (
                "tariff_terms_revision_id",
                sa.Column("tariff_terms_revision_id", sa.Integer(), nullable=True),
            ),
            (
                "purchase_consent_event_ids",
                sa.Column("purchase_consent_event_ids", sa.JSON(), nullable=True),
            ),
            (
                "refund_formula_version",
                sa.Column(
                    "refund_formula_version", sa.String(length=64), nullable=True
                ),
            ),
            (
                "price_grid_snapshot",
                sa.Column("price_grid_snapshot", sa.JSON(), nullable=True),
            ),
            (
                "legal_snapshot_at",
                sa.Column("legal_snapshot_at", sa.DateTime(), nullable=True),
            ),
        ]
        for name, col in add_cols:
            if name not in cols:
                op.add_column("checkout_intents", col)
        # FK constraints: created with table on fresh installs via ORM metadata;
        # ALTER ADD CONSTRAINT is not portable on SQLite — skip here.

    # Seed checklist (all incomplete — not lawyer-approved / not ready).
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for key, label in CHECKLIST_SEED:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM legal_launch_checklist_items "
                "WHERE item_key = :key LIMIT 1"
            ),
            {"key": key},
        ).fetchone()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO legal_launch_checklist_items "
                "(item_key, label_ru, is_completed, completed_at, "
                "completed_by_user_id, note, updated_at) "
                "VALUES (:key, :label, 0, NULL, NULL, NULL, :updated_at)"
            ),
            {"key": key, "label": label, "updated_at": now},
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "checkout_intents" in tables:
        cols = {c["name"] for c in insp.get_columns("checkout_intents")}
        for fk_name in (
            "fk_checkout_intents_offer_revision_id",
            "fk_checkout_intents_refund_policy_revision_id",
            "fk_checkout_intents_tariff_terms_revision_id",
        ):
            try:
                op.drop_constraint(fk_name, "checkout_intents", type_="foreignkey")
            except Exception:
                pass
        for col in (
            "legal_snapshot_at",
            "price_grid_snapshot",
            "refund_formula_version",
            "purchase_consent_event_ids",
            "tariff_terms_revision_id",
            "refund_policy_revision_id",
            "offer_revision_id",
            "product_units",
        ):
            if col in cols:
                op.drop_column("checkout_intents", col)

    if "consents" in tables:
        cols = {c["name"] for c in insp.get_columns("consents")}
        try:
            op.drop_index("ix_consents_revision_id", table_name="consents")
        except Exception:
            pass
        try:
            op.drop_constraint("fk_consents_revision_id", "consents", type_="foreignkey")
        except Exception:
            pass
        for col in ("confirmation_result", "content_sha256", "source", "revision_id"):
            if col in cols:
                op.drop_column("consents", col)

    if "legal_launch_checklist_items" in tables:
        op.drop_table("legal_launch_checklist_items")
    if "legal_document_revisions" in tables:
        op.drop_table("legal_document_revisions")
