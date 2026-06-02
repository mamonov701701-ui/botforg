# BotForg — план добавления backend-моделей тарифной системы

**Подэтап:** 2.1 — аудит архитектуры (только документ)  
**Опора:** [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md), [TARIFFS_CODE_AUDIT.md](./TARIFFS_CODE_AUDIT.md)  
**Последний commit:** `16e9bb0 docs: add final tariffs concept and audit`  
**Дата:** 2026-06-02

---

## 1. Краткий вывод

Добавление тарифных моделей **безопасно**, если на этапе 2.2 ограничиться **новыми файлами** (`backend/models/tariff.py`), регистрацией в `backend/models/__init__.py` и **не трогать** `plan_limits.py`, роутеры, `User.plan_code`, `POST /me/plan`.

**Base** один на весь проект (`backend/database.py`). Паттерны полей согласованы с `market_access.py` и `billing.py`.

**Workspace как сущность отсутствует** — на первом этапе все FK только на `users.id`, плюс nullable `workspace_id` «на будущее» в моделях подписки/usage (без таблицы workspace).

**Таблица `plans` уже есть** — расширять колонки в ORM `Plan` **только вместе** с Alembic на этапе 3; на 2.2 файл `plan.py` лучше **не менять**.

**Похожих сущностей нет** — только `UserQuota`, `Payment`, enum `PaymentType.subscription`.

**Тесты** поднимают БД через `alembic upgrade head` (`conftest.py`) — новые таблицы появятся **только после миграции этапа 3**; модели без миграции можно импортировать, но **нельзя** писать запросы к новым таблицам до upgrade.

**Обязательно на этапе 3:** добавить `plan` (и `tariff`) в `backend/migrations/env.py` — сейчас `plan` **не импортирован** в env (таблица живёт за счёт ручной миграции `plans_012`).

---

## 2. Текущая архитектура моделей

### SQLAlchemy Base

```python
# backend/database.py
Base = declarative_base()
```

Все модели наследуют `from backend.database import Base`. Отдельного `declarative_base()` в моделях нет.

### id, created_at, updated_at

| Паттерн | Где встречается | Пример |
| ------- | --------------- | ------ |
| `id = Column(Integer, primary_key=True, index=True)` | user, plan, market_access | `Plan`, `MarketAccessRequest` |
| `id = Column(Integer, primary_key=True)` без index | billing, team | `UserQuota`, `TeamMember` |
| `created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))` | большинство legacy-моделей | `Plan`, `Payment` |
| `created_at` + `updated_at` с `onupdate` | market, user_settings, bot | `MarketItem`, `UserSettings` |
| `_utcnow()` + `DateTime(timezone=True)` | constructor_core | `PlatformUser` |

**Рекомендация для новых тарифных моделей:** `id` с `index=True`; `created_at` и `updated_at` с `timezone.utc` (как в `market_access.py`), для журналов достаточно `created_at`.

### `__table_args__`

Почти везде: `__table_args__ = {"extend_existing": True}` — сохранять для совместимости с перезагрузкой metadata.

### Импорты в `backend/models/__init__.py`

- Явный импорт каждой модели из своего модуля.
- Публичный список `__all__`.
- Комментарий: *«Импортируем все модели для корректной работы SQLAlchemy relationships»*.
- `Plan` уже импортируется: `from backend.models.plan import Plan`.

**Стиль:** `from backend.models.<module> import Class1, Class2, Enum...` — не относительные импорты.

### Alembic

- `target_metadata = Base.metadata` в `backend/migrations/env.py`.
- Импорт модулей **по имени файла** (не `import backend.models` целиком).
- В списке env **нет** `plan` — при autogenerate таблица `plans` может не попасть в diff, если только `Plan` не подтянется транзитивно (сейчас не подтягивается).

### Тестовая БД

`backend/tests/conftest.py`:

1. `import backend.models` — регистрация всех таблиц в metadata.
2. `alembic upgrade head` на `test_botforg.db`.
3. Очистка данных между тестами через `DELETE` (таблица `plans` в `skip_tables`).

---

## 3. Текущая модель Plan

**Файл:** `backend/models/plan.py`  
**Таблица:** `plans` (создана в `plans_012`, developer в `plans_developer_013`).

| Поле | Тип | Примечание |
| ---- | --- | ---------- |
| `id` | Integer PK, index | |
| `code` | String(32), unique, index | free, pro, team, developer |
| `name` | String(128) | англ. имена в сидере |
| `limits` | JSON, not null | legacy-ключи: max_bots, can_publish, … |
| `created_at` | DateTime | **нет** `updated_at` |

