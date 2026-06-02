# BotForg — Этап 5.2: аудит message/webhook runtime

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md), [TARIFFS_STAGE_4_LIMITS_SERVICE.md](./TARIFFS_STAGE_4_LIMITS_SERVICE.md), [TARIFFS_STAGE_5_1_BOT_ENFORCEMENT.md](./TARIFFS_STAGE_5_1_BOT_ENFORCEMENT.md)

**Статус этапа:** только аудит, **код не менялся**, enforcement сообщений не подключён.

---

## 1. Цель

Найти безопасную точку подключения лимита **сообщений** (`monthly_messages` + пакеты/подарки) в production runtime, не ломая:

- webhook-провайдеров (Telegram / WhatsApp / MAX);
- `process_channel_update` и сценарный граф;
- legacy `UserQuota` / `POST /messages/`;
- идемпотентность повторных доставок.

---

## 2. Где сейчас принимаются webhook-сообщения

### 2.1. Основной путь (prod-каналы, модель `Bot`)

| Компонент | Путь / файл |
| --------- | ----------- |
| HTTP endpoint | `POST /webhooks/{channel}/{bot_id}` |
| Роутер | `backend/routers/channel_webhooks.py` → `channel_webhook()` |
| Верификация | WhatsApp: подпись Meta + `ProcessedUpdate`; MAX: `X-Max-Bot-Api-Secret` |
| Нормализация | `backend/channels/registry.get_adapter(channel)` → `normalize_incoming()` |
| Runtime | `backend/services/channel_runtime.py` → `process_channel_update()` |
| Исходящие | `ChannelAdapter.send_text()` / `send_media()` из `_send_node()` |

Регистрация в `backend/main.py`: `channel_webhooks_router`.

**Папок `backend/runtime/` и `backend/integrations/` в репозитории нет.**

### 2.2. Legacy Telegram (модель `BotInstance` + `Template`)

| Компонент | Путь / файл |
| --------- | ----------- |
| HTTP endpoint | `POST /webhook/{bot_id}` |
| Роутер | `backend/routers/webhook.py` → `telegram_webhook()` |
| Модель | `BotInstance` (не `Bot`), сценарий из `Template.content` |
| Runtime | Встроенная логика в `webhook.py` (`send_node_message`, `BotUserState`) |

Отдельный стек: **не вызывает** `process_channel_update`, **не использует** `UserQuota` / `UsageCounter`.

### 2.3. Dev-only симуляция

| Компонент | Путь |
| --------- | ---- |
| Endpoint | `POST /dev/bots/{bot_id}/simulate-message` |
| Файл | `backend/routers/dev_simulate.py` |
| Runtime | Тот же `process_channel_update()` с mock-адаптером |

Только `ENVIRONMENT=development`.

### 2.4. Связь с `POST /bots/connect`

`backend/routers/bot.py` подключает Telegram через токен и выставляет `webhook_url` вида `{base}/{bot_id}` — это legacy-маршрут `/webhook/{bot_id}`, **не** `/webhooks/telegram/{bot_id}`.

Новые каналы (MAX, WhatsApp) идут через `BotChannelConnection` и `/webhooks/...`.

---

## 3. Как сейчас идёт обработка сообщения (prod-path)

Упрощённая цепочка для `channel_webhooks` → `process_channel_update`:

```text
POST /webhooks/{channel}/{bot_id}
  → проверка Bot.is_active, BotChannelConnection.is_enabled
  → (WhatsApp) validate_webhook, normalize, ProcessedUpdate dedup → 200 {ok:true} если дубликат
  → (MAX) secret header
  → adapter.normalize_incoming(body)
  → process_channel_update(db, bot, conn, adapter, normalized)
       → ensure_ctor_bot_id / get_or_create_bot_user (CRM)
       → если _has_real_user_input: last_message_at, mark_crm_overview_dirty
       → _find_scenario_for_bot (главный Scenario)
       → обход графа: input / button / action / condition
       → _send_node → adapter.send_text (исходящее в канал)
  → (опционально) analytics.track_event minimal_storage
  → return {"ok": true}
```

**`backend/services/scenario_runtime.py` (`ScenarioRuntime`)** в этом пути **не используется** — отдельный движок для других сценариев (тесты, `go_to_scenario`).

---

## 4. Где сейчас UserQuota / BillingRecord

