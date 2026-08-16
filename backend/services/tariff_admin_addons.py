"""Admin read/update/create/lifecycle of AddonPackage catalog (Этап 7.2)."""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, inspect as sa_inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, CheckoutProductType
from backend.models.plan import Plan
from backend.models.refund import RefundRequest
from backend.models.tariff import AddonPackage, GiftGrant, UserAddon
from backend.services.addon_custom_pack import is_reserved_addon_code
from backend.services.addon_package_types import (
    STORED_ADDON_TYPES,
    is_stored_addon_type,
    normalize_addon_type,
)
from backend.services.addon_validity import DEFAULT_ADDON_VALIDITY_DAYS
from backend.services.tariff_admin_audit import write_admin_audit_log

ACTION_ADDON_CREATED = "addon_package_created"
ACTION_ADDON_UPDATED = "addon_package_updated"
ACTION_ADDON_PUBLISHED = "addon_package_published"
ACTION_ADDON_HIDDEN = "addon_package_hidden"
ACTION_ADDON_ARCHIVED = "addon_package_archived"
ACTION_ADDON_REACTIVATED = "addon_package_reactivated"
ACTION_ADDON_DELETED = "addon_package_deleted"
ENTITY_ADDON_PACKAGE = "addon_package"

_ADDON_CODE_RE = re.compile(r"^[a-z0-9_]+$")
_ADDON_CODE_MAX = 64
_ALLOWED_DURATION = frozenset(
    {
        "current_period",
        "current_billing_period",
        "fixed_days",
        "unspecified",
    }
)
_VALIDITY_MIN = 1
_VALIDITY_MAX = 3650

KNOWN_ADDON_FK_TABLES = frozenset({"user_addons", "gift_grants"})


def _money_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _type_value(pkg: AddonPackage) -> str:
    raw = pkg.type
    return raw.value if hasattr(raw, "value") else str(raw)


def addon_snapshot(pkg: AddonPackage) -> dict[str, Any]:
    """JSON-safe before/after for AdminAuditLog."""
    avail = pkg.available_from_plan
    return {
        "id": int(pkg.id),
        "code": pkg.code,
        "name_ru": pkg.name_ru,
        "description_ru": pkg.description_ru,
        "type": _type_value(pkg),
        "amount": int(pkg.amount or 0),
        "price": _money_str(pkg.price),
        "currency": (pkg.currency or "RUB"),
        "duration_type": pkg.duration_type,
        "validity_days": int(pkg.validity_days or DEFAULT_ADDON_VALIDITY_DAYS),
        "available_from_plan": avail,
        "max_per_period": pkg.max_per_period,
        "is_active": bool(pkg.is_active) if pkg.is_active is not None else True,
        "is_public": bool(pkg.is_public) if pkg.is_public is not None else True,
        "sort_order": int(pkg.sort_order or 0),
    }


def _assert_not_system_addon(pkg: AddonPackage) -> None:
    if is_reserved_addon_code(pkg.code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "system_addon_locked",
                "message": "Системный пакет настраиваемой покупки нельзя изменять здесь",
            },
        )


def normalize_addon_code(raw: str) -> str:
    code = (raw or "").strip().lower()
    if not code or not _ADDON_CODE_RE.match(code) or len(code) > _ADDON_CODE_MAX:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_addon_code",
                "message": "Код пакета: только a-z, 0-9 и _ (до 64 символов)",
            },
        )
    return code


def parse_addon_type(raw: Any) -> str:
    normalized = normalize_addon_type(str(raw) if raw is not None else "")
    if not normalized or not is_stored_addon_type(normalized):
        allowed = ", ".join(STORED_ADDON_TYPES)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_addon_type",
                "message": (
                    "Тип ресурса: messages, bots (active_bot), "
                    f"team_member или ai_credits. Допустимые значения: {allowed}"
                ),
            },
        )
    return normalized


