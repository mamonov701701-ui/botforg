# Этап 5.4 — API сводки «Финансы и лимиты»

## Цель

Дать авторизованному пользователю backend-эндпоинт со сводкой по текущему тарифу, лимитам, использованию, остаткам, предупреждениям, активным пакетам и подаркам — без изменения runtime и без frontend на этом этапе.

## Маршрут

| Метод | Путь | Auth |
|-------|------|------|
| `GET` | `/me/tariff/summary` | Bearer / cookie (`get_current_user`) |

## Структура response

```json
{
  "current_plan": {
    "code": "start",
    "slug": "start",
    "name": "Старт",
    "billing_period": { "start": "...", "end": "..." },
    "subscription_status": null,
    "source": "legacy_plan_code"
  },
  "messages": { "limit": 500, "used": 0, "remaining": 500 },
  "active_bots": { "limit": 1, "used": 0, "remaining": 1 },
  "team_members": { "limit": 0, "used": 0, "remaining": 0 },
  "active_addons": [],
  "active_gifts": [],
  "warnings": [
    { "type": "messages_usage", "threshold": 70, "message": "..." }
  ],
  "flags": {
    "marketplace_access": true,
    "template_publish": true,
    "scenario_publish": true,
    "export_reports": false,
    "priority_support": false
  }
}
```

- `current_plan.subscription_status` — из активной `UserSubscription`, иначе `null`.
- `current_plan.source` — `subscription` | `legacy_plan_code` | `fallback_start` (как в сервисе).
- `warnings` — пороги 70 / 85 / 95 / 100 % для сообщений, активных ботов и участников команды (лимит ≤ 0 или безлимит — предупреждений нет).
- `flags` — из `Plan.limits` через `get_user_tariff_limits`; для «Старт» marketplace/template/scenario publish всегда `true` (defaults в сервисе).

## Используемые сервисы

- `backend/services/tariff_limits.py` — `get_user_tariff_limits()` (единственный источник расчёта).
- `backend/schemas/tariff.py` — Pydantic-маппинг `TariffLimitsSummary` → `TariffSummaryOut`.
- `backend/routers/tariff.py` — тонкий read-only handler.

Эндпоинт **не** вызывает `tariff_message_enforcement`, **не** пишет в `UsageCounter`, **не** списывает сообщения.

## Почему не трогали другие области

| Область | Причина |
|---------|---------|
| Frontend | отдельный этап UI «Финансы и лимиты» |
| Payments / billing records | нет платёжной логики на 5.4 |
| Marketplace | только флаг `marketplace_access` из плана |
| Legacy `/webhook/{bot_id}` | вне scope |
| `POST /messages/` | вне scope |
| Uvicorn / dev-сервер | по правилам задачи не запускался |

## Тесты

Файл: `backend/tests/test_tariff_summary_api.py`

- 401 без авторизации
- структура и лимиты на тарифе «Старт»
- согласованность с `get_user_tariff_limits`
- `active_bots.used` через production-active подсчёт
- addons / gifts в ответе
- warnings 70/85/95/100 для сообщений
- flags для «Старт»
- отсутствие мутации `UsageCounter` при повторных GET

Запуск:

```bash
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_limits_service.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/ -k tariff -v
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_summary_api.py -v
```

## Риски, закрытые на этапе

1. **Дублирование лимитов в роутере** — расчёт только в `tariff_limits`.
2. **Побочные эффекты при чтении** — GET не создаёт/не обновляет счётчики (в отличие от legacy `GET /billing/summary`).
3. **Неполные warnings для UI** — добавлены типы `active_bots_usage` и `team_members_usage` в сервис (ранее были только сообщения).
4. **Статус подписки в UI** — поле `subscription_status` пробрасывается из активной подписки в summary.

## Намеренно не делалось

- UI личного кабинета «Финансы и лимиты»
- Оплата, смена тарифа через платёжку
- Admin API управления пакетами/подарками
- Enforcement в webhook/runtime (этапы 5.1–5.3)
- Подарочный тариф `GiftType.PLAN` (TODO в сервисе, без изменений)

## Файлы этапа

- `backend/routers/tariff.py`
- `backend/schemas/tariff.py`
- `backend/services/tariff_limits.py` (warnings + `subscription_status`)
- `backend/main.py` (подключение router)
- `backend/tests/test_tariff_summary_api.py`
- `docs/TARIFFS_STAGE_5_4_LIMITS_SUMMARY_API.md`
