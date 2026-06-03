# Этап 5.4.1 — Cleanup источников tariff summary

**Дата:** 2026-06-03  
**Опора:** [TARIFFS_STAGE_5_4_LIMITS_SUMMARY_API.md](./TARIFFS_STAGE_5_4_LIMITS_SUMMARY_API.md), [TARIFFS_STAGE_4_LIMITS_SERVICE.md](./TARIFFS_STAGE_4_LIMITS_SERVICE.md)

---

## 1. Цель

Закрыть два долга после этапа 5.4:

1. `GiftType.PLAN` не влиял на базовый тариф (молчаливый TODO).
2. `team_members.used` брался из `UsageCounter`, а не из реальной команды.

Без изменения frontend, payments, marketplace, legacy webhook и `POST /messages/`.

---

## 2. GiftType.PLAN — аудит

| Вопрос | Результат |
|--------|-----------|
| Типы подарков | `plan`, `addon`, `messages`, `active_bot`, `team_member` (`GiftType`) |
| Модель | `GiftGrant.plan_id` → `plans.id` (nullable) |
| Документация этапа 4 | Явно: PLAN «не заменяет» базовый тариф (TODO 5+) |
| Тесты до 5.4.1 | Нет сценариев PLAN gift |
| Концепт | `plan_id` в схеме `gift_grants` предусмотрен |

### Принятое решение: **Вариант А (реализация)**

Активный PLAN gift с `plan_id` участвует в выборе **effective plan**:

- Кандидаты: базовый план (подписка / `users.plan_code` / fallback `start`) + планы из активных PLAN gifts в периоде.
- Победитель: максимальный `Plan.sort_order`; при равенстве — приоритет источника: `subscription` > `gift_plan` > `legacy_plan_code` > `fallback_start`.
- В summary `source == "gift_plan"`, если выиграл план из подарка.
- Несколько PLAN gifts: выбирается план с наибольшим `sort_order`.

### PLAN gift без `plan_id` — **явно unsupported**

- Не меняет лимиты.
- В `active_gifts[]`: `status: "unsupported_missing_plan_id"` + `message`.
- Покрыто тестом (не молчаливое игнорирование).

### Файлы

- `backend/services/tariff_limits.py` — `_resolve_effective_plan`, `_find_active_plan_gift_grants`
- `backend/tests/test_tariff_limits_service.py` — 5 тестов PLAN
- `backend/tests/test_tariff_summary_api.py` — API `source: gift_plan`

---

## 3. team_members.used — аудит

| Модель | Назначение | Для тарифа? |
|--------|------------|-------------|
| `TeamMember` (`team_members`) | Приглашённые участники по `owner_id` | **Да** — используется в `POST /api/team/add-member` |
| `BFTeamMember` | Внутренняя BF-команда платформы | Нет |

Лимит `team_members` привязан к **владельцу аккаунта** (`user_id` / `owner_id`), не к workspace (workspace пока не в runtime).

### Принятое решение: **Вариант А (реальный count)**

- Новый модуль `backend/services/team_usage.py` — `count_team_members_for_owner(db, owner_id)`.
- `get_user_tariff_limits` использует его вместо `UsageCounter.team_members_used`.
- `UsageCounter.team_members_used` **не удалён** (может понадобиться позже); для summary/enforcement через `tariff_limits` не источник истины.

### Файлы

- `backend/services/team_usage.py`
- `backend/services/tariff_limits.py`
- `backend/tests/test_tariff_limits_service.py` — `test_team_members_used_from_team_table_not_counter`

---

## 4. Что не трогалось

- Frontend, payments, marketplace
- Legacy `/webhook/{bot_id}`, `POST /messages/`
- `check_max_team_members` в `plan_limits.py` (по-прежнему legacy `max_team_members` из `users.plan_code`)
- Uvicorn / dev-сервер

---

## 5. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_limits_service.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_summary_api.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/ -k tariff -v
backend\venv\Scripts\python.exe -m pytest backend/tests/ -q
```

Добавлено/обновлено:

| Область | Тесты |
|---------|--------|
| PLAN gift | upgrade start→business_pro, expired, multiple highest, missing plan_id, subscription vs lower gift |
| team_members | реальный count vs stale UsageCounter |
| API | `gift_plan` в `/me/tariff/summary` |

---

## 6. Остаточные долги (безопасные)

| Долг | Статус |
|------|--------|
| Enforcement команды через `plan_limits.check_max_team_members` | Legacy `users.plan_code`, не `get_user_tariff_limits` — отдельный этап |
| `GiftType.PLAN` без `plan_id` | Задокументирован unsupported + тест |
| Workspace-scoped team / тариф | Будущая модель рабочей области (концепт §28) |
| `UsageCounter.team_members_used` | Не синхронизируется с `TeamMember` автоматически |

---

## 7. Изменённые файлы

- `backend/services/tariff_limits.py`
- `backend/services/team_usage.py` (новый)
- `backend/tests/test_tariff_limits_service.py`
- `backend/tests/test_tariff_summary_api.py`
- `docs/TARIFFS_STAGE_5_4_1_SUMMARY_SOURCE_CLEANUP.md` (новый)
