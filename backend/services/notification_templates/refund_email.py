"""
Шаблоны email для refund-уведомлений (6.14.10Б).

Только публичные формулировки; без action/metadata/provider payload.
"""
from __future__ import annotations

from typing import Any


def build_refund_email(
    *,
    title: str,
    description: str,
    status_label: str | None,
    request_id: int,
    detail_url: str,
    amount_line: str | None = None,
) -> tuple[str, str]:
    subject = f"BotForg: {title}"
    lines = [
        "BotForg",
        "",
        title,
        "",
        description,
        "",
    ]
    if status_label:
        lines.append(f"Статус: {status_label}")
        lines.append("")
    if amount_line:
        lines.append(amount_line)
        lines.append("")
    lines.extend(
        [
            f"Заявка №{int(request_id)}",
            f"Открыть заявку: {detail_url}",
            "",
            "Это письмо сформировано автоматически. Пожалуйста, не отвечайте на него.",
        ]
    )
    body = "\n".join(lines)
    return subject, body


def status_label_ru(status: str | None) -> str | None:
    if not status:
        return None
    mapping = {
        "submitted": "Отправлена",
        "awaiting_admin_review": "На рассмотрении",
        "needs_information": "Нужна информация",
        "rejected": "Отклонена",
        "approved": "Одобрена",
        "refund_processing": "В обработке",
        "refunded": "Возврат подтверждён",
        "partially_refunded": "Частичный возврат",
        "refund_failed": "Возврат не выполнен",
        "provider_unknown": "Статус уточняется",
        "manual_review_required": "Ручная проверка",
        "completed": "Завершена",
        "canceled": "Отменена",
        "entitlement_processing": "Обновление доступа",
        "entitlement_failed": "Ошибка обновления доступа",
    }
    return mapping.get(status, "Обновлено")


def assert_payload_safe(payload: dict[str, Any]) -> None:
    """Тестовый хелпер: запрещённые ключи не должны быть в payload."""
    forbidden = {
        "event_metadata",
        "action",
        "provider_refund_id",
        "error_code",
        "raw_provider_payload",
        "stack",
        "traceback",
        "idempotency_key",
        "cancellation_details",
    }
    flat = str(payload).lower()
    for key in forbidden:
        assert key not in payload, f"forbidden key in payload: {key}"
        # allow words in normal russian text? keep strict on keys only
    assert "traceback" not in flat
    assert "must_not_leak" not in flat