| Место | Использование |
| ----- | ------------- |
| `backend/routers/message.py` | `POST /messages/` — создание записи `Message` + `BillingRecord`, инкремент `UserQuota.used_messages` |
| `backend/routers/billing.py` | `GET /billing/summary`, `PATCH /billing/quota`, ручное создание `BillingRecord` |
| `backend/models/billing.py` | `UserQuota` (`monthly_limit`, `used_messages`), `BillingRecord` |

**Webhook / `channel_runtime` / `webhook.py` (Telegram legacy) UserQuota не трогают.**

---

## 5. Где сейчас списываются сообщения

| Путь | Списание |
| ---- | -------- |
| `POST /messages/` | `user_quota.used_messages += 1` всегда после создания `Message` |
| `channel_webhooks` + `process_channel_update` | **нет** |
| `webhook.py` (BotInstance) | **нет** |
| `UsageCounter.messages_used` | **не увеличивается** в runtime (только читается в `get_user_tariff_limits`, если есть строка за период) |

**Вывод:** реальные диалоги в мессенджерах **не списывают** ни `UserQuota`, ни `UsageCounter` today.

---

## 6. Что происходит при превышении лимита (legacy)

Только в `backend/routers/message.py` (`POST /messages/`):

1. Если `used_messages >= monthly_limit` → сообщение всё равно **создаётся**.
2. Выставляется `is_paid=True`, `price=1.00` (1 ₽), `BillingRecord` с `is_paid=True`.
3. **Нет** HTTP 403, **нет** остановки runtime, **нет** уведомления владельца из backend.

Тест: `backend/tests/test_billing.py` → `test_correct_pricing_calculation`.

**Stop при превышении лимита в webhook сегодня отсутствует.**

---

## 7. Idempotency и защита от двойного списания

### 7.1. `ProcessedUpdate`

- Модель: `backend/models/processed_update.py`
- Unique: `(bot_id, channel, message_id)`
- **Используется только для WhatsApp** в `channel_webhooks.py`:
  - insert до `process_channel_update`;
  - при `IntegrityError` → `rollback`, return `{"ok": True}` **без** повторной обработки.

### 7.2. MAX / Telegram (через `/webhooks/...`)

- **Нет** записи в `ProcessedUpdate` в текущем коде.
- Повторный webhook от провайдера может **повторно** пройти `process_channel_update` (двойные ответы, потенциально двойное списание после внедрения лимита).

### 7.3. Legacy `/webhook/{bot_id}`

- Собственной dedup-таблицы нет.

### 7.4. Транзакции

- `process_channel_update` делает несколько `db.commit()` по ходу (переменные, CRM, отправка).
- Единой транзакции «всё или ничего» нет.

**Рекомендация для 5.3:** расширить dedup на все каналы **до** enforcement и increment usage; при дубликате — `200 OK`, без списания.

---

## 8. Где безопасно подключить tariff message enforcement

### 8.1. Рекомендуемая точка (единая для всех каналов)

**После** проверок бота/канала и **после** idempotency (когда dedup будет для всех каналов), **до** `process_channel_update()`:

- Файл: `backend/routers/channel_webhooks.py` (тонкая обёртка), **или**
- Начало `process_channel_update()` в `channel_runtime.py` (бизнес-центрично).

Предпочтение: **начало `process_channel_update()`** + вспомогательный модуль `tariff_message_enforcement.py` (по аналогии с 5.1), чтобы dev_simulate и будущие вызовы шли в одну точку.

### 8.2. Алгоритм (черновик для 5.3)

1. `owner_id = bot.owner_id`
2. `summary = get_user_tariff_limits(db, owner_id)`
3. Если `messages_limit is None` → unlimited, продолжить.
4. Если нет реального user input (`not _has_real_user_input`) → **не** списывать (системные/пустые update).
5. Если `messages_remaining <= 0` → **не** вызывать сценарий / **не** слать исходящие:
   - зафиксировать blocked event (аналитика / отдельная таблица — опционально в 5.3);
   - return из `process_channel_update` без ошибки наружу.
6. Webhook handler по-прежнему возвращает **`{"ok": true}`** (важно для Telegram/WhatsApp/MAX retries).
7. После успешной обработки (или после принятия inbound) — **атомарно** увеличить `UsageCounter.messages_used` за период `summary.period_*`.

