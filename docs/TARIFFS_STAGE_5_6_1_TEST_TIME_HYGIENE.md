# Этап 5.6.1 — Test time hygiene

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**Опора:** [TARIFFS_STAGE_5_6_UI_UX_VERIFICATION_AND_INTEGRATION_SMOKE_CLEANUP.md](./TARIFFS_STAGE_5_6_UI_UX_VERIFICATION_AND_INTEGRATION_SMOKE_CLEANUP.md)

---

## 1. Исходная причина

Tariff/webhook-тесты сидели `UsageCounter` / addons / gifts на календарный период **июнь 2026**, а HTTP и service-пути без явного `at=` вызывали `datetime.now(timezone.utc)` в `backend.services.tariff_limits.get_user_tariff_limits`. После смены месяца (июль 2026) периоды не пересекались — тесты падали без регрессии продуктовой логики.

## 2. Решение

- Добавлен `backend/tests/tariff_time.py`:
  - `FIXED_TARIFF_NOW = 2026-06-15T12:00:00Z`
  - `month_period()` — календарный месяц `[start, end)` (в т.ч. декабрь → январь)
  - fixture `freeze_tariff_now` — monkeypatch `backend.services.tariff_limits.datetime.now` (pytest откатывает после каждого теста)
- Подключено через `pytestmark` в summary / message enforcement / bot enforcement / webhook contract tests.
- Текущие периоды и «now» в этих тестах берутся из общего helper, не из wall clock.

## 3. Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `backend/tests/tariff_time.py` | новый shared helper + fixture |
| `backend/tests/test_tariff_summary_api.py` | freeze + `month_period` / `FIXED_TARIFF_NOW` |
| `backend/tests/test_tariff_message_enforcement.py` | freeze + shared time |
| `backend/tests/test_tariff_enforcement_bots.py` | freeze + shared time |
| `backend/tests/test_webhook_payload_contract.py` | freeze + shared time |

## 4. Production logic

**Не менялась.** Payments, marketplace, frontend, legacy `/webhook/{bot_id}`, `POST /messages/`, webhook и tariff business logic не трогались.

## 5. Результаты тестов

```text
pytest backend/tests/ -q
303 passed, 4 xfailed
```

Остаточных failures нет.
