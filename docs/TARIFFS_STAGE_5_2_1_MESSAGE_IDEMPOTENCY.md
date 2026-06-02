# BotForg — Этап 5.2.1: idempotency message runtime

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_STAGE_5_2_MESSAGE_RUNTIME_AUDIT.md](./TARIFFS_STAGE_5_2_MESSAGE_RUNTIME_AUDIT.md)

---

## 1. Цель

Подготовить безопасную основу для будущего списания сообщений по тарифу: повторные доставки webhook не должны повторно запускать scenario runtime на поддержанных каналах.

На этом этапе **не** подключались лимиты, enforcement и изменение `UsageCounter.messages_used`.

---

## 2. Почему это нужно до message enforcement

Провайдеры (Telegram, Meta, MAX) могут повторно отправить один и тот же update. Без dedup повторный webhook снова вызовет `process_channel_update` — на этапе 5.3 это привело бы к двойному учёту `messages_used`. Сначала закрываем идемпотентность приёма, затем — списание.

---

## 3. Что было найдено (мини-аудит)

| Вопрос | Ответ |
| ------ | ----- |
| Где `ProcessedUpdate`? | Модель `backend/models/processed_update.py`, уникальность `(bot_id, channel, message_id)`. |
| Где использовалась? | Только в `channel_webhooks.py` для **WhatsApp**, insert **до** runtime; при дубликате — `200 {"ok": true}` без поля `duplicate`. |
| Dedup для Telegram/MAX через `/webhooks/` | **Не было** (до 5.2.1). |
| Ключ WhatsApp | `normalized.raw["message_id"]` из Meta `messages[].id`. |
| Повторный webhook (WhatsApp) | `IntegrityError` → rollback → `{"ok": true}`, runtime не вызывался. |
| Единый runtime | `process_channel_update()` в `channel_runtime.py` для всех каналов `/webhooks/{channel}/{bot_id}`. |
| Legacy | `POST /webhook/{bot_id}` (`webhook.py`, `BotInstance`) — отдельный стек, **не изменялся**. |

**Unique constraint:** миграция `processed_updates_009`, constraint `uq_processed_updates_bot_channel_message` на `(bot_id, channel, message_id)` — отдельная миграция для atomic insert **не требуется**.

---

## 4. Что добавлено

| Файл | Назначение |
| ---- | ---------- |
| `backend/services/message_idempotency.py` | `build_processed_update_key`, `try_register_processed_update`, compatibility helpers |
| `backend/routers/channel_webhooks.py` | `_dispatch_channel_update()` — atomic dedup + runtime для WhatsApp, MAX, Telegram |
| `backend/tests/test_message_idempotency.py` | Unit + интеграционные тесты |
| `docs/TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md` | Этот документ |

---

## 5. Какие каналы поддержаны

| Канал | Dedup через `/webhooks/` | Стабильный id |
| ----- | ------------------------ | ------------- |
| **telegram** | Да | `update_id` в корне payload |
| **whatsapp** | Да | `messages[].id` (Meta Cloud) |
| **max** | Да | `message_id`, `id`, `event_id` / `eventId`, или `message.id` |
| События без id (напр. WhatsApp status-only) | Нет | Ключ `None` — обработка без dedup |
| Legacy `/webhook/{bot_id}` | Нет | Вне scope 5.2.1 |

---

## 6. Как строится idempotency key

Функция `build_processed_update_key(channel, bot_id, payload)`:

- **telegram:** `str(payload["update_id"])`
- **whatsapp:** первый `messages[].id` (плоский payload или `entry/changes/value/messages`)
- **max:** `message_id` → `id` → `event_id` / `eventId` → `message.message_id` / `message.id`
- **нет стабильного id:** `None` — **не** хешируем весь payload

`bot_id` и `channel` задают scope в таблице `processed_updates`, не в строке ключа.

---

## Atomic idempotency

В Этапе 5.2.1 idempotency строится через **атомарную регистрацию** update в БД.

Router больше не использует схему «проверить → обработать → записать» как основной механизм, потому что она допускала гонку двух параллельных webhook.

**Источник истины — `try_register_processed_update(...)`.**

Поток:

1. Построить ключ из сырого `body`.
2. Если ключ есть → `try_register_processed_update()` (**INSERT** + unique constraint).
   - `False` → **`200 {"ok": true, "duplicate": true}`**, runtime **не** запускается.
   - `True` → зарегистрировано, продолжаем runtime.
