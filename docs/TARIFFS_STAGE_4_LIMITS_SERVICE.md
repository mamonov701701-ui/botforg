# BotForg — Этап 4: сервис расчёта тарифных лимитов

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md), [TARIFFS_STAGE_3_MIGRATION.md](./TARIFFS_STAGE_3_MIGRATION.md)

---

## 1. Цель

Добавить backend-сервис, который **только считает** итоговые лимиты пользователя, фактическое использование (usage summary) и предупреждения о приближении к лимиту сообщений — без блокировки действий в runtime.

---

## 2. Что добавлено

| Файл | Назначение |
| ---- | ---------- |
| `backend/services/tariff_limits.py` | Расчёт лимитов, usage, warnings |
| `backend/tests/test_tariff_limits_service.py` | Юнит-тесты сервиса (13 сценариев) |
| `docs/TARIFFS_STAGE_4_LIMITS_SERVICE.md` | Документация этапа |

**Публичная точка входа:** `get_user_tariff_limits(db, user_id, at=None) -> TariffLimitsSummary`.

**Структуры:** `TariffLimitsSummary`, `TariffLimitWarning` (dataclass, без API-схем).

---

## 3. Какие модели учитываются

| Модель | Роль |
| ------ | ---- |
| `Plan` | Базовые лимиты из `Plan.limits` |
| `UserSubscription` | Активная подписка перекрывает `users.plan_code` |
| `UserAddon` + `AddonPackage` | Пакеты сообщений / ботов / участников |
| `GiftGrant` | Подарочные начисления |
| `UsageCounter` | Учёт `messages_used`, `active_bots_used`, `team_members_used` |
| `User` | `plan_code` (legacy fallback) |

**Не используются на этом этапе для enforcement:** `Bot`, `UserQuota` (legacy quota читается не для блокировки; при отсутствии `UsageCounter` usage = 0).

---

## 4. Как считается итоговый лимит

1. Определить **базовый тариф** и **расчётный период** (`period_start` / `period_end`).
2. Прочитать числовые лимиты из `Plan.limits` (с legacy-ключами `max_bots`, `max_team_members` при необходимости).
3. Сложить бонусы активных `UserAddon` и `GiftGrant`, пересекающихся с периодом.
4. Найти `UsageCounter` с пересечением периода.
5. Вычислить `remaining` и warnings.

Формула:

```text
итоговый лимит = тариф + активные пакеты + активные подарки
```

Для `corporate` и значений `null` в limits: лимит и `remaining` = `None` (безлимит), отрицательные `remaining` не допускаются.

**Предупреждения по сообщениям** (только возврат в `warnings`, без уведомлений): пороги 70%, 85%, 95%, 100%.

---

## 5. Как работает legacy fallback

Порядок выбора тарифа:

1. Активная `UserSubscription` (`status=active`, `at` внутри `current_period_*`) → план подписки.
2. Иначе `User.plan_code` → `Plan.code`.
3. Если план не найден → `Plan.code == "start"` (`fallback_start`).

Период без подписки: **календарный месяц UTC**, содержащий `at`.

Подарок типа `plan` **не заменяет** базовый тариф автоматически (TODO для этапа 5+).

---

## 6. Что пока НЕ делается

- **Enforcement не подключён** — `plan_limits.py`, роутеры ботов/сообщений/marketplace не менялись.
- Сообщения **реально не списываются** через новый сервис.
- Активные боты **не блокируются** по новым лимитам.
- **Marketplace** не менялся.
- **Платежи** не подключались к `UserSubscription` / `UserAddon`.
- **`POST /me/plan`** не менялся.
- Legacy **`user_quotas`** и **`users.plan_code`** не удалялись.
- **Frontend** не изменён.

---

## 7. Тесты

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_tariff_limits_service.py -q
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

Покрытие: fallback `start`, legacy `business`, подписка vs `plan_code`, пакеты (messages/bot/team), истёкшие пакеты/подарки, `UsageCounter`, corporate/unlimited, warnings 70–100%, неполный `Plan.limits`.

---

## 8. Остаточные риски

| Риск | Комментарий |
| ---- | ----------- |
| Два источника тарифа (`plan_code` vs подписка) | На этапе 5 нужен dual-write и единый источник правды |
| Период без подписки = календарный месяц | Может расходиться с биллинговым периодом после оплаты |
| `UsageCounter` vs реальные боты | Подсчёт активных ботов из `bots` не подключён |
| Подарок `plan` | Не применяется к базовому тарифу |
| `UserQuota` | Параллельно существует; не мержится в usage на этапе 4 |

---

## 9. Следующий этап

**Этап 5** — подключение backend enforcement лимитов к реальным действиям (активация бота, отправка сообщений, команда и т.д.).
