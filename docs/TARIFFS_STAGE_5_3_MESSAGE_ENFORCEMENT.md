# BotForg — Этап 5.3: message limit enforcement

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_STAGE_5_2_MESSAGE_RUNTIME_AUDIT.md](./TARIFFS_STAGE_5_2_MESSAGE_RUNTIME_AUDIT.md), [TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md](./TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md)

---

## 1. Цель

Подключить проверку и атомарное списание месячного лимита сообщений для нового runtime `POST /webhooks/{channel}/{bot_id}` без изменения legacy webhook, `POST /messages/`, frontend и marketplace.

---

## 2. Где подключено

| Компонент | Файл |
| --------- | ---- |
| Сервис enforcement | `backend/services/tariff_message_enforcement.py` |
| Точка подключения | `backend/routers/channel_webhooks.py` → `_dispatch_channel_update()` |
| Лимиты/период | `get_user_tariff_limits()` из `tariff_limits.py` |
| User input | `_has_real_user_input()` из `channel_runtime.py` |
| Idempotency | `try_register_processed_update()` из `message_idempotency.py` |

**Не затронуто:** `POST /webhook/{bot_id}`, `POST /messages/`, frontend, marketplace, payments.

---

## 3. Что считается сообщением (1 billable unit)

Списывается **1 unit**, если одновременно:

1. Канал идёт через `/webhooks/{channel}/{bot_id}`.
2. Есть **стабильный idempotency key** (`build_processed_update_key` ≠ `None`).
3. Webhook **не duplicate** (успешный `try_register_processed_update`).
4. Есть **реальный user input** (`_has_real_user_input(normalized)`): текст или callback/button.

Лимит **общий** на всех активных ботов пользователя (`bot.owner_id`).

---

## 4. Что не списывается

- Duplicate webhook (`{"ok": true, "duplicate": true}`).
- Payload **без стабильного provider id** (idempotency key = `None`).
- Status/system update **без user input** (например WhatsApp delivery receipt без `messages[].id`).
- Legacy `POST /webhook/{bot_id}`.
- `POST /messages/` (отдельный `UserQuota` stack).
- Unlimited/corporate (`messages_limit is None`) — **не блокируется**, счётчик на этом этапе **не увеличивается**.

---

## 5. Порядок обработки webhook

```text
POST /webhooks/{channel}/{bot_id}
  → normalize payload
  → build idempotency key
  → if key: try_register_processed_update
       → duplicate → 200 {"ok": true, "duplicate": true}
  → if billable (key + user input):
       → check_and_consume_message_unit(owner_id)
       → blocked → 200 {"ok": true, "blocked_by_limit": true, "reason": "message_limit_exceeded"}
  → process_channel_update(...)  [on failure → refund if consumed]
  → 200 {"ok": true}
```

**Idempotency до списания** — duplicate не списывает.  
**Списание до runtime** — при 100% сценарий не запускается.

---

## Atomic idempotency

Idempotency (5.2.1) по-прежнему через `try_register_processed_update` **до** enforcement.

---

## 6. Atomic UsageCounter increment

`check_and_consume_message_unit()`:

1. Период из `get_user_tariff_limits` (`period_start`, `period_end`).
2. `_get_or_create_usage_counter()` — строка `UsageCounter` для user/period.
3. SQLAlchemy `update(UsageCounter).where(id=..., messages_used < limit).values(messages_used=messages_used+1)`.
4. `rowcount == 1` → allowed; иначе → blocked.

Работает на SQLite (dev) и PostgreSQL (prod). Небезопасный `counter.messages_used += 1` без условия **не** используется.

---

## 7. Что происходит при лимите 100%

- `process_channel_update` **не вызывается**.
- Ответ **`200 {"ok": true, "blocked_by_limit": true, "reason": "message_limit_exceeded"}`** — provider не получает 4xx/5xx (нет retry storm).
- Бот **не удаляется**, настройки **не меняются**.
- Счётчик **не** увеличивается сверх лимита.
- TODO: уведомления владельца 70/85/95/100 — отдельный этап.

---

## Compensation on runtime failure

На этапе 5.3 списание сообщения происходит **до** запуска runtime, чтобы при исчерпанном лимите сценарий не запускался.

Если runtime падает после успешного списания, выполняется **компенсация**: `refund_message_unit()` уменьшает `UsageCounter.messages_used` на 1 через SQLAlchemy `update(...)` с условием `messages_used > 0`.

Refund вызывается только если `MessageLimitResult.consumed is True` (`allowed + billable + реальный increment`).

Это закрывает риск потери лимита пользователем при failed runtime.

**Ограничение:** idempotency update уже зарегистрирован до runtime, поэтому provider retry **не переобработает** событие. Для полноценного retry-safe production flow нужен отдельный будущий этап: `processing/processed/failed` или outbox/job queue.

---

## 8. Trade-offs

| Решение | Плюс | Минус |
| ------- | ---- | ----- |
| Регистрация idempotency **до** runtime (5.2.1) | Нет двойной обработки/retry storm | Runtime failure после register — retry не переобработает |
| Списание **до** runtime (5.3) | Нет двойного списания при retry | Без compensation терялся бы лимит при падении runtime |
| Compensation при runtime failure | Лимит возвращается пользователю | Retry всё равно duplicate (idempotency) |
| Блокировка → HTTP 200 | Provider не шлёт бесконечные retry | Клиент не видит 403 в webhook |

**Production позже:** outbox/job queue, статусы `processing/processed/failed`, полноценный retry после failure.

---

## Payload без стабильного id

Если payload не содержит стабильного provider update/message id, idempotency key **не строится**, runtime может выполниться, **списание не происходит**.

**На Этапе 5.3** такие события **нельзя** включать в лимит сообщений без безопасного ключа или отдельной политики.

### Не deduped / не billing-relevant сейчас

- WhatsApp status/contact без `messages[].id`.
- Служебные payload без user input.

### Требует решения перед расширением billing

- Inbound user input без stable id.
- MAX user input без `message_id`/`id` в webhook.

---

## 9. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_message_enforcement.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests/test_message_idempotency.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

---

## 10. Что НЕ трогали

- Frontend, marketplace, payments.
- Legacy `POST /webhook/{bot_id}`.
- `POST /messages/` и `UserQuota`.

---

## 11. Следующий этап

- Уведомления 70/85/95/100 или API summary для frontend.
- Либо аудит legacy `/webhook/{bot_id}` для единой тарификации, если потребуется.