**Связей ORM с `User` нет** — связь через `users.plan_code` (строка), не FK `plan_id`.

### Можно ли расширять Plan сейчас (до миграций)?

| Действие | Безопасность |
| -------- | ------------ |
| Добавить колонки в класс `Plan` без миграции | **Нет** — рассинхрон ORM и SQLite/Postgres; риск при `SELECT *` / autogenerate |
| Менять `limits` JSON только данными (seed) | Да, отдельная миграция данных на этапе 3 |
| Новые поля `name_ru`, `price_month`, … | Только **этап 3** (миграция + обновление модели) |
| Оставить `plan.py` как есть на 2.2 | **Да, рекомендуется** |

Справочник тарифов в финальной модели шире текущего JSON — расширение `limits` или новые колонки — **после** проектирования миграции и маппинга legacy `free` → `start`.

---

## 4. Есть ли workspace / рабочая область

| Сущность | Назначение | Тарифы |
| -------- | ---------- | ------ |
| `Workspace` | — | **Нет** (grep по `backend/` — 0 совпадений) |
| `TeamMember` | команда владельца (`owner_id` / `user_id`) | не billing workspace |
| `PlatformUser` (`constructor_core`) | отдельный контур ctor_* | не SaaS-ЛК |
| `users.plan_code` | текущий тариф пользователя | строка, не FK |

**Вывод:** привязка подписки и usage на этапе 2.2–3 — **`user_id` обязателен**; `workspace_id` — optional nullable без FK (или FK позже, когда появится таблица `workspaces`).

---

## 5. Какие новые модели нужны

Соответствие [TARIFFS_FINAL_CONCEPT.md §27](./TARIFFS_FINAL_CONCEPT.md):

| Модель (Python) | Таблица (предлагаемая) | Назначение |
| --------------- | ---------------------- | ---------- |
| `AddonPackage` | `addon_packages` | Каталог пакетов (messages / active_bot / team_member) |
| `UserSubscription` | `user_subscriptions` | Подписка пользователя на `plan_id`, период, статус |
| `UserAddon` | `user_addons` | Купленный/подаренный пакет на период |
| `UsageCounter` | `usage_counters` | Сообщения / active_bots / team за расчётный период |
| `GiftGrant` | `gift_grants` | Подарочный тариф/пакет от админа |
| `TariffAdminAuditLog` | `tariff_admin_audit_log` | Журнал изменений тарифов/пакетов/подарков |

**Не путать с существующим:**

- `UserQuota` — legacy лимит сообщений (оставить до отдельного этапа слияния).
- `Payment` — платёжные записи без связи с подпиской.
- `PlatformRole` — BF-роли, не billing.

**Имя `WorkspaceSubscription`:** отложить до появления `workspaces`; в коде заложить поле `workspace_id` nullable.

---

## 6. Где лучше разместить модели

### Рекомендация: один файл `backend/models/tariff.py`

**Плюсы:**

- Один домен, как `market_access.py` (enum + несколько моделей).
- Не раздувает `billing.py` (там legacy `UserQuota`).
- Не смешивает с устаревшим `plan.py` до миграции расширения `plans`.

**Структура файла:**

1. Модульные константы / `str, Enum` классы.
2. `AddonPackage`, `UserSubscription`, `UserAddon`, `UsageCounter`, `GiftGrant`, `TariffAdminAuditLog`.
3. `relationship` на `User` и `Plan` через строковые имена (`"User"`, `"Plan"`).

**Альтернатива (не рекомендуется на 2.2):**

- Разнести по `subscription.py`, `addon.py` — избыточно для 6 таблиц.
- Расширять `plan.py` новыми классами — допустимо, но хуже читаемость.

**Pydantic:** `backend/schemas/tariff.py` — **этап 2.3+** (после моделей), не в 2.2, если цель — только ORM.

---

## 7. Какие поля и связи использовать

### Общие правила

- FK: `ForeignKey("users.id", ondelete="CASCADE")` для пользовательских сущностей.
- FK: `ForeignKey("plans.id", ondelete="RESTRICT")` для каталога тарифов.
- FK: `ForeignKey("addon_packages.id", ondelete="RESTRICT")` для пакетов.
- Индексы на: `user_id`, `status`, `(user_id, period_start, period_end)` для usage.
- `Numeric(10, 2)` для цен — как в `Payment`.
- JSON для `old_value` / `new_value` в audit — как `Plan.limits`.

### AddonPackage (каталог)

- `code`, `name_ru`, `type` (enum), `amount` (int), `price`, `currency`
- `duration_type` (например `current_billing_period`)
- `available_from_plan_codes` (JSON array) или отдельная таблица M2M позже
- `is_active`, `is_public`, `is_gift_eligible`, `sort_order`

