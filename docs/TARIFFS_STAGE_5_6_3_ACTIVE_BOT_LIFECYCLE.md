# Этап 5.6.3 — Active bot lifecycle enforcement

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**Опора:** аудит 5.6.2 (backend tariff enforcement closure)

---

## 1. Найденные дефекты

1. **Re-enable bypass:** `POST /bots/{id}/channels` при обновлении существующего `BotChannelConnection` всегда пропускал `ensure_can_connect_channel`. Переход `is_enabled: false → true` мог превысить лимит активных ботов.
2. **Inflated usage after soft-delete:** `DELETE /bots/{id}` ставил только `is_active=False`, не отключая `BotChannelConnection.is_enabled`. `is_bot_production_active` считает enabled channel без `is_active` → слот не освобождался.

---

## 2. Поведение re-enable

При обновлении существующего connection:

| Переход | Enforcement |
|---------|-------------|
| `false → true` | `ensure_can_connect_channel(..., updating_existing=False)` **до** commit; при успехе может выставить `bot.is_active=True` |
| уже `true` + credentials/no-op | без повторной проверки слота |
| `true → false` | без проверки лимита |

Правило `1 бот = 1 канал` и лимит active bots (тариф + addon + gift) — через существующий `tariff_enforcement` / `get_user_tariff_limits`.

---

## 3. Поведение soft-delete

`DELETE /bots/{id}` (soft-delete, без hard-delete):

- `bot.is_active = False`
- все `BotChannelConnection` бота с `is_enabled=True` → `is_enabled=False`
- тарифный слот освобождается (`count_production_active_bots`)
- новый channel webhook не принимает updates (`is_active` и `is_enabled` требуются в `channel_webhooks`)

---

## 4. Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `backend/routers/channels.py` | проверка при re-enable |
| `backend/routers/bot.py` | disable channels при soft-delete |
| `backend/tests/test_tariff_enforcement_bots.py` | lifecycle + gift ACTIVE_BOT |
| `backend/tests/test_tariff_limits_service.py` | `test_active_gift_active_bot` |

---

## 5. API / business logic

- Публичные пути и схемы **не менялись**.
- Message billing, team, payments, marketplace, legacy webhook / `POST /messages/` **не трогались**.

---

## 6. Результаты тестов

```text
pytest backend/tests/test_tariff_enforcement_bots.py -q   → 21 passed
pytest backend/tests/test_tariff_limits_service.py -q     → 25 passed
pytest backend/tests/ -k "tariff or channel" -q           → 105 passed
pytest backend/tests/ -q                                 → 312 passed, 4 xfailed
```
