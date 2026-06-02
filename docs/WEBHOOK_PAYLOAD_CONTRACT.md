# BotForg — контракт webhook payload для тарифицируемых сообщений

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md](./TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md), [TARIFFS_STAGE_5_3_MESSAGE_ENFORCEMENT.md](./TARIFFS_STAGE_5_3_MESSAGE_ENFORCEMENT.md)

**Runtime:** только `POST /webhooks/{channel}/{bot_id}`. Legacy `POST /webhook/{bot_id}` вне scope.

---

## 1. Цель

Зафиксировать stable provider id и billable user input для idempotency, тарификации и runtime — без «проверить потом» и без бесплатной обработки неподдержанных форматов.

Код: `build_processed_update_key()`, `should_block_user_input_without_stable_id()`, `should_ignore_unsupported_inbound()`, `_has_real_user_input()`.

---

## 2. Общее правило

Billable user input обрабатывается **только** при stable provider id и поддерживаемом типе user input.

| Ситуация | HTTP | Response |
| -------- | ---- | -------- |
| User input без stable id | 200 | `blocked_by_idempotency` / `missing_stable_message_id` |
| Duplicate | 200 | `duplicate: true` |
| WhatsApp non-text (unsupported) | 200 | `ignored: true` / `unsupported_message_type` |
| Billable + stable id + лимит OK | 200 | `ok: true` + runtime |
| Лимит исчерпан | 200 | `blocked_by_limit` |

**Production policy:** неизвестные payload formats **не** запускают billable runtime и **не** списываются, пока не добавлен явный контракт и тесты.

---

## 3. Telegram

### Stable id

| Поле | Источник |
| ---- | -------- |
| `update_id` | корень Telegram Update (**единственный** supported path) |

### Billable user input

- `message.text` (непустой)
- `callback_query.data` → `normalized.text`

### Не billable

Update без текста/callback (служебные update без user action в нормализации).

---

## 4. WhatsApp (Meta Cloud)

### Stable id

| Поле | Путь |
| ---- | ---- |
| `messages[].id` | `payload.messages[0].id` или `entry/changes/value/messages[0].id` |

### Billable user input (supported)

- **Только** текстовый inbound: `messages[].type == "text"` и `messages[].text.body` → `normalized.text`.

### Non-text inbound (ignored)

Типы `image`, `document`, `audio`, `video`, `sticker`, `location`, `contacts`, `contact`:

- stable id **может** быть;
- `_has_real_user_input` = **false** (нет текста в нормализации);
- **не** тарифицируются;
- **не** запускают `process_channel_update` (ignore policy);
- HTTP 200:

```json
{"ok": true, "ignored": true, "reason": "unsupported_message_type"}
```

Status/contact webhook без `messages[]` — см. §6.

---

## 5. MAX

### Stable id (только эти paths)

1. `message_id` (корень)
2. `id` (корень)
3. `event_id` (корень)
4. `eventId` (корень)
5. `message.message_id` / `message.id`

До получения новых production payload MAX **не расширяем** список paths.

### Billable user input

Текст/callback из `MaxAdapter` → `_has_real_user_input`.

### MAX user input без supported stable id

- runtime **не** запускается;
- UsageCounter **не** списывается;
- HTTP 200: `blocked_by_idempotency` / `missing_stable_message_id`.

### MAX без user input

Не тарифицируется; runtime **может** выполниться (например `bot_started` без текста).

---

## 6. Системные события

Без real user input:

- не тарифицируются;
- WhatsApp **status** (`value.statuses`) — runtime может выполниться, не billable;
- WhatsApp **non-text message** — **ignored**, runtime не вызывается (§4).

---

## 7. Payload без stable id + user input

```json
{"ok": true, "blocked_by_idempotency": true, "reason": "missing_stable_message_id"}
```

---

## Unsupported / unknown inbound events

BotForg не тарифицирует и не запускает billable runtime для входящих событий, формат которых не позволяет безопасно определить stable provider id или поддерживаемый тип user input.

### WhatsApp non-text inbound

На текущем этапе тарифицируемым пользовательским вводом считается только **текстовый** inbound (`type: text`), который нормализуется runtime.

Non-text inbound types (`image`, `document`, `audio`, `video`, `sticker`, `location`, `contacts`) **не** обрабатываются как бесплатный billable runtime. Они игнорируются с HTTP 200 без списания.

### MAX unknown payload

До явного добавления контракта MAX поддерживаются **только** stable id paths из §5.

MAX user input без одного из этих stable id **блокируется** до runtime.

---

## 8. Что нельзя делать

- Хешировать весь payload как id.
- Списывать без stable id.
- Запускать billable runtime без stable id и без контракта.
- HTTP 4xx/5xx на блокировку/ignore (retry storm).

---

## 9. Production policy (расширение контракта)

Новый формат payload (канал, тип сообщения, stable id path) допускается **только** после:

1. явного описания в этом документе;
2. тестов в `test_webhook_payload_contract.py`;
3. минимальной поддержки в `message_idempotency.py` / enforcement helpers.

До этого неизвестные formats с user input блокируются; unsupported WhatsApp non-text — ignored.

---

## 10. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_webhook_payload_contract.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests/test_message_idempotency.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_message_enforcement.py -q
```
