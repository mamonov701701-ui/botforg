"""
add tariff system tables and seed data

Creates new tariff-domain tables:
- addon_packages
- user_subscriptions
- user_addons
- usage_counters
- gift_grants
- admin_audit_log

Extends existing plans table with tariff presentation fields:
- name_ru, description_ru, price_month, currency
- is_active, is_public, is_recommended, sort_order

Seeds new plans and addon packages:
- plans: start, business, business_pro, team, corporate
- addons: msg_1000, msg_3000, msg_5000, msg_10000, bot_1, member_1

PostgreSQL-ready: seed via SQLAlchemy insert/update with Python UTC datetimes and bool params.
DDL server defaults use CURRENT_TIMESTAMP (SQLite + PostgreSQL) and dialect-aware boolean literals.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from alembic import op
import sqlalchemy as sa


revision = "tariff_system_007"
down_revision = "market_access_020"
branch_labels = None
depends_on = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dialect_name() -> str:
    return op.get_bind().dialect.name


def _boolean_server_default_true():
    if _dialect_name() == "postgresql":
        return sa.text("true")
    return sa.text("1")


def _boolean_server_default_false():
    if _dialect_name() == "postgresql":
        return sa.text("false")
    return sa.text("0")


def _timestamp_server_default():
    return sa.text("CURRENT_TIMESTAMP")


def _integer_server_default_zero():
    return sa.text("0")


def _table_column_names(insp: sa.engine.Inspector, table_name: str) -> set[str]:
    return {c["name"] for c in insp.get_columns(table_name)}


def _create_enums(*enums: sa.Enum) -> None:
    bind = op.get_bind()
    for enum_type in enums:
        enum_type.create(bind, checkfirst=True)


def _drop_enums(*enums: sa.Enum) -> None:
    bind = op.get_bind()
    for enum_type in reversed(enums):
        enum_type.drop(bind, checkfirst=True)


_plans_table = sa.table(
    "plans",
    sa.column("id", sa.Integer),
    sa.column("code", sa.String),
    sa.column("name", sa.String),
    sa.column("name_ru", sa.String),
    sa.column("description_ru", sa.Text),
    sa.column("price_month", sa.Numeric(10, 2)),
    sa.column("currency", sa.String),
    sa.column("is_active", sa.Boolean),
    sa.column("is_public", sa.Boolean),
    sa.column("is_recommended", sa.Boolean),
    sa.column("sort_order", sa.Integer),
    sa.column("limits", sa.JSON),
    sa.column("created_at", sa.DateTime),
)

_addon_packages_table = sa.table(
    "addon_packages",
    sa.column("id", sa.Integer),
    sa.column("code", sa.String),
    sa.column("name_ru", sa.String),
    sa.column("description_ru", sa.Text),
    sa.column("type", sa.String),
    sa.column("amount", sa.Integer),
    sa.column("price", sa.Numeric(10, 2)),
    sa.column("currency", sa.String),
    sa.column("duration_type", sa.String),
    sa.column("available_from_plan", sa.JSON),
    sa.column("max_per_period", sa.Integer),
    sa.column("is_active", sa.Boolean),
    sa.column("is_public", sa.Boolean),
    sa.column("sort_order", sa.Integer),
    sa.column("created_at", sa.DateTime),
    sa.column("updated_at", sa.DateTime),
)


def _upsert_plan(
    conn,
    *,
    code: str,
    name: str,
    name_ru: str,
    description_ru: str | None,
    price_month: Decimal | int | None,
    currency: str,
    is_active: bool,
    is_public: bool,
    is_recommended: bool,
    sort_order: int,
    limits: dict,
    now: datetime | None = None,
) -> None:
    now = now or _utcnow()
    existing = conn.execute(
        sa.select(_plans_table.c.id).where(_plans_table.c.code == code)
    ).fetchone()
    price_value = None if price_month is None else Decimal(str(price_month))

    values = {
        "name": name,
        "name_ru": name_ru,
        "description_ru": description_ru,
        "price_month": price_value,
        "currency": currency,
        "is_active": is_active,
        "is_public": is_public,
        "is_recommended": is_recommended,
        "sort_order": sort_order,
        "limits": limits,
    }

    if not existing:
        conn.execute(
            sa.insert(_plans_table).values(
                code=code,
                created_at=now,
                **values,
            )
        )
        return

    conn.execute(
        sa.update(_plans_table).where(_plans_table.c.code == code).values(**values)
    )


def _upsert_addon_package(
    conn,
    *,
    code: str,
    values: dict,
    now: datetime | None = None,
) -> None:
    now = now or _utcnow()
    existing = conn.execute(
        sa.select(_addon_packages_table.c.id).where(_addon_packages_table.c.code == code)
    ).fetchone()

    row = {
        "name_ru": values["name_ru"],
        "description_ru": values.get("description_ru"),
        "type": values["type"],
        "amount": values["amount"],
        "price": Decimal(str(values["price"])),
        "currency": values["currency"],
        "duration_type": values["duration_type"],
        "available_from_plan": values["available_from_plan"],
        "max_per_period": values.get("max_per_period"),
        "is_active": values["is_active"],
        "is_public": values["is_public"],
        "sort_order": values["sort_order"],
    }

    if not existing:
        conn.execute(
            sa.insert(_addon_packages_table).values(
                code=code,
                created_at=now,
                updated_at=now,
                **row,
            )
        )
        return

    conn.execute(
        sa.update(_addon_packages_table)
        .where(_addon_packages_table.c.code == code)
        .values(updated_at=now, **row)
    )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    seed_now = _utcnow()

    # --- 1) Расширяем plans (добавляем колонки, если их нет) ---
    cols = _table_column_names(insp, "plans")

    if "name_ru" not in cols:
        op.add_column("plans", sa.Column("name_ru", sa.String(255), nullable=True))
    if "description_ru" not in cols:
        op.add_column("plans", sa.Column("description_ru", sa.Text(), nullable=True))
    if "price_month" not in cols:
        op.add_column("plans", sa.Column("price_month", sa.Numeric(10, 2), nullable=True))
    if "currency" not in cols:
        op.add_column("plans", sa.Column("currency", sa.String(10), nullable=True))
    if "is_active" not in cols:
        op.add_column(
            "plans",
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=True,
                server_default=_boolean_server_default_true(),
            ),
        )
    if "is_public" not in cols:
        op.add_column(
            "plans",
            sa.Column(
                "is_public",
                sa.Boolean(),
                nullable=True,
                server_default=_boolean_server_default_true(),
            ),
        )
    if "is_recommended" not in cols:
        op.add_column(
            "plans",
            sa.Column(
                "is_recommended",
                sa.Boolean(),
                nullable=True,
                server_default=_boolean_server_default_false(),
            ),
        )
    if "sort_order" not in cols:
        op.add_column(
            "plans",
            sa.Column(
                "sort_order",
                sa.Integer(),
                nullable=True,
                server_default=_integer_server_default_zero(),
            ),
        )

    # --- 2) Создаём новые таблицы ---
    addon_pkg_type_enum = sa.Enum(
        "messages",
        "active_bot",
        "team_member",
        name="addonpackagetype",
    )
    subscription_status_enum = sa.Enum(
        "active",
        "trialing",
        "past_due",
        "cancelled",
        "expired",
        name="subscriptionstatus",
    )
    user_addon_status_enum = sa.Enum(
        "active",
        "expired",
        "cancelled",
        name="useraddonstatus",
    )
    user_addon_source_enum = sa.Enum(
        "purchase",
        "gift",
        "admin",
        "promo",
        name="useraddonsource",
    )
    gift_type_enum = sa.Enum(
        "plan",
        "addon",
        "messages",
        "active_bot",
        "team_member",
        name="gifttype",
    )
    gift_grant_status_enum = sa.Enum(
        "active",
        "scheduled",
        "expired",
        "cancelled",
        name="giftgrantstatus",
    )

    # На PostgreSQL типы создаёт Alembic/SQLAlchemy при create_table (create_type по умолчанию).
    # Явный _create_enums убран — иначе DuplicateObject на PG.

    op.create_table(
        "addon_packages",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name_ru", sa.String(255), nullable=False),
        sa.Column("description_ru", sa.Text(), nullable=True),
        sa.Column("type", addon_pkg_type_enum, nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="RUB"),
        sa.Column(
            "duration_type", sa.String(64), nullable=False, server_default="current_billing_period"
        ),
        sa.Column("available_from_plan", sa.JSON(), nullable=True),
        sa.Column("max_per_period", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=_boolean_server_default_true()),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=_boolean_server_default_true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=_integer_server_default_zero()),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=_timestamp_server_default(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=_timestamp_server_default(),
        ),
        sa.UniqueConstraint("code", name="uq_addon_packages_code"),
    )
    op.create_index("ix_addon_packages_code", "addon_packages", ["code"], unique=True)
    op.create_index("ix_addon_packages_type", "addon_packages", ["type"], unique=False)
    op.create_index("ix_addon_packages_is_active", "addon_packages", ["is_active"], unique=False)

    op.create_table(
        "user_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", subscription_status_enum, nullable=False, server_default="active"),
        sa.Column("current_period_start", sa.DateTime(), nullable=False),
        sa.Column("current_period_end", sa.DateTime(), nullable=False),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=_boolean_server_default_true()),
        sa.Column("payment_provider", sa.String(64), nullable=True),
        sa.Column("provider_subscription_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_user_subscriptions_user_id", "user_subscriptions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_user_subscriptions_plan_id", "user_subscriptions", ["plan_id"], unique=False
    )
    op.create_index(
        "ix_user_subscriptions_status", "user_subscriptions", ["status"], unique=False
    )
    op.create_index(
        "ix_user_subscriptions_user_period",
        "user_subscriptions",
        ["user_id", "current_period_start", "current_period_end"],
        unique=False,
    )

    op.create_table(
        "user_addons",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=True),
        sa.Column(
            "addon_package_id",
            sa.Integer(),
            sa.ForeignKey("addon_packages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False, server_default=_integer_server_default_zero()),
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        sa.Column("status", user_addon_status_enum, nullable=False, server_default="active"),
        sa.Column("source", user_addon_source_enum, nullable=False),
        sa.Column(
            "created_by_admin_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
    )
    op.create_index("ix_user_addons_user_id", "user_addons", ["user_id"], unique=False)
    op.create_index("ix_user_addons_addon_package_id", "user_addons", ["addon_package_id"], unique=False)
    op.create_index("ix_user_addons_status", "user_addons", ["status"], unique=False)
    op.create_index("ix_user_addons_period", "user_addons", ["period_start", "period_end"], unique=False)

    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=True),
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        sa.Column("messages_used", sa.Integer(), nullable=False, server_default=_integer_server_default_zero()),
        sa.Column("active_bots_used", sa.Integer(), nullable=False, server_default=_integer_server_default_zero()),
        sa.Column("team_members_used", sa.Integer(), nullable=False, server_default=_integer_server_default_zero()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.UniqueConstraint(
            "user_id",
            "period_start",
            "period_end",
            name="uq_usage_counters_user_period",
        ),
    )
    op.create_index("ix_usage_counters_user_id", "usage_counters", ["user_id"], unique=False)

    op.create_table(
        "gift_grants",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("target_workspace_id", sa.Integer(), nullable=True),
        sa.Column("gift_type", gift_type_enum, nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "addon_package_id",
            sa.Integer(),
            sa.ForeignKey("addon_packages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("amount", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column(
            "granted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("admin_comment", sa.Text(), nullable=True),
        sa.Column("status", gift_grant_status_enum, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
    )
    op.create_index("ix_gift_grants_target_user_id", "gift_grants", ["target_user_id"], unique=False)
    op.create_index("ix_gift_grants_status", "gift_grants", ["status"], unique=False)
    op.create_index("ix_gift_grants_granted_by_user_id", "gift_grants", ["granted_by_user_id"], unique=False)

    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "admin_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("old_value", sa.JSON(), nullable=True),
        sa.Column("new_value", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=_timestamp_server_default()),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index("ix_admin_audit_log_admin_user_id", "admin_audit_log", ["admin_user_id"], unique=False)
    op.create_index("ix_admin_audit_log_entity", "admin_audit_log", ["entity_type", "entity_id"], unique=False)
    op.create_index("ix_admin_audit_log_created_at", "admin_audit_log", ["created_at"], unique=False)

    # --- 3) Seed тарифов ---
    upsert_plans = [
        {
            "code": "start",
            "name": "Старт",
            "name_ru": "Старт",
            "description_ru": None,
            "price_month": 0,
            "currency": "RUB",
            "is_active": True,
            "is_public": True,
            "is_recommended": False,
            "sort_order": 10,
            "limits": {
                "max_bots": 1,
                "can_publish": True,
                "can_use_analytics": True,
                "max_team_members": 0,
                "active_bots": 1,
                "monthly_messages": 500,
                "team_members": 0,
                "analytics_history_days": 7,
                "export_reports": False,
                "priority_support": False,
                "marketplace_access": True,
                "template_publish": True,
                "scenario_publish": True,
            },
        },
        {
            "code": "business",
            "name": "Бизнес",
            "name_ru": "Бизнес",
            "description_ru": None,
            "price_month": 990,
            "currency": "RUB",
            "is_active": True,
            "is_public": True,
            "is_recommended": False,
            "sort_order": 20,
            "limits": {
                "max_bots": 1,
                "can_publish": True,
                "can_use_analytics": True,
                "max_team_members": 0,
                "active_bots": 1,
                "monthly_messages": 3000,
                "team_members": 0,
                "analytics_history_days": 30,
                "export_reports": False,
                "priority_support": False,
                "marketplace_access": True,
                "template_publish": True,
                "scenario_publish": True,
            },
        },
        {
            "code": "business_pro",
            "name": "Бизнес PRO",
            "name_ru": "Бизнес PRO",
            "description_ru": None,
            "price_month": 1990,
            "currency": "RUB",
            "is_active": True,
            "is_public": True,
            "is_recommended": True,
            "sort_order": 30,
            "limits": {
                "max_bots": 3,
                "can_publish": True,
                "can_use_analytics": True,
                "max_team_members": 3,
                "active_bots": 3,
                "monthly_messages": 10000,
                "team_members": 3,
                "analytics_history_days": 90,
                "export_reports": True,
                "priority_support": False,
                "marketplace_access": True,
                "template_publish": True,
                "scenario_publish": True,
            },
        },
        {
            "code": "team",
            "name": "Команда",
            "name_ru": "Команда",
            "description_ru": None,
            "price_month": 3990,
            "currency": "RUB",
            "is_active": True,
            "is_public": True,
            "is_recommended": False,
            "sort_order": 40,
            "limits": {
                "max_bots": 20,
                "can_publish": True,
                "can_use_analytics": True,
                "max_team_members": 10,
                "active_bots": 5,
                "monthly_messages": 20000,
                "team_members": 5,
                "analytics_history_days": 180,
                "export_reports": True,
                "priority_support": True,
                "marketplace_access": True,
                "template_publish": True,
                "scenario_publish": True,
            },
        },
        {
            "code": "corporate",
            "name": "Корпоративный",
            "name_ru": "Корпоративный",
            "description_ru": None,
            "price_month": None,
            "currency": "RUB",
            "is_active": True,
            "is_public": True,
            "is_recommended": False,
            "sort_order": 50,
            "limits": {
                "max_bots": 1,
                "can_publish": True,
                "can_use_analytics": True,
                "max_team_members": 0,
                "active_bots": None,
                "monthly_messages": None,
                "team_members": None,
                "analytics_history_days": None,
                "export_reports": True,
                "priority_support": True,
                "marketplace_access": True,
                "template_publish": True,
                "scenario_publish": True,
                "custom_terms": True,
            },
        },
    ]

    for p in upsert_plans:
        _upsert_plan(conn, now=seed_now, **p)

    # --- 4) Seed пакетов addon_packages ---
    addon_packages = [
        {
            "code": "msg_1000",
            "name_ru": "+1 000 сообщений",
            "description_ru": None,
            "type": "messages",
            "amount": 1000,
            "price": 190,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "start",
            "max_per_period": 1,
            "is_active": True,
            "is_public": True,
            "sort_order": 10,
        },
        {
            "code": "msg_3000",
            "name_ru": "+3 000 сообщений",
            "description_ru": None,
            "type": "messages",
            "amount": 3000,
            "price": 490,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "business",
            "max_per_period": 3,
            "is_active": True,
            "is_public": True,
            "sort_order": 20,
        },
        {
            "code": "msg_5000",
            "name_ru": "+5 000 сообщений",
            "description_ru": None,
            "type": "messages",
            "amount": 5000,
            "price": 790,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "business",
            "max_per_period": 3,
            "is_active": True,
            "is_public": True,
            "sort_order": 30,
        },
        {
            "code": "msg_10000",
            "name_ru": "+10 000 сообщений",
            "description_ru": None,
            "type": "messages",
            "amount": 10000,
            "price": 1490,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "business_pro",
            "max_per_period": 2,
            "is_active": True,
            "is_public": True,
            "sort_order": 40,
        },
        {
            "code": "bot_1",
            "name_ru": "+1 активный бот",
            "description_ru": None,
            "type": "active_bot",
            "amount": 1,
            "price": 590,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "business",
            "max_per_period": 2,
            "is_active": True,
            "is_public": True,
            "sort_order": 50,
        },
        {
            "code": "member_1",
            "name_ru": "+1 участник команды",
            "description_ru": None,
            "type": "team_member",
            "amount": 1,
            "price": 490,
            "currency": "RUB",
            "duration_type": "current_period",
            "available_from_plan": "team",
            "max_per_period": 10,
            "is_active": True,
            "is_public": True,
            "sort_order": 60,
        },
    ]

    for a in addon_packages:
        _upsert_addon_package(
            conn,
            code=a["code"],
            values={k: v for k, v in a.items() if k != "code"},
            now=seed_now,
        )


def downgrade() -> None:
    conn = op.get_bind()

    op.execute(
        sa.text(
            "DELETE FROM plans WHERE code IN ('start', 'business', 'business_pro', 'corporate')"
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM addon_packages
            WHERE code IN (
                'msg_1000', 'msg_3000', 'msg_5000', 'msg_10000',
                'bot_1', 'member_1'
            )
            """
        )
    )

    op.drop_table("admin_audit_log")
    op.drop_table("gift_grants")
    op.drop_table("usage_counters")
    op.drop_table("user_addons")
    op.drop_table("user_subscriptions")
    op.drop_table("addon_packages")

    gift_grant_status_enum = sa.Enum(name="giftgrantstatus")
    gift_type_enum = sa.Enum(name="gifttype")
    user_addon_source_enum = sa.Enum(name="useraddonsource")
    user_addon_status_enum = sa.Enum(name="useraddonstatus")
    subscription_status_enum = sa.Enum(name="subscriptionstatus")
    addon_pkg_type_enum = sa.Enum(name="addonpackagetype")
    _drop_enums(
        gift_grant_status_enum,
        gift_type_enum,
        user_addon_source_enum,
        user_addon_status_enum,
        subscription_status_enum,
        addon_pkg_type_enum,
    )

    insp = sa.inspect(conn)
    cols = _table_column_names(insp, "plans")

    for col in [
        "name_ru",
        "description_ru",
        "price_month",
        "currency",
        "is_active",
        "is_public",
        "is_recommended",
        "sort_order",
    ]:
        if col in cols:
            op.drop_column("plans", col)
