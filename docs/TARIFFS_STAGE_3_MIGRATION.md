# BotForg — Этап 3: Alembic-миграция тарифной системы (подэтапы 3.1 / 3.1.2)

**Подэтап 3.1:** создать migration-файл, **не применяя** (`alembic upgrade head` не запускался).

**Подэтап 3.1.2:** привести `tariff_system_007.py` к PostgreSQL-ready (seed/DDL), зафиксировать риски auto-migrate. **`alembic upgrade head` по-прежнему не выполнялся.**

**Результат:** `backend/migrations/versions/tariff_system_007.py` (PostgreSQL-ready seed, без `datetime('now')` в SQL).

---

## 1) Какая миграция создана

- `backend/migrations/versions/tariff_system_007.py`
  - `revision = "tariff_system_007"`
  - `down_revision = "market_access_020"` (текущий head на момент подготовки)

---

## 2) Какие таблицы создаются

В `upgrade()` создаются новые таблицы:

1. `addon_packages`
2. `user_subscriptions`
3. `user_addons`
4. `usage_counters`
5. `gift_grants`
6. `admin_audit_log`

Enum-типы создаются именованно:

- `addonpackagetype`
- `subscriptionstatus`
- `useraddonstatus`
- `useraddonsource`
- `gifttype`
- `giftgrantstatus`

Также добавляются индексы и уникальные ограничения:

- `usage_counters`: unique (`user_id`, `period_start`, `period_end`) как `uq_usage_counters_user_period`.

---

## 3) Какие поля добавляются в `plans`

Migration расширяет существующую таблицу `plans` (добавляет колонки **только если их нет**):

- `name_ru` (String(255))
- `description_ru` (Text)
- `price_month` (Numeric(10,2))
- `currency` (String(10))
- `is_active` (Boolean)
- `is_public` (Boolean)
- `is_recommended` (Boolean)
- `sort_order` (Integer)

Колонки добавляются `nullable=True`, чтобы не ломать существующие legacy-записи.

---

## 4) Какие тарифы seed-ятся

Migration делает upsert (insert/update при наличии) для кодов:

- `start`
- `business`
- `business_pro`
- `team`
- `corporate`

В `limits` записываются:

- legacy-ключи (`max_bots`, `can_publish`, `can_use_analytics`, `max_team_members`)
- и новые ключи финальной модели (`active_bots`, `monthly_messages`, …).

Для совместимости с текущими checks добавление новых ключей не должно ломать логику, которая читает legacy-поля.

---

## 5) Какие пакеты seed-ятся

Migration seed-ит `addon_packages` с upsert по `code`:

- `msg_1000` (+1000 сообщений) — `190`
- `msg_3000` (+3000 сообщений) — `490`
- `msg_5000` (+5000 сообщений) — `790`
- `msg_10000` (+10000 сообщений) — `1490`
- `bot_1` (+1 активный бот) — `590`
- `member_1` (+1 участник команды) — `490`  (как в концепции, несмотря на возможные старые значения)

---

## 6) PostgreSQL-ready (подэтап 3.1.2)

### Что исправлено в `tariff_system_007.py`

- Seed планов и `addon_packages` через `sa.insert` / `sa.update` и `sa.table`, без raw SQLite upsert.
- Все `created_at` / `updated_at` в seed — Python `datetime.now(timezone.utc)`.
- Boolean в seed — Python `bool`, не `0/1` в SQL.
- DDL: `server_default=CURRENT_TIMESTAMP` вместо `datetime('now')`.
- Boolean DDL: `true`/`false` на PostgreSQL, `1`/`0` на SQLite.
- Именованные ENUM: `create(checkfirst=True)` перед `create_table`, `drop` в `downgrade`.
- `available_from_plan`: строковый код тарифа (`start`, `business`, …) в JSON-колонке (не `json.dumps`).

### Деньги (Numeric)

- `plans.price_month` — `Numeric(10, 2)`.
- `addon_packages.price` — `Numeric(10, 2)`.
- `Float` не используется.
- Для MVP `Numeric` достаточен; для международной архитектуры позже можно рассмотреть `price_minor_units` (integer), но это **не блокер** этапа 3.2.

### Валюта

- Seed и defaults: ISO-код **`RUB`** (не символ `₽`).

### UTC

**Правило:** в production все даты тарифов, пакетов, подписок, подарков и платежей хранятся в **UTC**. Пользователю дата показывается в его timezone (`user_settings.timezone`).

### i18n (отложено)

- В миграции остаются `name_ru` / `description_ru` — **допустимо для MVP**.
- Перед международным production нужен отдельный этап i18n:
  - либо `name_i18n` / `description_i18n` (JSON);
  - либо отдельная таблица переводов.
- **Не добавлять** i18n-поля в эту миграцию без отдельного решения.

