"""Admin API for versioned AddonPricingGridVersion (Этап 7.2)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent
from backend.models.tariff import (
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
    AddonPricingTier,
)
from backend.services.addon_custom_pack import MAX_CUSTOM_QUANTITY
from backend.services.addon_pricing import (
    AddonPricingError,
    normalize_pricing_resource_type,
    parse_range_end,
    parse_range_start,
    parse_unit_price,
    validate_active_tier_set,
)
from backend.services.tariff_admin_audit import write_admin_audit_log

ENTITY_GRID_VERSION = "addon_pricing_grid_version"
ENTITY_PRICING_TIER = "addon_pricing_tier"

ACTION_GRID_DRAFT_CREATED = "addon_pricing_grid_draft_created"
ACTION_GRID_PUBLISHED = "addon_pricing_grid_published"
ACTION_GRID_DRAFT_DELETED = "addon_pricing_grid_draft_deleted"
ACTION_GRID_ARCHIVED = "addon_pricing_grid_archived"
ACTION_TIER_CREATED = "addon_pricing_tier_created"
ACTION_TIER_UPDATED = "addon_pricing_tier_updated"
ACTION_TIER_DELETED = "addon_pricing_tier_deleted"

STATUS_DRAFT = AddonPricingGridVersionStatus.DRAFT.value
STATUS_ACTIVE = AddonPricingGridVersionStatus.ACTIVE.value
STATUS_ARCHIVED = AddonPricingGridVersionStatus.ARCHIVED.value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _http(
    exc: AddonPricingError,
    *,
    http_status: int = status.HTTP_422_UNPROCESSABLE_ENTITY,
) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"code": exc.code, "message": exc.message},
    )


def _money_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _parse_currency(raw: Any, *, default: str = "RUB") -> str:
    value = str(raw or default).strip().upper() or default
    if len(value) < 3 or len(value) > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_currency", "message": "Некорректная валюта"},
        )
    return value


def tier_snapshot(tier: AddonPricingTier) -> dict[str, Any]:
    return {
        "id": int(tier.id) if tier.id is not None else None,
        "grid_version_id": int(tier.grid_version_id)
        if tier.grid_version_id is not None
        else None,
        "resource_type": tier.resource_type,
        "range_start": int(tier.range_start),
        "range_end": int(tier.range_end) if tier.range_end is not None else None,
        "unit_price": _money_str(tier.unit_price),
        "currency": (tier.currency or "RUB"),
        "is_active": bool(tier.is_active) if tier.is_active is not None else True,
        "sort_order": int(tier.sort_order or 0),
    }


def _tier_used_in_snapshots(db: Session, tier_id: int) -> bool:
    rows = (
        db.query(CheckoutIntent.price_grid_snapshot)
        .filter(CheckoutIntent.price_grid_snapshot.isnot(None))
        .all()
    )
    for (snap,) in rows:
        if not isinstance(snap, dict):
            continue
        for band in snap.get("bands") or []:
            if not isinstance(band, dict):
                continue
            try:
                if int(band.get("tier_id") or 0) == int(tier_id):
                    return True
            except (TypeError, ValueError):
                continue
    return False


def _version_used_in_snapshots(db: Session, version_id: int) -> bool:
    """Fail-closed: any checkout snapshot referencing this grid version or its tiers."""
    vid = int(version_id)
    tiers = _tiers_for_version(db, vid)
    tier_ids = {int(t.id) for t in tiers if t.id is not None}
    rows = (
        db.query(CheckoutIntent.price_grid_snapshot)
        .filter(CheckoutIntent.price_grid_snapshot.isnot(None))
        .all()
    )
    for (snap,) in rows:
        if not isinstance(snap, dict):
            continue
        try:
            if int(snap.get("pricing_grid_version_id") or 0) == vid:
                return True
        except (TypeError, ValueError):
            pass
        for band in snap.get("bands") or []:
            if not isinstance(band, dict):
                continue
            try:
                if int(band.get("tier_id") or 0) in tier_ids:
                    return True
            except (TypeError, ValueError):
                continue
    return False


def _used_map(db: Session, tiers: list[AddonPricingTier]) -> dict[int, bool]:
    ids = {int(t.id) for t in tiers if t.id is not None}
    if not ids:
        return {}
    used: dict[int, bool] = {tid: False for tid in ids}
    rows = (
        db.query(CheckoutIntent.price_grid_snapshot)
        .filter(CheckoutIntent.price_grid_snapshot.isnot(None))
        .all()
    )
    for (snap,) in rows:
        if not isinstance(snap, dict):
            continue
        for band in snap.get("bands") or []:
            if not isinstance(band, dict):
                continue
            try:
                tid = int(band.get("tier_id") or 0)
            except (TypeError, ValueError):
                continue
            if tid in used:
                used[tid] = True
    return used


def _tier_row(tier: AddonPricingTier, *, used_in_purchases: bool) -> dict[str, Any]:
    row = tier_snapshot(tier)
    row["used_in_purchases"] = used_in_purchases
    row["can_delete"] = not used_in_purchases
    return row


def version_snapshot(version: AddonPricingGridVersion) -> dict[str, Any]:
    return {
        "id": int(version.id) if version.id is not None else None,
        "resource_type": version.resource_type,
        "currency": (version.currency or "RUB"),
        "status": version.status,
        "version_number": int(version.version_number or 0),
        "based_on_version_id": int(version.based_on_version_id)
        if version.based_on_version_id is not None
        else None,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "published_at": version.published_at.isoformat()
        if version.published_at
        else None,
        "archived_at": version.archived_at.isoformat() if version.archived_at else None,
        "note": version.note,
    }


def get_grid_version_or_404(db: Session, version_id: int) -> AddonPricingGridVersion:
    version = (
        db.query(AddonPricingGridVersion)
        .filter(AddonPricingGridVersion.id == version_id)
        .first()
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "grid_version_not_found",
                "message": "Версия ценовой сетки не найдена",
            },
        )
    return version


def _assert_draft(version: AddonPricingGridVersion) -> None:
    if str(version.status) != STATUS_DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "grid_not_draft",
                "message": "Редактировать можно только черновик ценовой сетки",
            },
        )


def _tiers_for_version(db: Session, version_id: int) -> list[AddonPricingTier]:
    return (
        db.query(AddonPricingTier)
        .filter(AddonPricingTier.grid_version_id == version_id)
        .order_by(
            AddonPricingTier.range_start.asc(),
            AddonPricingTier.sort_order.asc(),
            AddonPricingTier.id.asc(),
        )
        .all()
    )


def _version_out(
    db: Session,
    version: AddonPricingGridVersion,
    *,
    include_tiers: bool = True,
) -> dict[str, Any]:
    row = version_snapshot(version)
    if include_tiers:
        tiers = _tiers_for_version(db, int(version.id))
        used = _used_map(db, tiers)
        row["tiers"] = [
            _tier_row(t, used_in_purchases=used.get(int(t.id), False)) for t in tiers
        ]
        row["tiers_count"] = len(tiers)
    else:
        row["tiers_count"] = (
            db.query(AddonPricingTier)
            .filter(AddonPricingTier.grid_version_id == int(version.id))
            .count()
        )
    return row


def list_grid_versions(
    db: Session,
    *,
    resource_type: str | None = None,
) -> list[dict[str, Any]]:
    q = db.query(AddonPricingGridVersion)
    if resource_type:
        try:
            rt = normalize_pricing_resource_type(resource_type)
        except AddonPricingError as exc:
            raise _http(exc) from exc
        q = q.filter(AddonPricingGridVersion.resource_type == rt)
    versions = q.order_by(
        AddonPricingGridVersion.resource_type.asc(),
        AddonPricingGridVersion.currency.asc(),
        AddonPricingGridVersion.version_number.desc(),
        AddonPricingGridVersion.id.desc(),
    ).all()
    return [_version_out(db, v, include_tiers=False) for v in versions]


def get_grid_version(db: Session, version_id: int) -> dict[str, Any]:
    version = get_grid_version_or_404(db, version_id)
    return _version_out(db, version, include_tiers=True)


def _next_version_number(db: Session, *, resource_type: str, currency: str) -> int:
    current = (
        db.query(AddonPricingGridVersion.version_number)
        .filter(
            AddonPricingGridVersion.resource_type == resource_type,
            AddonPricingGridVersion.currency == currency,
        )
        .order_by(AddonPricingGridVersion.version_number.desc())
        .first()
    )
    if current is None or current[0] is None:
        return 1
    return int(current[0]) + 1


def _find_active_version(
    db: Session,
    *,
    resource_type: str,
    currency: str,
) -> AddonPricingGridVersion | None:
    return (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.resource_type == resource_type,
            AddonPricingGridVersion.currency == currency,
            AddonPricingGridVersion.status == STATUS_ACTIVE,
        )
        .first()
    )


def _copy_tiers(
    db: Session,
    *,
    source_version_id: int,
    target: AddonPricingGridVersion,
) -> None:
    source_tiers = _tiers_for_version(db, source_version_id)
    for src in source_tiers:
        db.add(
            AddonPricingTier(
                grid_version_id=int(target.id),
                resource_type=str(target.resource_type),
                range_start=int(src.range_start),
                range_end=int(src.range_end) if src.range_end is not None else None,
                unit_price=src.unit_price,
                currency=str(target.currency),
                is_active=True,
                sort_order=int(src.sort_order or src.range_start or 0),
            )
        )


def create_draft_from_version(
    db: Session,
    *,
    resource_type: str,
    currency: str = "RUB",
    based_on_version_id: int | None = None,
    admin_user_id: int,
    note: str | None = None,
) -> dict[str, Any]:
    try:
        rt = normalize_pricing_resource_type(resource_type)
    except AddonPricingError as exc:
        raise _http(exc) from exc
    cur = _parse_currency(currency)

    source: AddonPricingGridVersion | None = None
    if based_on_version_id is not None:
        source = get_grid_version_or_404(db, based_on_version_id)
        if str(source.resource_type) != rt:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "resource_type_mismatch",
                    "message": "Тип ресурса не совпадает с исходной версией",
                },
            )
        if str(source.currency or "RUB").upper() != cur:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "currency_mismatch",
                    "message": "Валюта не совпадает с исходной версией",
                },
            )
    else:
        source = _find_active_version(db, resource_type=rt, currency=cur)

    version = AddonPricingGridVersion(
        resource_type=rt,
        currency=cur,
        status=STATUS_DRAFT,
        version_number=_next_version_number(db, resource_type=rt, currency=cur),
        based_on_version_id=int(source.id) if source is not None else None,
        created_at=_utcnow(),
        note=note,
    )
    db.add(version)
    db.flush()

    if source is not None:
        _copy_tiers(db, source_version_id=int(source.id), target=version)

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_GRID_DRAFT_CREATED,
        entity_type=ENTITY_GRID_VERSION,
        entity_id=int(version.id),
        old_value=None,
        new_value=version_snapshot(version),
        comment=f"Черновик сетки {rt}/{cur} v{version.version_number}",
    )
    db.commit()
    db.refresh(version)
    return _version_out(db, version, include_tiers=True)


def create_draft_from_active(
    db: Session,
    *,
    resource_type: str,
    currency: str = "RUB",
    admin_user_id: int,
    note: str | None = None,
) -> dict[str, Any]:
    return create_draft_from_version(
        db,
        resource_type=resource_type,
        currency=currency,
        based_on_version_id=None,
        admin_user_id=admin_user_id,
        note=note,
    )


def add_tier_to_draft(
    db: Session,
    *,
    version_id: int,
    payload: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    version = get_grid_version_or_404(db, version_id)
    _assert_draft(version)

    try:
        range_start = parse_range_start(payload.get("range_start"))
        range_end = parse_range_end(payload.get("range_end"))
        unit_price = parse_unit_price(payload.get("unit_price"))
    except AddonPricingError as exc:
        raise _http(exc) from exc
    if range_end is not None and range_end < range_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_range",
                "message": "Конец диапазона не может быть меньше начала",
            },
        )

    currency = _parse_currency(
        payload.get("currency"), default=str(version.currency or "RUB")
    )
    if currency != str(version.currency or "RUB").upper():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "currency_mismatch",
                "message": "Валюта ступени должна совпадать с валютой версии сетки",
            },
        )

    sort_order = int(payload.get("sort_order") or range_start)
    tier = AddonPricingTier(
        grid_version_id=int(version.id),
        resource_type=str(version.resource_type),
        range_start=range_start,
        range_end=range_end,
        unit_price=unit_price,
        currency=currency,
        is_active=True,
        sort_order=sort_order,
    )
    # Soft-validate proposed set (allow incomplete drafts until publish)
    proposed = list(_tiers_for_version(db, int(version.id))) + [tier]
    currencies = {(t.currency or "RUB").strip().upper() for t in proposed}
    if len(currencies) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "pricing_currency_mismatch",
                "message": "Все ступени версии должны быть в одной валюте",
            },
        )

    db.add(tier)
    db.flush()
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TIER_CREATED,
        entity_type=ENTITY_PRICING_TIER,
        entity_id=int(tier.id),
        old_value=None,
        new_value=tier_snapshot(tier),
        comment=f"Ступень добавлена в черновик сетки #{version.id}",
    )
    db.commit()
    db.refresh(tier)
    return _tier_row(tier, used_in_purchases=False)


def update_tier_on_draft(
    db: Session,
    *,
    version_id: int,
    tier_id: int,
    patch: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    version = get_grid_version_or_404(db, version_id)
    _assert_draft(version)
    tier = (
        db.query(AddonPricingTier)
        .filter(
            AddonPricingTier.id == tier_id,
            AddonPricingTier.grid_version_id == int(version.id),
        )
        .first()
    )
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tier_not_found", "message": "Ценовая ступень не найдена"},
        )

    before = tier_snapshot(tier)
    if "range_start" in patch:
        try:
            tier.range_start = parse_range_start(patch["range_start"])
        except AddonPricingError as exc:
            raise _http(exc) from exc
    if "range_end" in patch:
        try:
            tier.range_end = parse_range_end(patch["range_end"])
        except AddonPricingError as exc:
            raise _http(exc) from exc
    if tier.range_end is not None and int(tier.range_end) < int(tier.range_start):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_range",
                "message": "Конец диапазона не может быть меньше начала",
            },
        )
    if "unit_price" in patch:
        try:
            tier.unit_price = parse_unit_price(patch["unit_price"])
        except AddonPricingError as exc:
            raise _http(exc) from exc
    if "currency" in patch and patch["currency"] is not None:
        currency = _parse_currency(patch["currency"])
        if currency != str(version.currency or "RUB").upper():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "currency_mismatch",
                    "message": "Валюта ступени должна совпадать с валютой версии сетки",
                },
            )
        tier.currency = currency
    if "sort_order" in patch and patch["sort_order"] is not None:
        tier.sort_order = int(patch["sort_order"])

    # resource_type is denormalized from version — ignore / force
    tier.resource_type = str(version.resource_type)
    tier.currency = str(version.currency or "RUB").upper()

    after = tier_snapshot(tier)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TIER_UPDATED,
        entity_type=ENTITY_PRICING_TIER,
        entity_id=int(tier.id),
        old_value=before,
        new_value=after,
        comment=f"Ступень изменена в черновике сетки #{version.id}",
    )
    db.commit()
    db.refresh(tier)
    return _tier_row(tier, used_in_purchases=_tier_used_in_snapshots(db, int(tier.id)))


def delete_tier_on_draft(
    db: Session,
    *,
    version_id: int,
    tier_id: int,
    admin_user_id: int,
) -> None:
    version = get_grid_version_or_404(db, version_id)
    _assert_draft(version)
    tier = (
        db.query(AddonPricingTier)
        .filter(
            AddonPricingTier.id == tier_id,
            AddonPricingTier.grid_version_id == int(version.id),
        )
        .first()
    )
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tier_not_found", "message": "Ценовая ступень не найдена"},
        )
    if _tier_used_in_snapshots(db, int(tier.id)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "tier_in_use",
                "message": "Ступень уже участвовала в покупке. Удалите её из черновика нельзя.",
            },
        )
    before = tier_snapshot(tier)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TIER_DELETED,
        entity_type=ENTITY_PRICING_TIER,
        entity_id=int(tier.id),
        old_value=before,
        new_value=None,
        comment=f"Ступень удалена из черновика сетки #{version.id}",
    )
    db.delete(tier)
    db.commit()


def publish_grid_version(
    db: Session,
    *,
    version_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    version = get_grid_version_or_404(db, version_id)
    _assert_draft(version)

    tiers = _tiers_for_version(db, int(version.id))
    if not tiers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "pricing_unavailable",
                "message": "Нельзя опубликовать пустую ценовую сетку",
            },
        )

    version_currency = str(version.currency or "RUB").upper()
    for tier in tiers:
        tier_cur = str(tier.currency or "RUB").upper()
        if tier_cur != version_currency:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "currency_mismatch",
                    "message": "Валюта ступеней должна совпадать с валютой версии сетки",
                },
            )
        tier.resource_type = str(version.resource_type)
        tier.currency = version_currency
        tier.is_active = True

    try:
        validate_active_tier_set(tiers)
    except AddonPricingError as exc:
        raise _http(exc) from exc

    # Last closed band ending at/above technical max is economically open-ended.
    last = tiers[-1]
    if last.range_end is not None and int(last.range_end) >= int(MAX_CUSTOM_QUANTITY):
        last.range_end = None

    now = _utcnow()
    previous = _find_active_version(
        db,
        resource_type=str(version.resource_type),
        currency=version_currency,
    )
    before = version_snapshot(version)
    archived_snapshot = version_snapshot(previous) if previous is not None else None

    if previous is not None and int(previous.id) != int(version.id):
        previous.status = STATUS_ARCHIVED
        previous.archived_at = now
        # Keep historical tiers; mark inactive for legacy flat readers
        for old_tier in _tiers_for_version(db, int(previous.id)):
            old_tier.is_active = False

    version.status = STATUS_ACTIVE
    version.published_at = now
    version.archived_at = None

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_GRID_PUBLISHED,
        entity_type=ENTITY_GRID_VERSION,
        entity_id=int(version.id),
        old_value={"draft": before, "previous_active": archived_snapshot},
        new_value=version_snapshot(version),
        comment=(
            f"Опубликована сетка {version.resource_type}/{version_currency} "
            f"v{version.version_number}"
        ),
    )
    db.commit()
    db.refresh(version)
    return _version_out(db, version, include_tiers=True)


def delete_draft_grid_version(
    db: Session,
    *,
    version_id: int,
    admin_user_id: int,
) -> None:
    """Physically delete a draft grid version that was never used in checkout."""
    version = get_grid_version_or_404(db, version_id)
    if str(version.status) != STATUS_DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "grid_not_draft",
                "message": "Удалить можно только черновик ценовой сетки",
            },
        )
    if _version_used_in_snapshots(db, int(version.id)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "grid_in_use",
                "message": (
                    "Черновик уже участвовал в quote/checkout. "
                    "Физическое удаление запрещено."
                ),
            },
        )
    before = version_snapshot(version)
    tiers = _tiers_for_version(db, int(version.id))
    for tier in tiers:
        db.delete(tier)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_GRID_DRAFT_DELETED,
        entity_type=ENTITY_GRID_VERSION,
        entity_id=int(version.id),
        old_value=before,
        new_value=None,
        comment=(
            f"Удалён черновик сетки {version.resource_type}/"
            f"{version.currency} v{version.version_number}"
        ),
    )
    db.delete(version)
    db.commit()


def archive_active_grid_version(
    db: Session,
    *,
    version_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    """
    Archive the active grid without publishing a replacement.

    After this, custom quote/checkout for that resource+currency is unavailable
    until a new draft is published.
    """
    version = get_grid_version_or_404(db, version_id)
    if str(version.status) != STATUS_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "grid_not_active",
                "message": "Архивировать без публикации можно только активную версию",
            },
        )
    before = version_snapshot(version)
    now = _utcnow()
    version.status = STATUS_ARCHIVED
    version.archived_at = now
    for tier in _tiers_for_version(db, int(version.id)):
        tier.is_active = False
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_GRID_ARCHIVED,
        entity_type=ENTITY_GRID_VERSION,
        entity_id=int(version.id),
        old_value=before,
        new_value=version_snapshot(version),
        comment=(
            f"Активная сетка {version.resource_type}/{version.currency} "
            f"v{version.version_number} архивирована; продажи настраиваемого "
            f"пакета приостановлены до публикации новой версии"
        ),
    )
    db.commit()
    db.refresh(version)
    return _version_out(db, version, include_tiers=True)