3. Если ключа нет → runtime без записи в `ProcessedUpdate`.

**Trade-off (регистрация до runtime):**

- **Плюс:** нет двойной обработки и будущего двойного списания при provider retry; параллельные первые доставки закрыты unique constraint.
- **Минус:** если `process_channel_update` упал **после** регистрации, provider retry не запустит повторную обработку.
- **Будущий production-вариант:** статусы `processing` / `processed` / `failed` или outbox/job queue (отдельная задача, не 5.2.1).

Если update уже зарегистрирован, webhook получает безопасный ответ `{"ok": true, "duplicate": true}`, runtime не запускается.

**Сообщения и UsageCounter на этом этапе не изменяются.**

Compatibility helpers `is_update_already_processed` / `mark_update_processed` остаются для тестов; router их **не** использует.

---

## 7. Что происходит с duplicate webhook

1. Построить idempotency key.
2. `try_register_processed_update` → `False` (duplicate или параллельный INSERT проиграл гонку).
3. Ответ **`200 {"ok": true, "duplicate": true}`** — без runtime и без аналитики.

WhatsApp: явное `"duplicate": true` (раньше только `{"ok": true}`).

---

## Payload без стабильного id

Если payload не содержит стабильного provider update/message id, idempotency key **не строится** (`None`).

### Policy: user input without stable id (Этап 5.3.1)

Если webhook payload содержит реальный пользовательский ввод, но не содержит стабильный provider id для idempotency, событие **не обрабатывается** runtime и **не списывается** в лимит.

Ответ webhook остаётся HTTP 200 с телом:

`{"ok": true, "blocked_by_idempotency": true, "reason": "missing_stable_message_id"}`

Причина: нельзя безопасно тарифицировать событие, которое невозможно дедуплицировать. Иначе возможны бесплатная обработка или двойное списание при retry.

Системные события без user input не тарифицируются; runtime для них может выполняться.

### Служебные события без id

- **WhatsApp status/contact** webhooks без `messages[].id` — delivery/read receipts, не user input.
- Прочие служебные payload без user input — dedup и billing не применяются.

### WhatsApp non-text inbound (Этап 5.3.2)

Non-text inbound с stable `messages[].id` регистрируется в dedup, но **не** передаётся в runtime и **не** списывается — ответ `ignored` / `unsupported_message_type`.

### MAX stable id (Этап 5.3.2)

Supported paths: `message_id`, `id`, `event_id`, `eventId`, `message.id`. User input без supported id блокируется до runtime.

**Production policy:** неизвестные formats не запускают billable runtime до явного контракта. См. [WEBHOOK_PAYLOAD_CONTRACT.md](./WEBHOOK_PAYLOAD_CONTRACT.md).

---

## 8. Что пока НЕ делается

- Сообщения **не списываются**; лимит `monthly_messages` **не проверяется**.
- **`UsageCounter.messages_used` не изменяется**.
- Нет warnings 70/85/95/100 и блокировки по тарифу.
- **Legacy** `POST /webhook/{bot_id}` **не менялся**.
- **Frontend**, **marketplace**, **платежи** не трогались.
- **`POST /messages/`** не менялся.

---

## 9. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_message_idempotency.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests/test_webhook_payload_contract.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

Покрытие: build key, `try_register` (первый/повторный, IntegrityError, изоляция bot_id/channel), duplicate webhook, payload без ключа.

---

## 10. Остаточные риски

- **Runtime failure после регистрации** — retry провайдера не переобработает (см. trade-off выше).
- **Payload без id с user input** — блокируется policy 5.3.1 (`missing_stable_message_id`).
- **Unsupported WhatsApp non-text** — ignored без runtime (5.3.2); расширение типов — только через контракт + тесты.
- **MAX unknown formats** — user input без supported stable id блокируется; новые paths — только через контракт + тесты.
- **Legacy** `/webhook/{bot_id}` — дубликаты Telegram update_id не дедупятся в `ProcessedUpdate`.

---

## 11. Следующий этап

**Этап 5.3** — message limit enforcement после dedup: проверка лимита для событий **с** idempotency key, атомарное увеличение `UsageCounter.messages_used`, ответ `200` при блокировке по политике из аудита 5.2.