### `available_from_plan`

- MVP: в JSON хранится **строковый код** минимального тарифа (`start`, `business`, `business_pro`, `team`).
- Риск: одно поле не покрывает несколько тарифов; для future-ready лучше junction-таблица `addon_package_plan_eligibility` — **не блокер** 3.2.

### Auto-migrate (критично до ручного upgrade)

Пока `tariff_system_007` не утверждена и не применена **вручную**, **нельзя запускать backend в development** с включённым auto-migrate: `ensure_dev_sqlite_migrations_applied()` в lifespan выполнит `alembic upgrade head` и применит tariff автоматически.

Код `ensure_migrations` **не менялся** на 3.1.2.

**Будущий этап (рекомендация):** добавить защиту dev auto-migrate — не применять новые risk migrations автоматически без явного флага (например `ALLOW_AUTO_MIGRATE_TARIFF=true`).

---

## Результат PostgreSQL-проверки tariff_system_007 (этап 3.2-PG, 2026-06-02)

### Инфраструктура

| Проверка | Результат |
|----------|-----------|
| Docker доступен | **да** — Docker 29.5.2, Compose v5.1.4 |
| Сервис PostgreSQL в `docker-compose.yml` | **`postgres`** — `postgres:15-alpine`, порт `5432`, user `botforg`, password `botforg_secret`, default DB `botforg` |
| Контейнер поднят | **да** — `docker compose up -d postgres` |
| Тестовая БД | **`botforg_tariff_migration_test`** (отдельная, не production) |
| `DATABASE_URL` | `postgresql://botforg:botforg_secret@localhost:5432/botforg_tariff_migration_test` |
| Backend / uvicorn | **не запускались** |
| Commit / push | **не делались** |

### Alembic на PostgreSQL

| Шаг | Результат |
|-----|-----------|
| `alembic upgrade head` (только `tariff_system_007` от `market_access_020`) | **прошёл** → `tariff_system_007 (head)` |
| `alembic downgrade market_access_020` | **прошёл** → `market_access_020` |
| Повторный `alembic upgrade head` | **прошёл** → `tariff_system_007 (head)` |

**Правка в миграции во время PG-прогона:** убрано явное `_create_enums()` перед `create_table` — на PostgreSQL давало `DuplicateObject: type "addonpackagetype" already exists` (enum создавался дважды).

### Проверки схемы и seed (raw SQL на PG)

| Проверка | Результат |
|----------|-----------|
| Таблицы `addon_packages`, `user_subscriptions`, `user_addons`, `usage_counters`, `gift_grants`, `admin_audit_log` | **созданы** (`missing tables: []`) |
| Колонки `plans`: `name_ru`, `description_ru`, `price_month`, `currency`, `is_active`, `is_public`, `is_recommended`, `sort_order` | **добавлены** (`missing plan columns: []`) |
| Seed тарифов | **да** — `start`, `business`, `business_pro`, `team`, `corporate` |
| Seed пакетов | **да** — `msg_1000`, `msg_3000`, `msg_5000`, `msg_10000`, `bot_1`, `member_1` |
| **member_1 price** | **490.00** RUB |

### Основная SQLite dev-БД

| Проверка | Результат |
|----------|-----------|
| `botforg.db` после сброса `DATABASE_URL` | **`market_access_020`** (без `tariff_system_007`) |
| Таблица `addon_packages` в SQLite | **отсутствует** |
| Миграция применялась к `botforg.db` | **нет** |

### Ограничения прогона (важно)

1. **Полная цепочка миграций с нуля на PG не прошла** — падение на legacy `472098a6ab59_add_scenarios_table.py` (`type "datetime" does not exist`). Это **не** `tariff_system_007`; правка legacy-миграций вне scope 3.2-PG.
2. **Изолированная проверка `tariff_system_007`:** на чистой тестовой БД подготовлен минимальный schema bootstrap (`users`, `plans`, `alembic_version` = `market_access_020`), затем `upgrade head` / `downgrade` / `upgrade head`.
3. **ORM vs PG:** проверки через `Plan` / `AddonPackage` на PG могут давать `None` или `LookupError` из‑за рассинхрона моделей и PG ENUM labels — **данные в БД корректны** (подтверждено raw SQL). Синхронизация моделей — отдельный этап после применения миграции.

### Как повторить проверку

```powershell
docker compose up -d postgres
docker compose exec postgres createdb -U botforg botforg_tariff_migration_test  # если ещё нет
$env:DATABASE_URL="postgresql://botforg:botforg_secret@localhost:5432/botforg_tariff_migration_test"
# bootstrap до market_access_020 или stamp — см. ограничения выше
backend\venv\Scripts\python.exe -m alembic upgrade head
backend\venv\Scripts\python.exe -m alembic current
backend\venv\Scripts\python.exe -m alembic downgrade market_access_020
backend\venv\Scripts\python.exe -m alembic upgrade head
Remove-Item Env:DATABASE_URL
backend\venv\Scripts\python.exe -m alembic current   # ожидается market_access_020 на botforg.db
```