def _parse_available_from_plan(raw: Any) -> list[str] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_available_from_plan",
                "message": "available_from_plan: список кодов тарифов или пусто",
            },
        )
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        code = str(item or "").strip().lower()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out or None


def _assert_plan_codes_exist(db: Session, codes: list[str] | None) -> None:
    if not codes:
        return
    existing = {
        str(c)
        for (c,) in db.query(Plan.code).filter(Plan.code.in_(codes)).all()
    }
    missing = [c for c in codes if c not in existing]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unknown_plan_code",
                "message": f"Неизвестный код тарифа: {', '.join(missing)}",
            },
        )


def _parse_duration_type(raw: Any, *, default: str = "current_period") -> str:
    value = str(raw or default).strip() or default
    if value not in _ALLOWED_DURATION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_duration_type",
                "message": "Срок: current_period или current_billing_period",
            },
        )
    return value


def _parse_validity_days(raw: Any, *, default: int = DEFAULT_ADDON_VALIDITY_DAYS) -> int:
    if raw is None or raw == "":
        return default
    try:
        days = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_validity_days",
                "message": "Срок действия: целое число дней",
            },
        ) from exc
    if days < _VALIDITY_MIN or days > _VALIDITY_MAX:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_validity_days",
                "message": f"Срок действия: от {_VALIDITY_MIN} до {_VALIDITY_MAX} дней",
            },
        )
    return days


def _parse_amount(raw: Any) -> int:
    try:
        amount = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_amount", "message": "Количество должно быть целым числом"},
        ) from exc
    if amount < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_amount", "message": "Количество должно быть ≥ 1"},
        )
    return amount


def _parse_price(raw: Any) -> Decimal:
    if raw is None or raw == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_price", "message": "Цена обязательна"},
        )
    try:
        price = Decimal(str(raw))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_price", "message": "Некорректная цена"},
        ) from exc
    if price < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_price", "message": "Цена должна быть ≥ 0"},
        )
    return price