### 8.3. Где увеличивать usage

| Вариант | Плюсы | Минусы |
| ------- | ----- | ------ |
| A. Перед runtime, при принятии inbound | Просто, совпадает с «лимит на вход» | Исходящие без ответа при блоке |
| B. После успешного `_send_node` | Платим за факт ответа | Сложнее, несколько исходящих за один inbound |
| C. Один increment на inbound user turn | Соответствует концепции «обработка сообщения» | Нужно чётко определить turn |

**Рекомендация:** вариант **C** — один billable unit на inbound с `_has_real_user_input`, после прохождения лимита и dedup, **до** тяжёлой работы графа; исходящие в рамках того же turn не удваивать на первом этапе.

### 8.4. Ответ webhook provider

- **Не** возвращать 4xx/5xx при лимите (риск бесконечных retry).
- **Не** возвращать 429 без согласования с Meta/Telegram/MAX.
- Возвращать **200** + `{"ok": true}`; обработка внутри — no-op.

### 8.5. Legacy `webhook.py` (BotInstance)

**Не включать в первый PR 5.3** без отдельного решения: другая модель данных, нет `bot.owner_id` в том же виде, нет `BotChannelConnection`.

### 8.6. `POST /messages/`

Оставить legacy `UserQuota` до отдельного этапа миграции; **не смешивать** increment с `UsageCounter` в одном запросе без dual-write плана.

---

## 9. Что считать сообщением

| Тип | Считать в лимит (рекомендация 5.3) | Комментарий |
| --- | ----------------------------------- | ----------- |
| Входящее сообщение пользователя (text/callback) | **Да**, 1 unit при старте runtime | `_has_real_user_input(normalized)` |
| Исходящий ответ бота (`_send_node`) | **Нет** (фаза 1) | Уже покрыто inbound turn |
| Системное событие без user input | **Нет** | Пустой update, служебные payload |
| Retry duplicate webhook | **Нет** | После dedup / idempotent increment |
| Dev simulate | **Опционально** | Только dev; можно отключить enforcement |
| `POST /messages/` (REST) | **Пока** legacy `UserQuota` | Не трогать в 5.3 |
| Тестовое / pre_checkout / payment в legacy webhook | **Нет** | Отдельные ветки в `webhook.py` |

---

## 10. Как использовать UsageCounter.messages_used

### 10.1. Текущее состояние

- `get_user_tariff_limits()` читает `UsageCounter.messages_used` за пересекающийся период (если строка есть), иначе `0`.
- Runtime **не пишет** в `UsageCounter`.
- `UserQuota.used_messages` — параллельный legacy-счётчик только для REST API.

### 10.2. Рекомендация для 5.3+

| Вопрос | Решение |
| ------ | ------- |
| Источник истины для tariff summary | **`UsageCounter.messages_used`** после подключения increment в runtime |
| Миграция с `UserQuota` | Отдельный этап: dual-write или read-fallback, **не** в первом enforcement PR |
| Период | Тот же, что в `get_user_tariff_limits` (`UserSubscription` или календарный месяц UTC) |
| Создание строки | Upsert `UsageCounter` при первом сообщении периода (как unique по user+period) |

### 10.3. Почему не ORM `counter.messages_used += 1` без защиты

При параллельных webhook возможны lost updates. Нужен **атомарный** SQL:

```sql
UPDATE usage_counters SET messages_used = messages_used + 1 WHERE id = :id
```

или `INSERT ... ON CONFLICT` с increment (зависит от БД).

---

## 11. Как избежать race conditions

| Риск | Митигация |
| ---- | --------- |
| Два webhook одновременно | DB-level atomic increment; unique dedup key |
| read limit → process → write | TOCTOU: повторная проверка или increment с условием `messages_used < limit` |
| Несколько воркеров uvicorn | SQLite dev — слабее; Postgres prod — `UPDATE ... WHERE messages_used < :limit` |
| Redis | **Не обязателен** на 5.3; рассмотреть при высокой нагрузке |
| Очередь | Вне scope; webhook остаётся синхронным |

**Фаза 1:** SQL atomic increment + dedup; **фаза 2:** optional Redis rate counter.

---

## 12. Что делать при 70/85/95/100%

Сейчас: `tariff_limits.py` → `_build_message_warnings()` только в **summary** (API/UI позже).