**Backend-тесты (`pytest`):** на этапе 3.2-PG **не запускались** (`conftest.py` использует отдельную SQLite `test_botforg.db`).

---

## 7) Риски

### Конфликт `team` (legacy)

План с `code='team'` уже существует как legacy. На `downgrade` seed `team` не удаляется (чтобы не уничтожить потенциально существующие данные).

На `upgrade` для `team` значения `limits` обновляются так, чтобы не менять поведение текущих проверок (сохраняются legacy-ключи).

Риск: если в БД legacy `team` уже отличается (не seed от `plans_012`), то обновление `limits` может повлиять на текущую логику.

---

## 8) Что проверить перед `alembic upgrade head`

1. `python -m alembic current` — убедиться, что `head` ожидаемый.
2. `python -m alembic history` — убедиться, что `down_revision` корректный.
3. Проверить, что migration-файл не содержит опечаток в именах таблиц/колонок.
4. После upgrade на тестовой базе:
   - наличие новых таблиц
   - наличие новых колонок в `plans`
   - отсутствие дублей `addon_packages.code`

---

## 9) Статус `alembic upgrade` (обновлено после 3.3)

- На **основной SQLite dev-БД** (`botforg.db`): `upgrade head` выполнен **вручную** — `current` = `tariff_system_007 (head)`.
- На **тестовой PostgreSQL** `botforg_tariff_migration_test`: проверка 3.2-PG — см. раздел «Результат PostgreSQL-проверки».

Проверки:

```bash
python -m alembic current   # botforg.db → tariff_system_007 (head)
python -m alembic heads     # tariff_system_007 (head)
```

---

## Результат Этапа 3.3 — SQLite dev + ORM Plan (2026-06-02)

| Пункт | Результат |
|-------|-----------|
| Backup SQLite | **`botforg_before_tariff_system_007.db`** (в корне проекта, в `.gitignore`) |
| Alembic до upgrade | `market_access_020` |
| Alembic после upgrade | **`tariff_system_007 (head)`** |
| `DATABASE_URL` | `sqlite:///C:/Users/mamon/botforg/botforg.db` (без PG) |
| 6 новых таблиц | **созданы** |
| 8 колонок `plans` | **добавлены** |
| ORM `Plan` | **синхронизирован** (`backend/models/plan.py`) |
| Seed тарифов (ORM) | **да** — `start`, `business`, `business_pro`, `team`, `corporate` |
| Seed пакетов (SQL) | **да** — 6 кодов; `member_1` price = **490** |
| Seed пакетов (ORM `AddonPackage`) | **да** — после `values_callable` в `tariff.py` (см. «Дополнение: ORM Enum mapping») |
| Import-check | **ok** |
| `pytest backend/tests -q` | **192 passed**, 4 xfailed (после правки `limits` в seed миграции) |
| Backend/uvicorn | **не запускались** |
| Commit/push | **не делались** |

### Правка миграции в 3.3

В `_upsert_plan` поле `limits` передаётся как **dict**, не `json.dumps(...)` — иначе SQLite/API возвращали строку JSON и падал `GET /plans` (`ResponseValidationError`).

После правки на dev-БД выполнен `alembic downgrade market_access_020` → `upgrade head` для пересида.

### Остаточные риски

1. **Auto-migrate** — при запуске uvicorn `ensure_dev_sqlite_migrations_applied()` уже не применит миграцию повторно (revision на head), но новые risk-migrations по-прежнему опасны без флага.
2. **Полная PG-цепочка** — legacy `472098a6ab59` (см. 3.2-PG).

---

## Дополнение: ORM Enum mapping

После применения миграции было обнаружено, что БД хранит enum value (`messages`), а SQLAlchemy Enum по умолчанию ожидал enum name (`MESSAGES`).  
Исправлено в `backend/models/tariff.py` через `values_callable`, чтобы ORM читал и писал enum values.  
Бизнес-логика не менялась, миграции не добавлялись.

Затронутые поля: `AddonPackage.type`, `UserSubscription.status`, `UserAddon.status`, `UserAddon.source`, `GiftGrant.gift_type`, `GiftGrant.status`.  
`AddonPackage.duration_type` и `AdminAuditLog.action` / `entity_type` — `String`, без изменений.

---

## 10) Следующий подэтап: 3.4

1. Staging PostgreSQL: полная цепочка или fresh install.
2. UI/API тарифов — отдельные этапы (роутеры не менялись в 3.3).