def _count_unknown_addon_fks(db: Session, package_id: int) -> int:
    """Fail-closed: any unexpected FK pointing at addon_packages.id."""
    bind = db.get_bind()
    inspector = sa_inspect(bind)
    total = 0
    try:
        tables = inspector.get_table_names()
    except Exception:
        return 0
    for table in tables:
        try:
            fks = inspector.get_foreign_keys(table)
        except Exception:
            continue
        for fk in fks:
            if (fk.get("referred_table") or "") != "addon_packages":
                continue
            if table in KNOWN_ADDON_FK_TABLES:
                continue
            cols = fk.get("constrained_columns") or []
            if not cols:
                continue
            col = cols[0]
            try:
                n = db.execute(
                    text(f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" = :pid'),
                    {"pid": package_id},
                ).scalar()
            except Exception:
                # Unknown dialect/table: treat as blocking reference.
                return max(total, 1)
            total += int(n or 0)
    return total


def count_addon_references(db: Session, pkg: AddonPackage) -> dict[str, int]:
    """Authoritative reference counts for delete gating (recomputed each call)."""
    pid = int(pkg.id)
    code = str(pkg.code)
    user_addons = (
        db.query(func.count(UserAddon.id))
        .filter(UserAddon.addon_package_id == pid)
        .scalar()
        or 0
    )
    gifts = (
        db.query(func.count(GiftGrant.id))
        .filter(GiftGrant.addon_package_id == pid)
        .scalar()
        or 0
    )
    checkouts = (
        db.query(func.count(CheckoutIntent.id))
        .filter(
            CheckoutIntent.product_type == CheckoutProductType.ADDON.value,
            CheckoutIntent.product_code == code,
        )
        .scalar()
        or 0
    )
    refunds = (
        db.query(func.count(RefundRequest.id))
        .join(CheckoutIntent, RefundRequest.checkout_intent_id == CheckoutIntent.id)
        .filter(
            CheckoutIntent.product_type == CheckoutProductType.ADDON.value,
            CheckoutIntent.product_code == code,
        )
        .scalar()
        or 0
    )
    other_fks = _count_unknown_addon_fks(db, pid)
    return {
        "user_addons": int(user_addons),
        "gifts": int(gifts),
        "checkouts": int(checkouts),
        "refunds": int(refunds),
        "other_references": int(other_fks),
    }


def _batch_reference_stats(
    db: Session, packages: list[AddonPackage]
) -> dict[int, dict[str, Any]]:
    if not packages:
        return {}
    pkg_ids = [int(p.id) for p in packages]
    codes = [str(p.code) for p in packages]
    code_by_id = {int(p.id): str(p.code) for p in packages}

    addon_counts: dict[int, int] = {
        int(pid): int(cnt)
        for pid, cnt in (
            db.query(UserAddon.addon_package_id, func.count())
            .filter(UserAddon.addon_package_id.in_(pkg_ids))
            .group_by(UserAddon.addon_package_id)
            .all()
        )
    }
    gift_counts: dict[int, int] = {
        int(pid): int(cnt)
        for pid, cnt in (
            db.query(GiftGrant.addon_package_id, func.count())
            .filter(GiftGrant.addon_package_id.in_(pkg_ids))
            .group_by(GiftGrant.addon_package_id)
            .all()
        )
        if pid is not None
    }
    checkout_by_code: dict[str, int] = {
        str(code): int(cnt)
        for code, cnt in (
            db.query(CheckoutIntent.product_code, func.count())
            .filter(
                CheckoutIntent.product_type == CheckoutProductType.ADDON.value,
                CheckoutIntent.product_code.in_(codes),
            )
            .group_by(CheckoutIntent.product_code)
            .all()
        )
    }
    refund_by_code: dict[str, int] = {
        str(code): int(cnt)
        for code, cnt in (
            db.query(CheckoutIntent.product_code, func.count())
            .join(RefundRequest, RefundRequest.checkout_intent_id == CheckoutIntent.id)
            .filter(
                CheckoutIntent.product_type == CheckoutProductType.ADDON.value,
                CheckoutIntent.product_code.in_(codes),
            )
            .group_by(CheckoutIntent.product_code)
            .all()
        )
    }

    out: dict[int, dict[str, Any]] = {}
    for pid in pkg_ids:
        code = code_by_id[pid]
        user_n = int(addon_counts.get(pid, 0))
        gift_n = int(gift_counts.get(pid, 0))
        chk_n = int(checkout_by_code.get(code, 0))
        ref_n = int(refund_by_code.get(code, 0))
        other_n = _count_unknown_addon_fks(db, pid)
        has_refs = user_n > 0 or gift_n > 0 or chk_n > 0 or ref_n > 0 or other_n > 0
        out[pid] = {
            "user_addon_count": user_n,
            "gift_count": gift_n,
            "checkout_count": chk_n,
            "refund_count": ref_n,
            "other_reference_count": other_n,
            "has_references": has_refs,
            "can_delete": not has_refs,
        }
    return out


def _addon_row_dict(pkg: AddonPackage, refs: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(pkg.id),
        "code": pkg.code,
        "name_ru": pkg.name_ru,
        "description_ru": pkg.description_ru,
        "type": _type_value(pkg),
        "amount": int(pkg.amount or 0),
        "price": pkg.price,
        "currency": (pkg.currency or "RUB"),
        "duration_type": pkg.duration_type or "current_period",
        "validity_days": int(pkg.validity_days or DEFAULT_ADDON_VALIDITY_DAYS),
        "available_from_plan": pkg.available_from_plan,
        "max_per_period": pkg.max_per_period,
        "is_active": bool(pkg.is_active) if pkg.is_active is not None else True,
        "is_public": bool(pkg.is_public) if pkg.is_public is not None else True,
        "sort_order": int(pkg.sort_order or 0),
        "created_at": pkg.created_at,
        "updated_at": pkg.updated_at,
        "user_addon_count": int(refs.get("user_addon_count", 0)),
        "checkout_count": int(refs.get("checkout_count", 0)),
        "gift_count": int(refs.get("gift_count", 0)),
        "refund_count": int(refs.get("refund_count", 0)),
        "has_references": bool(refs.get("has_references", False)),
        "can_delete": bool(refs.get("can_delete", True)),
    }


def list_admin_addons(db: Session) -> list[dict[str, Any]]:
    packages = (
        db.query(AddonPackage)
        .order_by(
            func.coalesce(AddonPackage.sort_order, 0).asc(),
            AddonPackage.code.asc(),
        )
        .all()
    )
    packages = [p for p in packages if not is_reserved_addon_code(p.code)]
    stats = _batch_reference_stats(db, packages)
    return [
        _addon_row_dict(pkg, stats.get(int(pkg.id), {}))
        for pkg in packages
    ]


def get_admin_addon_row(db: Session, pkg: AddonPackage) -> dict[str, Any]:
    stats = _batch_reference_stats(db, [pkg])
    return _addon_row_dict(pkg, stats.get(int(pkg.id), {}))


def get_admin_addon_or_404(db: Session, addon_id: int) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.id == addon_id).first()
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пакет не найден",
        )
    # Reserved custom_messages is managed outside this CRUD surface.
    _assert_not_system_addon(pkg)
    return pkg


