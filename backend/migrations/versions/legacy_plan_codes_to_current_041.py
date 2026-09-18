"""Map retired plan codes before removing them from effective entitlement resolution."""

from alembic import op
import sqlalchemy as sa

revision = "legacy_plan_codes_to_current_041"
down_revision = "ai_credit_ledger_040"
branch_labels = None
depends_on = None

_LEGACY_TO_CURRENT = {"free": "start", "pro": "business_pro", "developer": "team"}
_CURRENT_CODES = {"start", "business", "business_pro", "team", "corporate"}


def upgrade():
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, plan_code FROM users")).mappings().all()
    unknown = sorted(
        {
            str(row["plan_code"] or "").strip().lower()
            for row in rows
            if str(row["plan_code"] or "").strip().lower()
            not in (_CURRENT_CODES | set(_LEGACY_TO_CURRENT))
        }
    )
    if unknown:
        raise RuntimeError(
            "Legacy plan migration is blocked by unknown users.plan_code values: "
            + ", ".join(unknown)
        )
    for old, new in _LEGACY_TO_CURRENT.items():
        bind.execute(
            sa.text("UPDATE users SET plan_code = :new WHERE lower(trim(plan_code)) = :old"),
            {"old": old, "new": new},
        )


def downgrade():
    raise RuntimeError("Legacy plan-code migration is irreversible and downgrade is blocked")