### UserSubscription

- `user_id` (NOT NULL), `workspace_id` (NULL)
- `plan_id` (FK plans)
- `status`, `current_period_start`, `current_period_end`
- `auto_renew`, `payment_provider`, `provider_subscription_id` (nullable)
- **Не удалять** `users.plan_code` на этапе 3 — dual-write позже

### UserAddon

- `user_id`, `workspace_id` (NULL)
- `addon_package_id`, `amount` (если дублировать из каталога)
- `period_start`, `period_end`, `status`, `source` (purchase | gift | admin)
- `created_by_admin_id` (nullable FK users)

### UsageCounter

- `user_id`, `workspace_id` (NULL)
- `period_start`, `period_end`
- `messages_used`, `active_bots_used`, `team_members_used`
- Unique: `(user_id, period_start)` или `(user_id, period_start, period_end)`

### GiftGrant

- `target_user_id`, `target_workspace_id` (NULL)
- `gift_type` (enum: plan | addon_messages | addon_bot | addon_team_member)
- `plan_id`, `addon_package_id`, `amount` (nullable по типу)
- `starts_at`, `ends_at`, `granted_by_user_id`, `reason`, `admin_comment`, `status`

### TariffAdminAuditLog

- `admin_user_id`, `action`, `entity_type`, `entity_id`
- `old_value`, `new_value` (JSON/Text)
- `comment`, `created_at`

### Связи с User (этап 2.2, опционально)

На 2.2 **не обязательно** добавлять `relationship` на `User` — достаточно FK с другой стороны, чтобы не трогать `user.py`. Если добавлять — только `backref` без cascade delete конфликтов с существующими.

---

## 8. Какие enum / константы нужны

Паттерн: `class X(str, enum.Enum)` + `SQLEnum(X)` в Column (как `MarketAccessRequestStatus`).

| Enum | Значения (черновик) |
| ---- | ------------------- |
| `AddonPackageType` | `messages`, `active_bot`, `team_member` |
| `SubscriptionStatus` | `active`, `past_due`, `canceled`, `expired`, `trialing` |
| `UserAddonStatus` | `active`, `expired`, `canceled` |
| `UserAddonSource` | `purchase`, `gift`, `admin` |
| `GiftType` | `plan`, `addon_messages`, `addon_active_bot`, `addon_team_member` |
| `GiftGrantStatus` | `active`, `expired`, `revoked` |
| `TariffAuditAction` | `create`, `update`, `deactivate`, `gift_grant`, … |
| `TariffAuditEntityType` | `plan`, `addon_package`, `gift_grant`, `user_subscription`, … |

**Константы модулей** (без БД): коды тарифов финальной сетки `start`, `business`, `business_pro`, `team`, `enterprise` — для будущего seed, **не** менять legacy codes в 2.2.

---

## 9. Что можно сделать на Этапе 2.2 безопасно

| Можно | Нельзя на 2.2 |
| ----- | ------------- |
| Создать `backend/models/tariff.py` с классами и enum | Alembic revision |
| Добавить импорты в `models/__init__.py` и `__all__` | Менять `plan.py`, `user.py`, `billing.py` |
| Добавить `tariff` в `migrations/env.py` (подготовка к autogenerate) | Роутеры, `plan_limits.py`, `POST /me/plan` |
| Проверка: `python -c "import backend.models"` | Запросы к новым таблицам в runtime |
| Проверка: `Base.metadata.tables` содержит новые имена | Тесты, которые INSERT в новые таблицы |
| Документировать табличные имена для этапа 3 | Сид новых тарифов в prod БД |

**Важно:** после 2.2 `alembic upgrade head` **не создаст** новые таблицы — это нормально. Существующие тесты должны проходить, если никто не обращается к новым таблицам.

---

## 10. Что нельзя делать до миграций

- Добавлять колонки в ORM `Plan` без revision.
- Менять `users.plan_code` / удалять legacy plans из БД.
- Подключать сервис лимитов к `UsageCounter` в `message.py` / `channel_runtime`.
- Заменять `UserQuota` одним махом.
- Писать админ-роуты, читающие `addon_packages`.
- Менять `POST /me/plan` на запись в `user_subscriptions`.
- Создавать FK `workspace_id` → несуществующая таблица (только nullable без FK или без колонки).

---

## 11. Какие миграции понадобятся на Этапе 3

Одна или несколько последовательных revisions (новые файлы, **не править** `plans_012` / `plans_developer_013`):