def _values_equal(a: Any, b: Any) -> bool:
    if isinstance(a, Decimal) or isinstance(b, Decimal):
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return Decimal(str(a)) == Decimal(str(b))
    return a == b


def _addon_in_use_http(refs: dict[str, int]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "addon_in_use",
            "message": (
                "Пакет используется и не может быть удалён. "
                "Скройте его из каталога или архивируйте."
            ),
            "references": refs,
        },
    )


def create_admin_addon(
    db: Session,
    *,
    payload: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    code = normalize_addon_code(str(payload.get("code") or ""))
    if is_reserved_addon_code(code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "reserved_addon_code",
                "message": "Этот код зарезервирован для настраиваемого пакета",
            },
        )
    existing = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "addon_code_exists",
                "message": f"Пакет с кодом {code!r} уже существует",
            },
        )

    name_ru = str(payload.get("name_ru") or "").strip()
    if not name_ru:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_name_ru", "message": "Название обязательно"},
        )

    pkg_type = parse_addon_type(payload.get("type"))
    amount = _parse_amount(payload.get("amount"))
    price = _parse_price(payload.get("price"))
    currency = str(payload.get("currency") or "RUB").strip().upper()
    if not currency:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_currency", "message": "Валюта не может быть пустой"},
        )
    description_ru = payload.get("description_ru")
    if isinstance(description_ru, str):
        description_ru = description_ru.strip() or None
    duration_type = _parse_duration_type(payload.get("duration_type"))
    validity_days = _parse_validity_days(payload.get("validity_days"))
    available = _parse_available_from_plan(payload.get("available_from_plan"))
    _assert_plan_codes_exist(db, available)
    max_per_period = payload.get("max_per_period")
    if max_per_period is not None:
        try:
            max_per_period = int(max_per_period)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_max_per_period",
                    "message": "Лимит покупок за период: целое число или пусто",
                },
            ) from exc
        if max_per_period < 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_max_per_period",
                    "message": "Лимит покупок за период должен быть ≥ 1",
                },
            )

    pkg = AddonPackage(
        code=code,
        name_ru=name_ru,
        description_ru=description_ru,
        type=pkg_type,
        amount=amount,
        price=price,
        currency=currency,
        duration_type=duration_type,
        validity_days=validity_days,
        available_from_plan=available,
        max_per_period=max_per_period,
        is_active=True,
        is_public=bool(payload.get("is_public", True)),
        sort_order=int(payload.get("sort_order") or 0),
    )
    db.add(pkg)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "addon_code_exists",
                "message": f"Пакет с кодом {code!r} уже существует",
            },
        ) from exc

    after = addon_snapshot(pkg)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_ADDON_CREATED,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=int(pkg.id),
        old_value=None,
        new_value=after,
        comment=f"addon={pkg.code} created",
        commit=False,
    )
    db.commit()
    db.refresh(pkg)
    return get_admin_addon_row(db, pkg)


