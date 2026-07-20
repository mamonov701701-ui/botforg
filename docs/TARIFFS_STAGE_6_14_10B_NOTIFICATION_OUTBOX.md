# Этап 6.14.10Б — scalable notification outbox + email для возвратов

## Назначение

Доставлять пользователю email о ключевых событиях возврата **без** отправки из refund-транзакции и без второго журнала.

`refund_audit_events` — источник истины истории.  
`notification_outbox` — очередь доставки.

## Архитектура

```
refund service ──writes──► RefundAuditEvent
                 │
                 └──after_refund_audit_written──► NotificationOutbox (pending)
                                                       │
                         worker claim (SKIP LOCKED) ───┤
                                                       ▼
                                              EmailTransport (SMTP / log)
```

| Компонент | Файл |
|-----------|------|
| Model | `backend/models/notification.py` |
| Producer | `backend/services/refund_notification_producer.py` |
| Worker | `backend/services/notification_outbox_worker.py` |
| Transport | `backend/services/email_transport.py` |
| Templates | `backend/services/notification_templates/refund_email.py` |
| CLI | `backend/scripts/run_notification_outbox_worker.py` |
| Migration | `notification_outbox_031` |

## Идемпотентность

`idempotency_key` UNIQUE:

```text
refund:{refund_id}:{audit_event_id}:email:{user_id}:{template_version}
```

Повторный webhook / повторный notifier → та же запись, без дубля.

Вставка: проверка + `begin_nested()` / обработка `IntegrityError`.

## Transaction boundary

Producer вызывается из `_write_audit` / submit **после** `db.add(audit)` в **той же** Session.

- `commit=True` на refund API → audit + outbox коммитятся вместе.
- `rollback` → outbox не остаётся.
- Email **не** отправляется до commit (только worker после commit).

Ошибка enqueue логируется и **не** откатывает refund (кроме nested Integrity).

## Worker locking

1. `recover_stale_processing` — `processing` + `locked_at` старше lease → `retry`.
2. Claim:
   - **PostgreSQL:** `SELECT id … FOR UPDATE SKIP LOCKED`
   - **SQLite/dev:** select кандидатов + `UPDATE … WHERE status IN (pending,retry)`
3. Статус → `processing`, `locked_by` / `locked_at`.
4. Send вне долгого lock на других строках (claim уже сделан).
5. Успех → `sent`; временная ошибка → `retry` + backoff; постоянная / max attempts → `failed_permanent`.

Несколько worker-процессов безопасны за счёт SKIP LOCKED / conditional UPDATE.

## Retry / backoff

`available_at = now + base * 2^(attempts-1)`, cap 6h.

Временные: timeout, connection, SMTP 4xx (кроме явных permanent).  
Постоянные: invalid email, recipient refused, malformed payload, SMTP auth fail, 5xx permanent.

## Запуск worker

```bash
backend\venv\Scripts\python.exe -m backend.scripts.run_notification_outbox_worker --once
backend\venv\Scripts\python.exe -m backend.scripts.run_notification_outbox_worker --loop --interval 5
```

**Не** стартует из uvicorn (избегаем N workers на каждый web-процесс).

## Конфигурация (env)

| Variable | Default |
|----------|---------|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | empty → log-only transport |
| `SMTP_PORT` | 587 |
| `SMTP_USE_TLS` | true |
| `SMTP_TIMEOUT_SECONDS` | 15 |
| `EMAIL_FROM` | BotForg <…> |
| `NOTIFICATION_OUTBOX_BATCH_SIZE` | 20 |
| `NOTIFICATION_OUTBOX_MAX_ATTEMPTS` | 8 |
| `NOTIFICATION_OUTBOX_BASE_RETRY_SECONDS` | 30 |
| `NOTIFICATION_OUTBOX_LEASE_SECONDS` | 300 |
| `NOTIFICATION_TEMPLATE_VERSION` | v1 |
| `FRONTEND_URL` | ссылка в письме |

В `TESTING=true` / без SMTP_HOST — `LoggingEmailTransport` (реальных писем нет).

## Безопасность

Payload outbox: title, description, category, status, request_id, detail_url, optional amount_line.  
Нет: action codes, event_metadata, provider payload, stack, secrets.  
Логи worker: id/type/attempt/result/duration — **без** body и SMTP password.

## Какие события создают email

created, needs_information, rejected, approved, refund_processing (+ pending outcome), refunded/partial, refund_failed, provider_unknown, manual_review, entitlement applied/already/not_required/manual, completed.

Не создают: ledger-only, validation_rejected, duplicate webhook без audit, revision_created alone, cancel user (пока вне списка).

## Что дальше

- in_app / telegram каналы;
- notification inbox UI;
- ответ пользователя на needs_information;
- dedicated retry/recovery audit actions (если понадобится явнее);
- метрики Prometheus (сейчас только structured logs).

## Масштабирование

- batch limit;
- индексы `status+available_at`, `status+locked_at`, aggregate, recipient;
- без глобального full-table scan без фильтра status/available_at;
- горизонтальные workers через SKIP LOCKED.
