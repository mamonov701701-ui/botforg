# BotForg — Этап 5.1: enforcement активных ботов

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_STAGE_4_LIMITS_SERVICE.md](./TARIFFS_STAGE_4_LIMITS_SERVICE.md), [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md)

---

## 1. Цель

Подключить проверку тарифных лимитов к действиям с **активными** ботами и каналами:

- лимит `active_bots` (тариф + пакеты + подарки через `get_user_tariff_limits`);
- правило **«1 активный бот = 1 канал»**.

Черновики ботов без канала не ограничиваются.

---

## 2. Что подключено

| Компонент | Назначение |
| --------- | ---------- |
| `backend/services/bot_usage.py` | Единый подсчёт production-active ботов и каналов |
| `backend/services/tariff_enforcement.py` | `ensure_can_activate_bot`, `ensure_can_connect_channel` |
| `backend/services/tariff_limits.py` | `active_bots_used` из `count_production_active_bots` |
| `backend/routers/bot.py` | Enforcement при `POST /bots/connect` и активации через `PATCH` |
| `backend/routers/channels.py` | Enforcement при `POST /bots/{id}/channels` (новое подключение) |
| `backend/tests/test_tariff_enforcement_bots.py` | Service- и router-level тесты |

---

## 3. Где стоит enforcement

| Endpoint | Поведение |
| -------- | --------- |
| `POST /bots/connect` | `ensure_can_activate_bot` перед созданием Telegram-бота |
| `POST /bots/` (черновик) | **без** проверки лимита активных ботов |
| `PATCH /bots/{id}` | `ensure_can_activate_bot`, если бот стал production-active |
| `POST /bots/{bot_id}/channels` | `ensure_can_connect_channel` при **новом** канале; обновление того же канала — без повторной проверки слота |

**Не изменялись:** `channel_webhooks.py`, message runtime, `POST /me/plan`.

---

## 4. Как считается активный бот

Production-active, если **не** черновик и:

1. есть `BotChannelConnection` с `is_enabled=True`, **или**
2. legacy Telegram: `is_active=True` и токен **не** `placeholder_*` (подключение через `/bots/connect`).

Не учитываются: `is_suspended`, черновики (`placeholder_*` без канала), неактивные боты без канала.

Подсчёт: `backend/services/bot_usage.py` → `count_production_active_bots()`.  
И enforcement, и `get_user_tariff_limits().active_bots_used` используют **один и тот же** helper (не `UsageCounter.active_bots_used`).

---

## 5. Правило «1 бот = 1 канал»

У одного бота может быть только один активный канал:

- включённые строки в `bot_channel_connections`;
- плюс неявный канал `telegram` при подключении через `/bots/connect`.

Второй канал (например MAX после Telegram) → `403` с текстом:  
`Один бот может быть подключён только к одному каналу.`

---

## 6. Что НЕ трогали

- Сообщения / webhook (`channel_webhooks.py`, `UserQuota`, `messages_used`) — **не трогались**
- Marketplace — **не трогался**
- Frontend — **не трогался**
- Платежи — **не трогались**
- `POST /me/plan` — **не трогался**
- Legacy `users.plan_code`, `user_quotas` — **не удалялись**

---

## 7. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_enforcement_bots.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

---

## 8. Риски (остаточные)

| Риск | Комментарий |
| ---- | ----------- |
| Telegram без `BotChannelConnection` | Неявный канал `telegram` в логике 1:1 |
| Активация только `is_active` без канала | PATCH с `is_active=True` на placeholder без канала не считается production-active |

### UsageCounter.active_bots_used

`UsageCounter.active_bots_used` на Этапе 5.1 **не является** источником истины для активных ботов.

**Источник истины для активных ботов:**

`backend/services/bot_usage.py`

**Используются функции:**

- `count_production_active_bots`
- `is_bot_production_active`
- `bot_active_channel_keys`

**Причина:**  
активность бота определяется фактическим production-состоянием: включённое подключение канала или legacy Telegram-бот с реальным токеном. Это нельзя надёжно заменить отдельным счётчиком без риска рассинхронизации.

`UsageCounter.active_bots_used` может остаться в БД как поле для будущей аналитики/агрегатов, но **enforcement** и **tariff summary** его не используют. Это подтверждено тестом `test_active_bots_used_from_production_count_not_stale_counter`.

---

## Закрытие внутренних рисков Этапа 5.1

### Legacy `check_max_bots`

| Место | Действие |
| ----- | -------- |
| `backend/routers/bot.py` (`connect`, `PATCH`) | Уже `ensure_can_activate_bot`; `check_max_bots` не используется |
| `backend/routers/bot.py` (`POST /` черновик) | Проверка снята ранее |
| `backend/routers/market.py` (install шаблона) | **Удалён** `check_max_bots` — создаётся черновик (`is_active=False`, `placeholder_*`), лимит active_bots не применяется |
| `backend/utils/plan_limits.py` | `check_max_bots` — **обёртка** над `ensure_can_activate_bot` (active_bots, не все боты в БД) |

Конфликта «5 черновиков блокируют connect» больше нет.

### Единый подсчёт active bots

- **Источник истины:** `backend/services/bot_usage.py`
- **Функции:** `is_bot_production_active`, `count_production_active_bots`, `bot_active_channel_keys`
- **Использование:** `tariff_enforcement.py`, `tariff_limits.py` (`active_bots_used`), `channels.py` (`is_placeholder_bot_token`)

`active_bots_remaining` в summary согласован с enforcement.

### Что осталось вне scope

- Сообщения / webhook (`messages_used` по-прежнему из `UsageCounter`)
- Team enforcement (`team_members_used` из `UsageCounter`)
- Запись `UsageCounter.active_bots_used` при connect — **не требуется** на 5.1 (см. раздел «UsageCounter.active_bots_used» выше)

---

## 9. Следующий этап

**Этап 5.2** — аудит message/webhook runtime перед enforcement лимита сообщений.