При enforcement **не отправлять** email/push в 5.3.

Опционально в 5.3: логировать факт пересечения порога для будущих уведомлений.

---

## 13. Что делать при 100% лимита

По [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md) §16–18:

| Действие | 5.3 |
| -------- | --- |
| Бот не удаляется | Да (не трогать `Bot.is_active`) |
| Сценарий не ломать | Пропустить `process_channel_update`, state сохраняется |
| Входящее зафиксировать | `track_event` / новый `message_blocked_limit` (желательно) |
| Уведомление владельцу | UI/этап позже, не backend push в 5.3 |
| После покупки пакета | `get_user_tariff_limits` подхватит новый лимит; обработка возобновится |

---

## 14. Что нельзя делать

- **Нельзя** удалять или деактивировать бота при 100%.
- **Нельзя** ломать граф сценария / сбрасывать переменные при блоке.
- **Нельзя** списывать один webhook дважды (dedup обязателен).
- **Нельзя** отвечать провайдеру 5xx → бесконечные retry.
- **Нельзя** без плана смешивать `UserQuota.used_messages` и `UsageCounter.messages_used` в одном flow.
- **Нельзя** в 5.3 менять `channel_webhooks.py` контракт оплаты / marketplace / `POST /me/plan`.

---

## 15. Рекомендованный план Этапа 5.3

### 15.1. Новые файлы

| Файл | Назначение |
| ---- | ---------- |
| `backend/services/tariff_message_enforcement.py` | `ensure_can_process_message`, `record_message_usage`, `MessageLimitExceeded` |
| `backend/services/usage_counter_service.py` (опционально) | get_or_create period row, atomic increment |
| `backend/tests/test_tariff_message_enforcement.py` | unit + интеграция с `process_channel_update` / mock adapter |

### 15.2. Изменяемые файлы (минимально)

| Файл | Изменение |
| ---- | --------- |
| `backend/services/channel_runtime.py` | Вызов enforcement в начале `process_channel_update` |
| `backend/routers/channel_webhooks.py` | (Опционально) dedup `ProcessedUpdate` для MAX/Telegram |
| `docs/TARIFFS_STAGE_5_3_MESSAGE_ENFORCEMENT.md` | Документация этапа |

### 15.3. Не трогать в 5.3

- `channel_webhooks.py` — только если dedup (можно вынести в 5.3.1)
- `backend/routers/webhook.py` (BotInstance)
- `backend/routers/message.py`, `UserQuota` semantics
- `frontend/`, marketplace, payments
- `POST /me/plan`

### 15.4. Тесты

1. Under limit → runtime выполняется, `messages_used` +1.
2. At limit → runtime skip, HTTP 200 снаружи, `messages_used` не растёт.
3. Duplicate WhatsApp message_id → не increment.
4. Unlimited corporate → always process.
5. Stale/read: summary и enforcement используют один `UsageCounter` row.
6. Package addon увеличивает `messages_limit` — processing resumes.

---

## 16. Оставшиеся риски

| Риск | Уровень | Комментарий |
| ---- | ------- | ----------- |
| Два runtime (Bot vs BotInstance) | Высокий | Telegram legacy вне `process_channel_update` |
| Dedup только WhatsApp | Высокий | MAX/TG retries |
| UserQuota vs UsageCounter | Средний | Два счётчика до миграции REST |
| Нет blocked-event таблицы | Средний | Аналитика «не обработано» из концепции |
| Синхронный webhook под нагрузкой | Средний | Позже очередь/Redis |
| `messages_used` read в summary без write | Низкий (закрыть в 5.3) | Сейчас всегда 0 без ручного seed |

---

## 17. Сводка аудита `check_max_bots` / legacy (для контекста сообщений)

Прямого `check_max_bots` в webhook **нет**. Лимит сообщений в runtime **не проверяется**. Legacy 1 ₽ — только `POST /messages/`.

---

## 18. Проверки этапа 5.2

- Код не менялся (кроме этого документа).
- Тесты не запускались (docs-only).
- `backend/uvicorn` не запускался.

---

## 19. Следующий этап

**Этап 5.3** — подключение message enforcement в `process_channel_update`, atomic `UsageCounter.messages_used`, dedup для всех каналов, тесты, без изменения legacy `webhook.py` и `POST /messages/`.
