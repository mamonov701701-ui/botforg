"""
Этап 6.14.10A: представление RefundAuditEvent для пользователя и администратора.

Единственный источник истины — refund_audit_events.
Каталог только преобразует события; без email/outbox/side-effects.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from backend.models.refund import RefundAuditAction, RefundRequestStatus

# Максимум событий в пользовательской status_history (последние N по времени).
USER_STATUS_HISTORY_LIMIT = 200

PublicCategory = Literal[
    "request",
    "information",
    "calculation",
    "decision",
    "processing",
    "completed",
    "canceled",
    "attention",
]

# Admin whitelist для details (не весь event_metadata).
_ADMIN_DETAIL_KEYS = (
    "outcome",
    "error_code",
    "provider_refund_id",
    "applied_action",
    "entitlement_action",
    "addon_revoke_units",
    "units",
    "revision_number",
    "revision_id",
    "refund_revision_id",
    "proposed_refund_amount",
    "final_refund_amount",
    "recovery",
    "retry",
    "note",
    "confirmed_refunded_amount",
    "equivalent_units_money",
    "money_units_delta",
    "provider_called",
)

_TECHNICAL_REASON_MARKERS = (
    "traceback",
    "stack",
    "exception",
    "sqlalchemy",
    "provider_refund",
    "webhook",
    "idempotency",
    "fingerprint",
    "ciphertext",
    "credentials",
    "authorization",
    "error_code",
    "http/",
    "must_not_leak",
)


@dataclass(frozen=True)
class PublicHistoryItem:
    id: int
    occurred_at: datetime
    title: str
    description: str
    category: PublicCategory
    status: str | None


@dataclass(frozen=True)
class AdminHistoryItem:
    id: int
    refund_request_id: int
    refund_revision_id: int | None
    actor_user_id: int | None
    actor_type: str
    action: str
    title: str
    previous_status: str | None
    new_status: str | None
    changed_fields: dict[str, Any] | None
    reason: str | None
    details: dict[str, Any] | None
    created_at: datetime


def _as_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    return {}


def _is_safe_public_reason(reason: str | None) -> bool:
    if not reason:
        return False
    text = reason.strip()
    if not text or len(text) > 2000:
        return False
    lower = text.lower()
    if any(m in lower for m in _TECHNICAL_REASON_MARKERS):
        return False
    # Чисто латинские технические коды без кириллицы — не публикуем.
    if not any("а" <= ch.lower() <= "я" or ch in "ёЁ" for ch in text):
        if any(ch.isalpha() for ch in text) and ("_" in text or text.isidentifier()):
            return False
    return True


def public_reason_for_status(
    *,
    status: str | None,
    audit_reason: str | None,
) -> str | None:
    """
    Публичная причина только для needs_information / rejected
    и только если текст выглядит пользовательским.
    """
    if status not in {
        RefundRequestStatus.NEEDS_INFORMATION.value,
        RefundRequestStatus.REJECTED.value,
    }:
        return None
    if _is_safe_public_reason(audit_reason):
        return audit_reason.strip()
    return None


def _mask_provider_id(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if len(s) <= 8:
        return s
    return f"{s[:4]}…{s[-4:]}"


def project_admin_details(metadata: Any) -> dict[str, Any] | None:
    raw = _as_dict(metadata)
    if not raw:
        return None
    out: dict[str, Any] = {}
    for key in _ADMIN_DETAIL_KEYS:
        if key not in raw:
            continue
        val = raw[key]
        if val is None or val == "":
            continue
        if key == "provider_refund_id":
            masked = _mask_provider_id(val)
            if masked:
                out[key] = masked
            continue
        if isinstance(val, (str, int, float, bool)):
            out[key] = val
        elif isinstance(val, (int, float)) or val is True or val is False:
            out[key] = val
    return out or None


def _project_changed_fields(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    allowed = (
        "proposed_refund_amount",
        "refund_type",
        "entitlement_action",
        "addon_revoke_units",
        "status",
    )
    out: dict[str, Any] = {}
    for key in allowed:
        if key not in raw:
            continue
        value = raw[key]
        if isinstance(value, dict):
            out[key] = {
                k: value[k] for k in ("from", "to") if k in value
            }
        elif isinstance(value, (str, int, float, bool)) or value is None:
            out[key] = value
    return out or None


def _admin_title(action: str, new_status: str | None, meta: dict[str, Any]) -> str:
    outcome = str(meta.get("outcome") or "")
    if action == RefundAuditAction.CREATED.value:
        return "Заявка создана"
    if action == RefundAuditAction.USER_INFORMATION_PROVIDED.value:
        return "Пользователь предоставил дополнительную информацию"
    if action == RefundAuditAction.REVISION_CREATED.value:
        return "Создана ревизия расчёта"
    if action == RefundAuditAction.APPROVED_REVISION_SET.value:
        return "Утверждена ревизия"
    if action == RefundAuditAction.LEDGER_ENTRY_CREATED.value:
        return "Создана запись ledger"
    if action == RefundAuditAction.VALIDATION_REJECTED.value:
        return "Валидация отклонена"
    if action.startswith("entitlement_"):
        mapping = {
            RefundAuditAction.ENTITLEMENT_APPLY_STARTED.value: "Начато применение entitlement",
            RefundAuditAction.ENTITLEMENT_APPLIED.value: "Entitlement применён",
            RefundAuditAction.ENTITLEMENT_ALREADY_APPLIED.value: "Entitlement уже применён",
            RefundAuditAction.ENTITLEMENT_NOT_REQUIRED.value: "Entitlement не требуется",
            RefundAuditAction.ENTITLEMENT_FAILED.value: "Ошибка entitlement",
            RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value: "Entitlement требует ручной проверки",
            RefundAuditAction.ENTITLEMENT_RECOVERY.value: (
                "Recovery entitlement (деньги не менялись)"
            ),
        }
        return mapping.get(action, "Изменение entitlement")
    if action == RefundAuditAction.STATUS_CHANGED.value:
        by_status = {
            RefundRequestStatus.CANCELED.value: "Заявка отменена",
            RefundRequestStatus.NEEDS_INFORMATION.value: "Запрошены дополнительные сведения",
            RefundRequestStatus.REJECTED.value: "Заявка отклонена",
            RefundRequestStatus.APPROVED.value: "Заявка одобрена",
            RefundRequestStatus.REFUND_PROCESSING.value: "Возврат в обработке",
            RefundRequestStatus.REFUNDED.value: "Провайдер подтвердил возврат",
            RefundRequestStatus.PARTIALLY_REFUNDED.value: "Частичный возврат подтверждён",
            RefundRequestStatus.REFUND_FAILED.value: "Возврат не выполнен",
            RefundRequestStatus.PROVIDER_UNKNOWN.value: "Статус провайдера неизвестен",
            RefundRequestStatus.COMPLETED.value: "Возврат завершён",
            RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value: "Требуется ручная проверка",
            RefundRequestStatus.CALCULATION_FAILED.value: "Ошибка расчёта",
            RefundRequestStatus.ENTITLEMENT_FAILED.value: "Ошибка entitlement",
            RefundRequestStatus.ENTITLEMENT_PROCESSING.value: "Обработка entitlement",
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value: "Ожидает проверки администратора",
            RefundRequestStatus.ADMIN_EDITED.value: "Расчёт изменён администратором",
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value: "Ожидает финального подтверждения",
            RefundRequestStatus.CALCULATING.value: "Идёт расчёт",
            RefundRequestStatus.SUBMITTED.value: "Заявка отправлена",
        }
        if outcome == "pending":
            return "Провайдер: ожидание подтверждения"
        if outcome == "succeeded":
            return "Провайдер: возврат подтверждён"
        if outcome in {"canceled", "failed"}:
            return "Провайдер: возврат не выполнен"
        if outcome == "provider_unknown":
            return "Провайдер: статус неизвестен"
        if meta.get("recovery") or meta.get("retry"):
            base = by_status.get(new_status or "", "Изменение статуса")
            return f"{base} (recovery/retry)"
        return by_status.get(new_status or "", "Изменение статуса")
    return "Событие журнала"


@dataclass(frozen=True)
class PresentationContext:
    """Контекст заявки для публичных формулировок (без чтения metadata)."""

    recommended_refund_amount: str | None = None
    currency: str | None = None
    proposed_amount_undefined: bool = False


def present_public_event(
    event: Any,
    *,
    ctx: PresentationContext,
) -> PublicHistoryItem | None:
    """
    Преобразование одного audit event в публичный элемент.
    Неизвестные/внутренние события пропускаются (без утечки action-кода).
    """
    action = str(getattr(event, "action", "") or "")
    new = getattr(event, "new_status", None)
    reason = getattr(event, "reason", None)
    meta = _as_dict(getattr(event, "event_metadata", None))
    event_id = int(getattr(event, "id"))
    occurred_at = getattr(event, "created_at")

    def item(
        title: str,
        description: str,
        category: PublicCategory,
        status: str | None = None,
    ) -> PublicHistoryItem:
        return PublicHistoryItem(
            id=event_id,
            occurred_at=occurred_at,
            title=title,
            description=description,
            category=category,
            status=status,
        )

    if action == RefundAuditAction.CREATED.value:
        return item(
            "Заявка на возврат создана",
            "Мы получили вашу заявку и начали её рассмотрение.",
            "request",
            new or RefundRequestStatus.SUBMITTED.value,
        )

    if action == RefundAuditAction.USER_INFORMATION_PROVIDED.value:
        reply = (reason or "").strip()
        desc = (
            "Вы отправили ответ администратору. Заявка возвращена на рассмотрение."
        )
        if reply and _is_safe_public_reason(reply):
            desc = f"{desc}\n\n{reply}"
        return item(
            "Дополнительная информация отправлена",
            desc,
            "information",
            new or RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        )

    if action == RefundAuditAction.REVISION_CREATED.value:
        if ctx.proposed_amount_undefined or not ctx.recommended_refund_amount:
            desc = "Расчёт по заявке был обновлён."
        else:
            cur = f" {ctx.currency}" if ctx.currency else ""
            desc = f"Обновлён расчёт возврата. Рекомендуемая сумма: {ctx.recommended_refund_amount}{cur}."
        return item("Расчёт возврата обновлён", desc, "calculation", new)

    if action == RefundAuditAction.APPROVED_REVISION_SET.value:
        return item(
            "Возврат одобрен",
            "Заявка одобрена и передана на выполнение.",
            "decision",
            new or RefundRequestStatus.APPROVED.value,
        )

    if action in {
        RefundAuditAction.ENTITLEMENT_APPLIED.value,
        RefundAuditAction.ENTITLEMENT_ALREADY_APPLIED.value,
        RefundAuditAction.ENTITLEMENT_NOT_REQUIRED.value,
    }:
        return item(
            "Изменения по тарифу или пакету применены",
            "После возврата обновлены связанные тарифные права или доступные единицы.",
            "completed",
            new,
        )

    if action == RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value:
        return item(
            "Заявка проверяется вручную",
            "Для завершения возврата требуется дополнительная проверка администратора.",
            "attention",
            new or RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        )

    if action == RefundAuditAction.ENTITLEMENT_FAILED.value:
        return item(
            "Возврат временно не завершён",
            "Во время обработки возникла техническая проблема. Заявка сохранена и будет проверена.",
            "attention",
            new,
        )

    if action == RefundAuditAction.STATUS_CHANGED.value:
        outcome = str(meta.get("outcome") or "")

        if new == RefundRequestStatus.CANCELED.value:
            return item(
                "Заявка отменена",
                "Вы отменили заявку на возврат.",
                "canceled",
                new,
            )

        if new == RefundRequestStatus.NEEDS_INFORMATION.value:
            pub = public_reason_for_status(status=new, audit_reason=reason)
            desc = pub or (
                "Для продолжения рассмотрения необходимо предоставить дополнительную информацию."
            )
            return item("Нужна дополнительная информация", desc, "information", new)

        if new == RefundRequestStatus.REJECTED.value:
            pub = public_reason_for_status(status=new, audit_reason=reason)
            desc = pub or (
                "Решение по заявке принято. Подробности доступны в карточке возврата."
            )
            return item("В возврате отказано", desc, "decision", new)

        if new == RefundRequestStatus.APPROVED.value:
            return item(
                "Возврат одобрен",
                "Заявка одобрена и передана на выполнение.",
                "decision",
                new,
            )

        if new == RefundRequestStatus.REFUND_PROCESSING.value:
            if outcome == "pending":
                return item(
                    "Возврат выполняется",
                    "Платёжный провайдер обрабатывает возврат.",
                    "processing",
                    new,
                )
            return item(
                "Возврат выполняется",
                "Запрос на возврат передан в обработку.",
                "processing",
                new,
            )

        if new in {
            RefundRequestStatus.REFUNDED.value,
            RefundRequestStatus.PARTIALLY_REFUNDED.value,
        } or outcome == "succeeded":
            return item(
                "Деньги возвращены",
                "Платёжная система подтвердила возврат средств.",
                "processing",
                new,
            )

        if new == RefundRequestStatus.REFUND_FAILED.value or outcome in {
            "canceled",
            "failed",
        }:
            return item(
                "Возврат не выполнен",
                "Автоматическое выполнение возврата не завершено. Заявка будет проверена администратором.",
                "attention",
                new,
            )

        if new == RefundRequestStatus.PROVIDER_UNKNOWN.value or outcome == "provider_unknown":
            return item(
                "Статус возврата уточняется",
                "Не удалось однозначно подтвердить состояние возврата. Заявка передана на дополнительную проверку.",
                "attention",
                new,
            )

        if new == RefundRequestStatus.COMPLETED.value:
            return item(
                "Деньги возвращены",
                "Возврат выполнен, изменения по тарифу или пакету применены.",
                "completed",
                new,
            )

        if new == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value:
            return item(
                "Заявка проверяется вручную",
                "Для завершения возврата требуется дополнительная проверка администратора.",
                "attention",
                new,
            )

        if new in {
            RefundRequestStatus.CALCULATION_FAILED.value,
            RefundRequestStatus.ENTITLEMENT_FAILED.value,
        }:
            return item(
                "Возврат временно не завершён",
                "Во время обработки возникла техническая проблема. Заявка сохранена и будет проверена.",
                "attention",
                new,
            )

        if new in {
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.ADMIN_EDITED.value,
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
            RefundRequestStatus.CALCULATING.value,
            RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
            RefundRequestStatus.SUBMITTED.value,
        }:
            # Нейтрально, без action-кода.
            titles = {
                RefundRequestStatus.AWAITING_ADMIN_REVIEW.value: (
                    "Заявка на рассмотрении",
                    "Ваша заявка ожидает решения администратора.",
                    "decision",
                ),
                RefundRequestStatus.ADMIN_EDITED.value: (
                    "Расчёт возврата обновлён",
                    "Расчёт по заявке был обновлён.",
                    "calculation",
                ),
                RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value: (
                    "Ожидается подтверждение",
                    "Заявка ожидает финального подтверждения перед выполнением возврата.",
                    "decision",
                ),
                RefundRequestStatus.CALCULATING.value: (
                    "Расчёт возврата обновлён",
                    "Расчёт по заявке был обновлён.",
                    "calculation",
                ),
                RefundRequestStatus.ENTITLEMENT_PROCESSING.value: (
                    "Доступ и остатки обновляются",
                    "Выполняется обновление связанных тарифных прав.",
                    "processing",
                ),
                RefundRequestStatus.SUBMITTED.value: (
                    "Заявка на возврат создана",
                    "Мы получили вашу заявку и начали её рассмотрение.",
                    "request",
                ),
            }
            title, desc, cat = titles[new]
            return item(title, desc, cat, new)  # type: ignore[arg-type]

        # Неизвестное изменение статуса — нейтрально, без action-кода.
        return item(
            "Статус заявки обновлён",
            "По заявке произошло обновление статуса.",
            "attention",
            new,
        )

    # ledger / validation / version_bump / entitlement_apply_started — не в user history
    if action in {
        RefundAuditAction.LEDGER_ENTRY_CREATED.value,
        RefundAuditAction.VALIDATION_REJECTED.value,
        RefundAuditAction.VERSION_BUMP.value,
        RefundAuditAction.ENTITLEMENT_APPLY_STARTED.value,
    }:
        return None

    return None


def build_public_status_history(
    events: list[Any],
    *,
    ctx: PresentationContext,
    limit: int = USER_STATUS_HISTORY_LIMIT,
) -> list[PublicHistoryItem]:
    """
    События уже отсортированы created_at ASC, id ASC.
    Если больше limit — оставляем последние limit (хронология сохраняется).
    """
    if len(events) > limit:
        events = events[-limit:]
    out: list[PublicHistoryItem] = []
    for ev in events:
        item = present_public_event(ev, ctx=ctx)
        if item is not None:
            out.append(item)
    return out


def present_admin_event(event: Any) -> AdminHistoryItem:
    meta = _as_dict(getattr(event, "event_metadata", None))
    action = str(getattr(event, "action", "") or "")
    new = getattr(event, "new_status", None)
    return AdminHistoryItem(
        id=int(getattr(event, "id")),
        refund_request_id=int(getattr(event, "refund_request_id")),
        refund_revision_id=getattr(event, "refund_revision_id", None),
        actor_user_id=getattr(event, "actor_user_id", None),
        actor_type=str(getattr(event, "actor_type", "") or ""),
        action=action,
        title=_admin_title(action, new, meta),
        previous_status=getattr(event, "previous_status", None),
        new_status=new,
        changed_fields=_project_changed_fields(getattr(event, "changed_fields", None)),
        reason=getattr(event, "reason", None),
        details=project_admin_details(meta),
        created_at=getattr(event, "created_at"),
    )


def build_admin_audit_timeline(events: list[Any]) -> list[AdminHistoryItem]:
    return [present_admin_event(ev) for ev in events]


def extract_public_decision_message(events: list[Any], *, current_status: str) -> str | None:
    """Безопасный текст для карточки при needs_information / rejected."""
    if current_status not in {
        RefundRequestStatus.NEEDS_INFORMATION.value,
        RefundRequestStatus.REJECTED.value,
    }:
        return None
    for ev in reversed(events):
        if getattr(ev, "action", None) != RefundAuditAction.STATUS_CHANGED.value:
            continue
        if getattr(ev, "new_status", None) != current_status:
            continue
        return public_reason_for_status(
            status=current_status,
            audit_reason=getattr(ev, "reason", None),
        )
    return None