def update_admin_addon(
    db: Session,
    *,
    addon_id: int,
    patch: dict[str, Any],
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    pkg = get_admin_addon_or_404(db, addon_id)
    _assert_not_system_addon(pkg)

    if "code" in patch or "is_active" in patch or "is_public" in patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "immutable_field",
                "message": "Поля code, is_active и is_public нельзя менять через этот endpoint",
            },
        )

    before = addon_snapshot(pkg)
    changed: list[str] = []

    if "type" in patch:
        new_type = parse_addon_type(patch["type"])
        current = _type_value(pkg)
        if new_type != current:
            refs = count_addon_references(db, pkg)
            if any(v > 0 for v in refs.values()):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "addon_type_frozen",
                        "message": (
                            "Тип ресурса нельзя менять: пакет уже использовался. "
                            "Изменение задним числом затронуло бы купленные entitlements."
                        ),
                        "references": refs,
                    },
                )
            pkg.type = new_type
            changed.append("type")

    if "name_ru" in patch:
        name_ru = str(patch["name_ru"] or "").strip()
        if not name_ru:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_name_ru", "message": "Название не может быть пустым"},
            )
        if name_ru != pkg.name_ru:
            pkg.name_ru = name_ru
            changed.append("name_ru")
    if "description_ru" in patch:
        desc = patch["description_ru"]
        if isinstance(desc, str):
            desc = desc.strip() or None
        if desc != pkg.description_ru:
            pkg.description_ru = desc
            changed.append("description_ru")
    if "currency" in patch:
        currency = str(patch["currency"] or "").strip().upper()
        if not currency:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_currency", "message": "Валюта не может быть пустой"},
            )
        if currency != (pkg.currency or "RUB"):
            pkg.currency = currency
            changed.append("currency")
    if "duration_type" in patch:
        duration = _parse_duration_type(patch["duration_type"], default=pkg.duration_type)
        if duration != pkg.duration_type:
            pkg.duration_type = duration
            changed.append("duration_type")
    if "amount" in patch:
        amount = _parse_amount(patch["amount"])
        if amount != int(pkg.amount or 0):
            pkg.amount = amount
            changed.append("amount")
    if "price" in patch:
        price = _parse_price(patch["price"])
        if not _values_equal(pkg.price, price):
            pkg.price = price
            changed.append("price")
    if "validity_days" in patch:
        days = _parse_validity_days(patch["validity_days"])
        current_days = int(pkg.validity_days or DEFAULT_ADDON_VALIDITY_DAYS)
        if days != current_days:
            pkg.validity_days = days
            changed.append("validity_days")
    if "available_from_plan" in patch:
        available = _parse_available_from_plan(patch["available_from_plan"])
        _assert_plan_codes_exist(db, available)
        if available != pkg.available_from_plan:
            pkg.available_from_plan = available
            changed.append("available_from_plan")
    if "max_per_period" in patch:
        max_per = patch["max_per_period"]
        if max_per is not None:
            try:
                max_per = int(max_per)
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "invalid_max_per_period",
                        "message": "Лимит покупок за период: целое число или пусто",
                    },
                ) from exc
            if max_per < 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "invalid_max_per_period",
                        "message": "Лимит покупок за период должен быть ≥ 1",
                    },
                )
        if max_per != pkg.max_per_period:
            pkg.max_per_period = max_per
            changed.append("max_per_period")
    if "sort_order" in patch:
        sort_order = int(patch["sort_order"] or 0)
        if sort_order != int(pkg.sort_order or 0):
            pkg.sort_order = sort_order
            changed.append("sort_order")

    if not changed:
        return get_admin_addon_row(db, pkg), False

    db.flush()
    after = addon_snapshot(pkg)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_ADDON_UPDATED,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=int(pkg.id),
        old_value=before,
        new_value={**after, "changed_fields": changed},
        comment=f"addon={pkg.code} fields={','.join(changed)}",
        commit=False,
    )
    db.commit()
    db.refresh(pkg)
    return get_admin_addon_row(db, pkg), True


