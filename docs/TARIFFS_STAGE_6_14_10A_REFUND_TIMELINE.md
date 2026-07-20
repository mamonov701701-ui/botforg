# Этап 6.14.10A — безопасная история возврата (user + admin)

## Назначение

Сделать понятную хронологию заявки на возврат:

- пользователь видит безопасную `status_history` на карточке заявки;
- администратор видит расширенную «Историю решений» с русскими названиями и whitelist details;
- внутренние provider payload / stack / секреты не попадают пользователю;
- `refund_audit_events` остаётся **единственным** источником истины.

Email, outbox, in-app inbox и ответ пользователя на `needs_information` — **вне scope** (6.14.10Б / отдельный этап).

## Источник истины

Таблица `refund_audit_events` (`RefundAuditEvent`).

Новые таблицы журнала **не создаются**. Presentation-слой только преобразует уже записанные события.

## Presentation

Сервис: `backend/services/refund_audit_presentation.py`

| Режим | Назначение |
|-------|------------|
| `present_public_event` / `build_public_status_history` | публичные title/description/category |
| `present_admin_event` / whitelist details | admin title + ограниченный `details` |
| `extract_public_decision_message` | безопасный текст для needs_information / rejected |

Каталог **не** отправляет уведомления и не пишет в БД — готов к переиспользованию в 6.14.10Б.

## User API

`GET /me/refund-requests/{id}` возвращает дополнительно:

- `status_history[]`: `id`, `occurred_at`, `title`, `description`, `category`, `status?`
- `public_decision_message` — только для `needs_information` / `rejected`, если reason пользовательский

`GET /me/refund-requests` (список) — `status_history: []` (timeline не грузится для масштабирования).

Сортировка: `created_at ASC, id ASC`.  
Лимит: не более **200** последних событий заявки (`USER_STATUS_HISTORY_LIMIT`).

## Санитизация (user)

Не отдаются: action-коды, actor, `changed_fields`, полный `event_metadata`, provider ids, error_code, payload, stack.

Публичный reason только для needs_information/rejected и только если текст выглядит пользовательским (кириллица / без tech-маркеров).

Неизвестные actions пропускаются (без нейтрального текста с кодом).

## Admin API

`audit_timeline` тот же источник. Добавлено:

- `title` (русское название);
- `details` — whitelist (`outcome`, masked `provider_refund_id`, `error_code`, entitlement/units/revision/amounts, retry/recovery markers);
- `event_metadata` = тот же whitelist (обратная совместимость).

Запрещено: raw webhook payload, stack, secrets, credentials, полный dump.

## Индекс

Добавлена миграция `refund_audit_timeline_030`:

`ix_refund_audit_events_request_created_id` на `(refund_request_id, created_at, id)`.

Ранее были отдельные индексы по `refund_request_id` и `created_at`; составной индекс нужен для ORDER BY timeline одной заявки.

## UI

- User: блок «История заявки» на `RefundRequestDetailPage`.
- Admin: «История решений» с title, переходом статуса, reason, разрешёнными details; tech action как вторичная подпись.

## Что не добавлено (перенос)

| Тема | Куда |
|------|------|
| Email / SMTP / outbox / idempotent notify | **6.14.10Б** |
| In-app inbox | отдельно / 6.14.10Б+ |
| Отдельные audit actions для webhook received / retry / recovery | **6.14.10Б** (если понадобится явнее) |
| Пользовательский ответ на `needs_information` | отдельный этап |
| FIFO / webhook journal в UI | не в 6.14.10A |

Duplicate webhook уже идемпотентен на уровне `payment_webhook_events` и не пишет повторный audit при `already_processed` — публичная история не дублируется.

## Масштабирование

- История только в рамках одной заявки.
- Список заявок без timeline.
- Лимит 200 на detail.
- Без JSON-поиска по metadata для user history.
- Без N+1 по revisions внутри цикла событий (сумма берётся из уже загруженной ревизии заявки).