| # | Изменение |
| - | --------- |
| 1 | `CREATE TABLE addon_packages` + seed пакетов сообщений/ботов/команды |
| 2 | `CREATE TABLE user_subscriptions` + индексы |
| 3 | `CREATE TABLE user_addons` |
| 4 | `CREATE TABLE usage_counters` + unique constraint |
| 5 | `CREATE TABLE gift_grants` |
| 6 | `CREATE TABLE tariff_admin_audit_log` |
| 7 | `ALTER TABLE plans ADD` `name_ru`, `description_ru`, `price_month`, `currency`, `is_active`, `is_public`, `is_recommended`, `sort_order`, `updated_at` |
| 8 | Миграция данных: legacy codes → новые (отдельный data migration или SQL в upgrade) |
| 9 | (Опционально позже) `workspaces` + NOT NULL `workspace_id` |

**Enum в SQLite:** как в `market_access_020` — именованный `sa.Enum(..., name="...")`.

**env.py:** добавить `plan, tariff` в строку импорта модулей.

**ensure_migrations:** при необходимости расширить проверки колонок (по аналогии с `plan_code`) — отдельная задача.

---

## 12. Риски

| Уровень | Риск | Митигация |
| ------- | ---- | --------- |
| Высокий | Тесты/код обратятся к таблицам до migration | Не использовать новые модели в роутерах до этапа 3 |
| Высокий | Два источника тарифа: `plan_code` vs `user_subscriptions` | Dual-write на этапе 4–5, не на 2.2 |
| Средний | `plan` не в env.py — autogenerate пропускает `plans` | Исправить env на 2.2 или 3 |
| Средний | Имена enum в SQLite vs Postgres | Копировать паттерн `market_access_020` |
| Средний | `extend_existing` + новые таблицы | Стандарт проекта, оставить |
| Низкий | Конфликт имени `AdminAuditLog` | Префикс `TariffAdminAuditLog` / таблица `tariff_admin_audit_log` |
| Низкий | Import cycle tariff → user | Только string relationships, не импорт User в tariff |

---

## 13. Рекомендуемый следующий промпт для Этапа 2.2

```text
BotForg — Этап 2.2: добавить ORM-модели тарифной системы (без миграций и без бизнес-логики).

Прочитай:
- docs/TARIFFS_FINAL_CONCEPT.md
- docs/TARIFFS_CODE_AUDIT.md
- docs/TARIFFS_STAGE_2_PLAN.md

Сделай:
1. git status — дерево чистое.
2. Создай backend/models/tariff.py:
   - enum: AddonPackageType, SubscriptionStatus, UserAddonStatus, UserAddonSource,
     GiftType, GiftGrantStatus, TariffAuditAction, TariffAuditEntityType
   - модели: AddonPackage, UserSubscription, UserAddon, UsageCounter, GiftGrant, TariffAdminAuditLog
   - таблицы: addon_packages, user_subscriptions, user_addons, usage_counters,
     gift_grants, tariff_admin_audit_log
   - user_id NOT NULL; workspace_id Integer nullable без FK
   - FK на users.id и plans.id где нужно
   - created_at / updated_at по паттерну market_access.py
   - __table_args__ = {"extend_existing": True}
3. Обнови backend/models/__init__.py — импорт и __all__.
4. Добавь `plan, tariff` в backend/migrations/env.py (импорт модулей).
5. НЕ менять: plan.py, user.py, billing.py, routers, plan_limits.py, POST /me/plan.
6. НЕ создавать migrations, schemas, services, tests с INSERT в новые таблицы.

Проверки:
- python -c "import backend.models; from backend.models.tariff import UserSubscription; print('ok')"
- backend\venv\Scripts\python.exe -m pytest backend/tests/test_plans.py -v
  (регрессия — таблицы новых моделей ещё не в БД, тесты не должны их трогать)

Отчёт: What changed / Files / How to verify / Tests run / Risks.
Commit — только по явной просьбе.
```

---

## Связанные файлы (изучены в 2.1)

| Путь | Роль |
| ---- | ---- |
| `backend/database.py` | `Base`, engine, `get_db` |
| `backend/models/plan.py` | текущий `Plan` |
| `backend/models/user.py` | `plan_code`, без FK на plans |
| `backend/models/billing.py` | `UserQuota`, `BillingRecord` |
| `backend/models/payment.py` | `Payment`, enums |
| `backend/models/team.py` | `TeamMember` |
| `backend/models/platform_role.py` | BF-роли |
| `backend/models/__init__.py` | реестр моделей |
| `backend/models/market_access.py` | образец enum + индексы |
| `backend/migrations/env.py` | metadata, импорт модулей |
| `backend/migrations/versions/plans_012.py` | создание `plans` |
| `backend/tests/conftest.py` | alembic head + очистка данных |