def set_admin_addon_visibility(
    db: Session,
    *,
    addon_id: int,
    is_public: bool,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    pkg = get_admin_addon_or_404(db, addon_id)
    _assert_not_system_addon(pkg)
    current = bool(pkg.is_public) if pkg.is_public is not None else True
    if current is bool(is_public):
        return get_admin_addon_row(db, pkg), False

    before = addon_snapshot(pkg)
    pkg.is_public = bool(is_public)
    db.flush()
    after = addon_snapshot(pkg)
    action = ACTION_ADDON_PUBLISHED if is_public else ACTION_ADDON_HIDDEN
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=action,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=int(pkg.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_public"]},
        comment=f"addon={pkg.code} is_public={is_public}",
        commit=False,
    )
    db.commit()
    db.refresh(pkg)
    return get_admin_addon_row(db, pkg), True


def archive_admin_addon(
    db: Session,
    *,
    addon_id: int,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    pkg = get_admin_addon_or_404(db, addon_id)
    _assert_not_system_addon(pkg)
    current = bool(pkg.is_active) if pkg.is_active is not None else True
    if not current:
        return get_admin_addon_row(db, pkg), False

    before = addon_snapshot(pkg)
    pkg.is_active = False
    db.flush()
    after = addon_snapshot(pkg)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_ADDON_ARCHIVED,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=int(pkg.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_active"]},
        comment=f"addon={pkg.code} archived",
        commit=False,
    )
    db.commit()
    db.refresh(pkg)
    return get_admin_addon_row(db, pkg), True


def reactivate_admin_addon(
    db: Session,
    *,
    addon_id: int,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    pkg = get_admin_addon_or_404(db, addon_id)
    _assert_not_system_addon(pkg)
    current = bool(pkg.is_active) if pkg.is_active is not None else True
    if current:
        return get_admin_addon_row(db, pkg), False

    before = addon_snapshot(pkg)
    pkg.is_active = True
    db.flush()
    after = addon_snapshot(pkg)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_ADDON_REACTIVATED,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=int(pkg.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_active"]},
        comment=f"addon={pkg.code} reactivated",
        commit=False,
    )
    db.commit()
    db.refresh(pkg)
    return get_admin_addon_row(db, pkg), True


def delete_admin_addon(
    db: Session,
    *,
    addon_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    pkg = get_admin_addon_or_404(db, addon_id)
    _assert_not_system_addon(pkg)
    refs = count_addon_references(db, pkg)
    if any(v > 0 for v in refs.values()):
        raise _addon_in_use_http(refs)

    snapshot = addon_snapshot(pkg)
    entity_id = int(pkg.id)
    code = pkg.code

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_ADDON_DELETED,
        entity_type=ENTITY_ADDON_PACKAGE,
        entity_id=entity_id,
        old_value=snapshot,
        new_value=None,
        comment=f"addon={code} deleted",
        commit=False,
    )

    try:
        db.delete(pkg)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        pkg2 = db.query(AddonPackage).filter(AddonPackage.id == addon_id).first()
        if pkg2 is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пакет не найден",
            ) from exc
        refs2 = count_addon_references(db, pkg2)
        raise _addon_in_use_http(refs2) from exc

    return snapshot
