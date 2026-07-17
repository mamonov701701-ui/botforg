"""
Сервис PaymentProviderConnection (Этап 6.10A).

Секреты: encrypt on write, decrypt only inside verify/internal, never API/audit/logs.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import PaymentAttempt, PaymentAttemptStatus
from backend.models.payment_provider_connection import PaymentProviderConnection
from backend.payments.credentials.encryption import (
    CredentialEnvelope,
    decrypt_credentials_blob,
    encrypt_credentials_blob,
)
from backend.payments.credentials.errors import CredentialsCryptoError
from backend.payments.definitions.catalog import (
    PaymentProviderDefinition,
    get_provider_definition,
    public_identifier_field_names,
    require_provider_definition,
)
from backend.payments.registry import mask_secret
from backend.services.tariff_admin_audit import write_admin_audit_log
from backend.settings import settings

ENTITY_TYPE = "payment_provider_connection"

UNFINISHED_ATTEMPT_STATUSES = frozenset(
    {
        PaymentAttemptStatus.CREATED.value,
        PaymentAttemptStatus.PENDING.value,
    }
)

ACTION_CREATE = "connection_create"
ACTION_UPDATE = "connection_update"
ACTION_CREDENTIALS_SET = "credentials_set"
ACTION_CREDENTIALS_REPLACE = "credentials_replace"
ACTION_VERIFY = "connection_verify"
ACTION_SET_DEFAULT = "set_default"
ACTION_DISABLE = "connection_disable"
ACTION_DELETE = "connection_delete"


class ConnectionServiceError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "connection_error",
        http_status: int = 400,
        field: str | None = None,
    ):
        self.code = code
        self.http_status = http_status
        self.field = field
        super().__init__(message)

    def __repr__(self) -> str:
        return (
            f"ConnectionServiceError(code={self.code!r}, http_status={self.http_status},"
            f" field={self.field!r})"
        )


# Сообщения формата credentials (без значений секретов).
SHOP_ID_INVALID_RU = (
    "Некорректный Shop ID. Укажите числовой идентификатор магазина "
    "из личного кабинета ЮKassa."
)


def _credential_format_error(field_name: str, _value: str = "") -> ConnectionServiceError:
    if field_name == "shop_id":
        return ConnectionServiceError(
            SHOP_ID_INVALID_RU,
            code="invalid_credential_format",
            http_status=422,
            field="shop_id",
        )
    label = field_name
    return ConnectionServiceError(
        f"Некорректный формат поля «{label}»",
        code="invalid_credential_format",
        http_status=422,
        field=field_name,
    )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_production() -> bool:
    return (getattr(settings, "ENVIRONMENT", "") or "").strip().lower() == "production"


def _safe_snapshot(row: PaymentProviderConnection) -> dict[str, Any]:
    """Audit-safe snapshot — без ciphertext/nonce/tag/plaintext."""
    return {
        "id": row.id,
        "provider_code": row.provider_code,
        "connection_name": row.connection_name,
        "mode": row.mode,
        "enabled": row.enabled,
        "verified": row.verified,
        "is_default": row.is_default,
        "currency": row.currency,
        "priority": row.priority,
        "public_identifier_masked": row.public_identifier_masked,
        "credentials_version": row.credentials_version,
        "credentials_key_id": row.credentials_key_id,
        "has_credentials": row.has_credentials(),
        "last_health_check_status": row.last_health_check_status,
    }


def _field_names_only(credentials: dict[str, Any] | None) -> list[str]:
    if not credentials:
        return []
    return sorted(str(k) for k in credentials.keys())


def _validate_credentials_against_schema(
    definition: PaymentProviderDefinition,
    credentials: dict[str, str],
    *,
    mode: str,
) -> dict[str, str]:
    """Валидация структуры; возвращает нормализованный dict. Не логирует значения."""
    if not isinstance(credentials, dict):
        raise ConnectionServiceError(
            "credentials must be an object",
            code="invalid_credentials",
            http_status=422,
        )
    schema_by_name = {f.name: f for f in definition.credential_schema}
    unknown = [k for k in credentials.keys() if k not in schema_by_name]
    if unknown:
        raise ConnectionServiceError(
            f"Unknown credential fields: {', '.join(sorted(unknown))}",
            code="unknown_credential_fields",
            http_status=422,
        )

    cleaned: dict[str, str] = {}
    for field in definition.credential_schema:
        if mode not in field.allowed_modes:
            continue
        raw = credentials.get(field.name)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            if field.required:
                raise ConnectionServiceError(
                    f"Missing required credential field: {field.name}",
                    code="missing_credential_field",
                    http_status=422,
                )
            continue
        value = str(raw).strip()
        # Email и прочий нечисловой ввод для shop_id — явный отказ до regex.
        if field.name == "shop_id":
            if "@" in value or not re.fullmatch(r"^[0-9]{1,20}$", value):
                raise _credential_format_error(field.name, value)
        elif field.validation_pattern:
            if not re.fullmatch(field.validation_pattern, value):
                raise _credential_format_error(field.name, value)
        cleaned[field.name] = value
    return cleaned


def _mask_public_identifier(
    definition: PaymentProviderDefinition,
    credentials: dict[str, str],
) -> str | None:
    parts: list[str] = []
    for name in public_identifier_field_names(definition):
        val = credentials.get(name)
        if val:
            parts.append(f"{name}={mask_secret(val, visible=4)}")
    return "; ".join(parts) if parts else None


def _apply_envelope(row: PaymentProviderConnection, envelope: CredentialEnvelope) -> None:
    row.credentials_encryption_version = envelope.encryption_version
    row.credentials_key_id = envelope.key_id
    row.credentials_nonce = envelope.nonce
    row.credentials_ciphertext = envelope.ciphertext
    row.credentials_auth_tag = envelope.auth_tag
    row.credentials_version = int(row.credentials_version or 0) + 1


def _encrypt_and_store(
    row: PaymentProviderConnection,
    definition: PaymentProviderDefinition,
    credentials: dict[str, str],
) -> list[str]:
    cleaned = _validate_credentials_against_schema(
        definition, credentials, mode=row.mode
    )
    payload = json.dumps(cleaned, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    try:
        envelope = encrypt_credentials_blob(payload)
    except CredentialsCryptoError as exc:
        raise ConnectionServiceError(
            str(exc),
            code=exc.code,
            http_status=503,
        ) from None
    finally:
        # best-effort clear local payload reference
        payload = b""

    _apply_envelope(row, envelope)
    row.public_identifier_masked = _mask_public_identifier(definition, cleaned)
    # Invalidate verification after credential change
    row.verified = False
    row.verified_at = None
    field_names = list(cleaned.keys())
    cleaned.clear()
    return field_names


def connection_to_out(row: PaymentProviderConnection) -> dict[str, Any]:
    definition = get_provider_definition(row.provider_code)
    adapter_status = definition.adapter_status if definition else "planned"
    # Present fields: non-secret names from masked public id + secret field names only as names
    present: list[str] = []
    if definition and row.has_credentials():
        present = [f.name for f in definition.credential_schema]
    return {
        "id": row.id,
        "provider_code": row.provider_code,
        "connection_name": row.connection_name,
        "mode": row.mode,
        "enabled": bool(row.enabled),
        "verified": bool(row.verified),
        "is_default": bool(row.is_default),
        "currency": row.currency,
        "priority": row.priority,
        "public_identifier_masked": row.public_identifier_masked,
        "credentials_version": row.credentials_version or 0,
        "credentials_key_id": row.credentials_key_id,
        "has_credentials": row.has_credentials(),
        # Only field names — never values
        "credential_fields_present": present if row.has_credentials() else [],
        "adapter_status": adapter_status,
        "created_by": row.created_by,
        "updated_by": row.updated_by,
        "verified_at": row.verified_at,
        "last_health_check_at": row.last_health_check_at,
        "last_health_check_status": row.last_health_check_status,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def list_connections(db: Session) -> list[PaymentProviderConnection]:
    return (
        db.query(PaymentProviderConnection)
        .order_by(
            PaymentProviderConnection.is_default.desc(),
            PaymentProviderConnection.priority.asc(),
            PaymentProviderConnection.id.asc(),
        )
        .all()
    )


def get_connection(db: Session, connection_id: int) -> PaymentProviderConnection:
    row = (
        db.query(PaymentProviderConnection)
        .filter(PaymentProviderConnection.id == connection_id)
        .one_or_none()
    )
    if row is None:
        raise ConnectionServiceError(
            "Connection not found",
            code="not_found",
            http_status=404,
        )
    return row


def create_connection(
    db: Session,
    *,
    admin_user_id: int,
    provider_code: str,
    connection_name: str,
    mode: str,
    currency: str,
    priority: int,
    enabled: bool,
    credentials: dict[str, str],
) -> PaymentProviderConnection:
    code = (provider_code or "").strip().lower()
    try:
        definition = require_provider_definition(code)
    except KeyError as exc:
        raise ConnectionServiceError(
            "Unknown provider definition",
            code="unknown_provider",
            http_status=404,
        ) from exc

    if definition.adapter_status != "available":
        raise ConnectionServiceError(
            "Provider adapter is planned and cannot be connected yet",
            code="adapter_planned",
            http_status=409,
        )

    if definition.is_fake and _is_production():
        raise ConnectionServiceError(
            "Fake provider is forbidden in production",
            code="fake_forbidden",
            http_status=403,
        )

    if mode == "production" and definition.is_fake:
        raise ConnectionServiceError(
            "Fake provider cannot use production mode",
            code="fake_production_forbidden",
            http_status=400,
        )

    if not credentials:
        raise ConnectionServiceError(
            "credentials are required on create",
            code="credentials_required",
            http_status=422,
        )

    exists = (
        db.query(PaymentProviderConnection)
        .filter(
            PaymentProviderConnection.provider_code == code,
            PaymentProviderConnection.connection_name == connection_name.strip(),
        )
        .one_or_none()
    )
    if exists:
        raise ConnectionServiceError(
            "Connection with this name already exists for provider",
            code="duplicate_connection_name",
            http_status=409,
        )

    row = PaymentProviderConnection(
        provider_code=code,
        connection_name=connection_name.strip(),
        mode=mode,
        currency=currency.upper(),
        priority=priority,
        # Always start disabled until verify succeeds (lifecycle 6.10B)
        enabled=False,
        verified=False,
        is_default=False,
        created_by=admin_user_id,
        updated_by=admin_user_id,
    )
    field_names = _encrypt_and_store(row, definition, credentials)
    db.add(row)
    db.flush()

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_CREATE,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=None,
        new_value={
            **_safe_snapshot(row),
            "credential_fields_set": field_names,
        },
        comment="connection_create",
    )
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_CREDENTIALS_SET,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=None,
        new_value={
            "provider_code": row.provider_code,
            "connection_id": row.id,
            "credential_fields_set": field_names,
            "credentials_version": row.credentials_version,
            "public_identifier_masked": row.public_identifier_masked,
        },
        comment="credentials_set",
    )
    db.commit()
    db.refresh(row)
    return row


def update_connection(
    db: Session,
    *,
    admin_user_id: int,
    connection_id: int,
    patch: dict[str, Any],
) -> PaymentProviderConnection:
    row = get_connection(db, connection_id)
    if "credentials" in patch:
        raise ConnectionServiceError(
            "PATCH must not include credentials; use PUT .../credentials",
            code="credentials_not_allowed",
            http_status=422,
        )

    old = _safe_snapshot(row)
    changed: list[str] = []

    if "connection_name" in patch and patch["connection_name"] is not None:
        name = str(patch["connection_name"]).strip()
        clash = (
            db.query(PaymentProviderConnection)
            .filter(
                PaymentProviderConnection.provider_code == row.provider_code,
                PaymentProviderConnection.connection_name == name,
                PaymentProviderConnection.id != row.id,
            )
            .one_or_none()
        )
        if clash:
            raise ConnectionServiceError(
                "Connection with this name already exists for provider",
                code="duplicate_connection_name",
                http_status=409,
            )
        row.connection_name = name
        changed.append("connection_name")

    if "mode" in patch and patch["mode"] is not None:
        definition = require_provider_definition(row.provider_code)
        if definition.is_fake and patch["mode"] == "production":
            raise ConnectionServiceError(
                "Fake provider cannot use production mode",
                code="fake_production_forbidden",
                http_status=400,
            )
        row.mode = patch["mode"]
        changed.append("mode")
        # Mode change requires re-verify
        row.verified = False
        row.verified_at = None

    if "currency" in patch and patch["currency"] is not None:
        row.currency = str(patch["currency"]).strip().upper()
        changed.append("currency")

    if "priority" in patch and patch["priority"] is not None:
        row.priority = int(patch["priority"])
        changed.append("priority")

    disable_action = False
    if "enabled" in patch and patch["enabled"] is not None:
        new_enabled = bool(patch["enabled"])
        if new_enabled:
            definition = require_provider_definition(row.provider_code)
            if not row.has_credentials():
                raise ConnectionServiceError(
                    "Cannot enable connection without credentials",
                    code="no_credentials",
                    http_status=409,
                )
            if not row.verified:
                raise ConnectionServiceError(
                    "Cannot enable connection before successful verification",
                    code="not_verified",
                    http_status=409,
                )
            if definition.adapter_status != "available":
                raise ConnectionServiceError(
                    "Adapter is not implemented",
                    code="adapter_planned",
                    http_status=409,
                )
        if row.enabled and not new_enabled:
            disable_action = True
            if row.is_default:
                raise ConnectionServiceError(
                    "Сначала назначьте другой default, затем отключите провайдер",
                    code="cannot_disable_default",
                    http_status=409,
                )
        row.enabled = new_enabled
        changed.append("enabled")

    row.updated_by = admin_user_id
    row.updated_at = _utcnow()
    db.flush()

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_DISABLE if disable_action else ACTION_UPDATE,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=old,
        new_value={**_safe_snapshot(row), "changed_fields": changed},
        comment="connection_disable" if disable_action else "connection_update",
    )
    db.commit()
    db.refresh(row)
    return row


def replace_credentials(
    db: Session,
    *,
    admin_user_id: int,
    connection_id: int,
    credentials: dict[str, str],
) -> PaymentProviderConnection:
    row = get_connection(db, connection_id)
    definition = require_provider_definition(row.provider_code)
    old_version = row.credentials_version
    field_names = _encrypt_and_store(row, definition, credentials)
    row.updated_by = admin_user_id
    row.updated_at = _utcnow()
    db.flush()

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_CREDENTIALS_REPLACE,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value={
            "connection_id": row.id,
            "provider_code": row.provider_code,
            "credentials_version": old_version,
            "public_identifier_masked": None,
        },
        new_value={
            "connection_id": row.id,
            "provider_code": row.provider_code,
            "credential_fields_set": field_names,
            "credentials_version": row.credentials_version,
            "public_identifier_masked": row.public_identifier_masked,
        },
        comment="credentials_replace",
    )
    db.commit()
    db.refresh(row)
    return row


def set_default_connection(
    db: Session,
    *,
    admin_user_id: int,
    connection_id: int,
) -> PaymentProviderConnection:
    row = get_connection(db, connection_id)
    if not row.enabled:
        raise ConnectionServiceError(
            "Only an enabled connection can be default",
            code="not_enabled",
            http_status=409,
        )
    if not row.verified:
        raise ConnectionServiceError(
            "Only a verified (config_valid) connection can be default",
            code="not_verified",
            http_status=409,
        )
    if not row.has_credentials():
        raise ConnectionServiceError(
            "Connection has no credentials",
            code="no_credentials",
            http_status=409,
        )
    definition = require_provider_definition(row.provider_code)
    if definition.is_fake and _is_production():
        raise ConnectionServiceError(
            "Fake provider is forbidden in production",
            code="fake_forbidden",
            http_status=403,
        )

    old = _safe_snapshot(row)
    (
        db.query(PaymentProviderConnection)
        .filter(PaymentProviderConnection.is_default.is_(True))
        .update({PaymentProviderConnection.is_default: False}, synchronize_session=False)
    )
    row.is_default = True
    row.updated_by = admin_user_id
    row.updated_at = _utcnow()
    db.flush()

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_SET_DEFAULT,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=old,
        new_value=_safe_snapshot(row),
        comment="set_default",
    )
    db.commit()
    db.refresh(row)
    return row


def verify_connection(
    db: Session,
    *,
    admin_user_id: int,
    connection_id: int,
) -> dict[str, Any]:
    """
    Проверка credentials: decrypt + schema + safe live adapter check (без списания).
    Plaintext только в локальной области.
    """
    from backend.payments.base import PaymentProviderError
    from backend.payments.registry import get_payment_provider

    row = get_connection(db, connection_id)
    definition = require_provider_definition(row.provider_code)
    checked_at = _utcnow()

    if not row.has_credentials():
        raise ConnectionServiceError(
            "Connection has no credentials to verify",
            code="no_credentials",
            http_status=409,
        )

    envelope = CredentialEnvelope(
        encryption_version=int(row.credentials_encryption_version or 1),
        key_id=row.credentials_key_id or "default",
        nonce=bytes(row.credentials_nonce or b""),
        ciphertext=bytes(row.credentials_ciphertext or b""),
        auth_tag=bytes(row.credentials_auth_tag or b""),
    )

    plaintext: bytes | None = None
    status = "invalid"
    message = "Проверка не пройдена"
    mark_verified = False
    creds: dict[str, str] = {}

    try:
        plaintext = decrypt_credentials_blob(envelope)
        data = json.loads(plaintext.decode("utf-8"))
        if not isinstance(data, dict):
            raise ConnectionServiceError(
                "Stored credentials payload is invalid",
                code="invalid_payload",
                http_status=500,
            )
        _validate_credentials_against_schema(definition, data, mode=row.mode)
        creds = {str(k): str(v) for k, v in data.items()}
        data.clear()

        if definition.adapter_status != "available":
            status = "adapter_not_implemented"
            message = "Адаптер ещё не реализован"
            mark_verified = False
        else:
            provider = get_payment_provider(row.provider_code, credentials=creds)
            verify_fn = getattr(provider, "verify_credentials", None)
            if callable(verify_fn):
                ok, msg = verify_fn()
                if ok:
                    status = "config_valid"
                    message = msg or "Подключение проверено"
                    mark_verified = True
                else:
                    status = "invalid"
                    message = msg or "Проверка не пройдена"
                    mark_verified = False
            else:
                status = "config_valid"
                message = "Настройки сохранены"
                mark_verified = True
    except CredentialsCryptoError as exc:
        status = "invalid"
        if getattr(exc, "code", "") == "master_key_missing":
            message = "Серверное шифрование не настроено"
        elif getattr(exc, "code", "") == "decrypt_failed":
            message = "Не удалось расшифровать сохранённые ключи"
        else:
            message = "Проверка не пройдена"
        mark_verified = False
    except PaymentProviderError as exc:
        status = "invalid"
        message = str(exc.message) if getattr(exc, "message", None) else "Проверка не пройдена"
        mark_verified = False
    except ConnectionServiceError as exc:
        status = "invalid"
        message = str(exc)
        mark_verified = False
    finally:
        plaintext = None
        for key in list(creds.keys()):
            creds[key] = ""
        creds.clear()

    row.verified = mark_verified
    row.verified_at = checked_at if mark_verified else None
    row.last_health_check_at = checked_at
    row.last_health_check_status = status
    row.updated_by = admin_user_id
    row.updated_at = checked_at
    db.flush()

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_VERIFY,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=None,
        new_value={
            "connection_id": row.id,
            "provider_code": row.provider_code,
            "status": status,
            "verified": mark_verified,
            "public_identifier_masked": row.public_identifier_masked,
        },
        comment="connection_verify",
    )
    db.commit()
    db.refresh(row)

    return {
        "connection_id": row.id,
        "provider_code": row.provider_code,
        "status": status,
        "message": message,
        "verified": mark_verified,
        "checked_at": checked_at,
    }


def delete_connection(
    db: Session,
    *,
    admin_user_id: int,
    connection_id: int,
) -> None:
    row = get_connection(db, connection_id)
    if row.is_default:
        raise ConnectionServiceError(
            "Нельзя удалить основное подключение. Сначала назначьте другое основным.",
            code="cannot_delete_default",
            http_status=409,
        )
    if row.enabled:
        raise ConnectionServiceError(
            "Сначала выключите подключение, затем удалите его.",
            code="cannot_delete_enabled",
            http_status=409,
        )
    unfinished = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.connection_id == row.id,
            PaymentAttempt.status.in_(tuple(UNFINISHED_ATTEMPT_STATUSES)),
        )
        .count()
    )
    if unfinished:
        raise ConnectionServiceError(
            "Нельзя удалить подключение: есть незавершённые платежи. "
            "Дождитесь завершения или отмените их.",
            code="connection_in_use",
            http_status=409,
        )

    old = _safe_snapshot(row)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_DELETE,
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=old,
        new_value=None,
        comment="connection_delete",
    )
    # Explicit null-out for SQLite (FK ON DELETE may be off) — keep provider snapshot.
    (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.connection_id == row.id)
        .update(
            {PaymentAttempt.connection_id: None},
            synchronize_session=False,
        )
    )
    db.delete(row)
    db.commit()


def resolve_default_connection(
    db: Session,
) -> PaymentProviderConnection | None:
    """Default для новых платежей: enabled + verified + is_default."""
    return (
        db.query(PaymentProviderConnection)
        .filter(
            PaymentProviderConnection.is_default.is_(True),
            PaymentProviderConnection.enabled.is_(True),
            PaymentProviderConnection.verified.is_(True),
        )
        .order_by(PaymentProviderConnection.priority.asc())
        .first()
    )


def decrypt_connection_credentials_for_internal_use(
    row: PaymentProviderConnection,
) -> dict[str, str]:
    """
    Internal-only decrypt. Caller MUST clear returned dict after use.
    Never expose via API.
    """
    if not row.has_credentials():
        raise ConnectionServiceError(
            "No credentials",
            code="no_credentials",
            http_status=409,
        )
    envelope = CredentialEnvelope(
        encryption_version=int(row.credentials_encryption_version or 1),
        key_id=row.credentials_key_id or "default",
        nonce=bytes(row.credentials_nonce or b""),
        ciphertext=bytes(row.credentials_ciphertext or b""),
        auth_tag=bytes(row.credentials_auth_tag or b""),
    )
    try:
        plaintext = decrypt_credentials_blob(envelope)
        data = json.loads(plaintext.decode("utf-8"))
    except CredentialsCryptoError as exc:
        raise ConnectionServiceError(
            str(exc),
            code=exc.code,
            http_status=503,
        ) from None
    if not isinstance(data, dict):
        raise ConnectionServiceError(
            "Invalid credentials payload",
            code="invalid_payload",
            http_status=500,
        )
    return {str(k): str(v) for k, v in data.items()}
