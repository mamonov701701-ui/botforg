# Этап 5.4.2 — Team members enforcement cleanup

**Дата:** 2026-06-03  
**Опора:** [TARIFFS_STAGE_5_4_1_SUMMARY_SOURCE_CLEANUP.md](./TARIFFS_STAGE_5_4_1_SUMMARY_SOURCE_CLEANUP.md)

---

## 1. Цель

Устранить рассинхрон: `GET /me/tariff/summary` считает `team_members` через `get_user_tariff_limits` + `count_team_members_for_owner`, а `POST /api/team/add-member` вызывал legacy `check_max_team_members` (`users.plan_code` + `max_team_members` из JSON).

---

## 2. Закрываемый долг

| До | После |
|----|--------|
| `plan_limits.check_max_team_members` → `get_user_plan_limits(user)` + `max_team_members` | Делегирует в `ensure_can_add_team_member(owner_id)` |
| Count из `TeamMember` в wrapper, лимит из legacy | Лимит и used из единой тарифной системы |
| Не учитывались addons, gifts, PLAN gift | Как в summary API |

---

## 3. Аудит

| Место | Назначение |
|-------|------------|
| `backend/routers/team.py` → `POST /api/team/add-member` | **Единственный** путь создания `TeamMember` для клиентов |
| `backend/models/team.py` → `TeamMember` | Приглашённые участники (`owner_id`, `user_id`) |
| `backend/models/bf_team_member.py` → `BFTeamMember` | Внутренняя BF-команда платформы — **не** для тарифа |
| `platform_admin.py` | BFTeamMember + read-only TeamMember |
| `bot.py` | Чтение TeamMember для доступа к ботам |

Legacy-проверка: только `check_max_team_members` в `plan_limits.py` (вызов из `team.py`).

---

## 4. Модель и подсчёт

**Тарифный лимит клиентской команды:** `TeamMember` где `owner_id` = владелец аккаунта.

- **used:** `count_team_members_for_owner(db, owner_id)` — только приглашённые, владелец не в таблице.
- **limit:** `get_user_tariff_limits(db, owner_id).team_members_limit` (тариф + addons + gifts + effective PLAN gift + subscription).

**BFTeamMember** не участвует в `team_members.used` / enforcement.

---

## 5. Реализация

| Файл | Изменение |
|------|-----------|
| `backend/services/tariff_enforcement.py` | `ensure_can_add_team_member`, коды `team_members_unavailable` / `team_members_limit_exceeded` |
| `backend/utils/plan_limits.py` | `check_max_team_members` — compatibility wrapper |
| `backend/tests/test_tariff_enforcement_team.py` | 11 тестов |

Поведение:

- `limit <= 0` → блок (`team_members_unavailable`)
- `limit is None` (corporate) → без ограничения
- `used >= limit` → блок (`team_members_limit_exceeded`)
- иначе → разрешено

---

## 6. Защищённые API

- `POST /api/team/add-member` (через обновлённый `check_max_team_members`)

`PUT` / `DELETE` участника лимит не проверяют (только добавление).

---

## 7. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_enforcement_team.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_limits_service.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_summary_api.py -v
backend\venv\Scripts\python.exe -m pytest backend/tests/ -k tariff -q
backend\venv\Scripts\python.exe -m pytest backend/tests/ -k team -q
backend\venv\Scripts\python.exe -m pytest backend/tests/ -q
```

`-k team` также подхватывает `test_plans.py` (код тарифа `team` в каталоге) — в отчёте указать явно.

---

## 8. Не трогалось

- Frontend, marketplace, payments
- Webhook runtime, legacy `/webhook/{bot_id}`, `POST /messages/`
- `UsageCounter.team_members_used` (колонка сохранена)
- `BFTeamMember` / platform admin flows

---

## 9. Остаточные долги

| Долг | Комментарий |
|------|-------------|
| Синхронизация `UsageCounter.team_members_used` | Не пишется при добавлении участника; не источник истины |
| Workspace-scoped team | Будущая модель (концепт §28) |
| Router-level e2e `POST /api/team/add-member` | Требует `role=owner`; покрыто service + wrapper тестами |
