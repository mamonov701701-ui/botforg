# BotForg — Этап 2.2: SQLAlchemy-модели тарифной системы

**Дата:** 2026-06-02  
**Опора:** [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md), [TARIFFS_CODE_AUDIT.md](./TARIFFS_CODE_AUDIT.md), [TARIFFS_STAGE_2_PLAN.md](./TARIFFS_STAGE_2_PLAN.md)

---

## 1. Какие модели добавлены

Файл: `backend/models/tariff.py`

| Модель (Python) | Таблица | Назначение |
| --------------- | ------- | ---------- |
| `AddonPackage` | `addon_packages` | Каталог пакетов расширения |
| `UserSubscription` | `user_subscriptions` | Подписка на тариф (`plan_id`) |
| `UserAddon` | `user_addons` | Активный пакет на период |
| `UsageCounter` | `usage_counters` | Учёт messages / active_bots / team за период |
| `GiftGrant` | `gift_grants` | Подарочные начисления |
| `AdminAuditLog` | `admin_audit_log` | Журнал действий администратора |

**Enum-классы:** `AddonPackageType`, `SubscriptionStatus`, `UserAddonStatus`, `UserAddonSource`, `GiftType`, `GiftGrantStatus`.

**Обновлено:** `backend/models/__init__.py` (импорты и `__all__`), `backend/migrations/env.py` (импорт модулей `plan`, `tariff` для будущего autogenerate).

---

## 2. Какие таблицы появятся на Этапе 3

После Alembic revision и `upgrade head` в БД должны появиться:

- `addon_packages`
- `user_subscriptions`
- `user_addons`
- `usage_counters`
- `gift_grants`
- `admin_audit_log`

Плюс (отдельной миграцией, не в 2.2): расширение таблицы `plans` (`name_ru`, `price_month`, …) — см. [TARIFFS_STAGE_2_PLAN.md](./TARIFFS_STAGE_2_PLAN.md).

До миграции таблиц в SQLite/Postgres **нет** — ORM только регистрирует metadata.

---

## 3. Какие модели специально не трогались

- `backend/models/plan.py` — `Plan` без изменений
- `backend/models/user.py` — `plan_code` и relationships не редактировались
- `backend/models/billing.py` — `UserQuota`, `BillingRecord`
- `backend/models/payment.py`
- `backend/models/market.py`, `market_access.py`
- Все роутеры, `plan_limits.py`, `message.py`, frontend

---

## 4. Почему `Plan` не менялся до миграций

Добавление колонок в ORM `Plan` без соответствующей revision дало бы рассинхрон схемы и кода. Справочник тарифов расширяется на **Этапе 3** вместе с миграцией и (позже) seed новых кодов (`start`, `business`, …). Связь подписок — через FK `user_subscriptions.plan_id` → `plans.id`, без изменения `Plan`.

---

## 5. Почему enforcement не подключался

Этап 2.2 — только слой данных. Проверки лимитов (`plan_limits`, bot/scenario/market, channel runtime) остаются на legacy `plan_code` и `UserQuota` до сервиса лимитов и этапа 5.

---

## 6. Почему платежи не подключались

`Payment` / webhooks не связывались с `UserSubscription` и `UserAddon`. Поля `payment_provider` и `provider_subscription_id` заложены в модели для будущей интеграции без P2P между пользователями marketplace.

---

## 7. Какие миграции нужны дальше (Этап 3)

1. `CREATE TABLE` для шести таблиц выше + enum-типы (паттерн `market_access_020`).
2. Индексы и `UniqueConstraint` на `usage_counters` (`user_id`, `period_start`, `period_end`).
3. `ALTER TABLE plans` — цены, `name_ru`, флаги витрины (отдельно от 2.2).
4. Seed `addon_packages` и новых планов — data migration.
5. Не править `plans_012`, `plans_developer_013`.

---

## 8. Какие проверки выполнены

| Проверка | Команда | Результат |
| -------- | ------- | --------- |
| Импорт моделей | `backend\venv\Scripts\python.exe -c "from backend.models.tariff import …"` | `tariff models import ok` |
| Регрессия backend | `backend\venv\Scripts\python.exe -m pytest backend/tests -q` | **192 passed**, 4 xfailed (~153 s). Падений из‑за отсутствия новых таблиц нет — тесты не обращаются к ним до миграции. |

---

## 9. Какие риски остались

| Риск | Митигация |
| ---- | --------- |
| Два источника тарифа: `users.plan_code` и `user_subscriptions` | Dual-write на этапах 4–5 |
| `UserQuota` параллельно с `UsageCounter` | Слияние в сервисе лимитов позже |
| Запросы к новым таблицам до migration | Не добавлять роутеры до этапа 3 |
| `backref` на `User` / `Plan` | Уникальные имена; при конфликте — убрать backref на этапе 3 |
| Имя таблицы `admin_audit_log` | Общее имя; при коллизии в БД — переименовать в migration |

---

## Связи и поля (кратко)

- `workspace_id`: `Integer`, nullable, **без FK** (таблицы workspace нет).
- `available_from_plan`: JSON (список кодов тарифов, с которых доступен пакет).
- `old_value` / `new_value` в `AdminAuditLog`: JSON, как `Plan.limits`.
- `UsageCounter`: unique `(user_id, period_start, period_end)`.
