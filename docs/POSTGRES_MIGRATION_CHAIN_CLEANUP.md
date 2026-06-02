# BotForg — PostgreSQL migration chain cleanup

## 1. Причина этапа

Перед продолжением тарифной системы (UI, API, биллинг) нужно закрыть инфраструктурный долг: **полная цепочка Alembic с пустой PostgreSQL-БД** должна доходить до `head` (`tariff_system_007`). На этапе 3.2-PG тарифная миграция проходила изолированно, но `alembic upgrade head` с нуля на PostgreSQL падал на legacy-миграциях.

## 2. Исходная проблема

При `DATABASE_URL=postgresql://…/botforg_pg_chain_test` и пустой БД:

```text
python -m alembic upgrade head
```

падал на первой блокирующей legacy-миграции:

| Revision | Файл | Ошибка |
|----------|------|--------|
| `472098a6ab59` | `472098a6ab59_add_scenarios_table.py` | `type "datetime" does not exist` — raw SQL с `DATETIME`, `CREATE TABLE IF NOT EXISTS` в стиле SQLite |

После исправления `472098a6ab59` всплывали следующие блокеры по цепочке (см. раздел 3).

Дополнительно: миграция `58ddbef24e18` содержала `conn.commit()` внутри `upgrade()`, что на PostgreSQL с transactional DDL приводило к **рассинхрону** `alembic_version` и фактической схемы (колонки применялись, revision не обновлялся).

## 3. Что исправлено

| Файл | Исправление |
|------|-------------|
| `472098a6ab59_add_scenarios_table.py` | Raw SQLite DDL заменён на `op.create_table` / `sa.DateTime()` / `sa.JSON()` с проверкой `sa.inspect().has_table()` и `_ensure_index()` |
| `58ddbef24e18_add_status_and_metadata_to_bot_user_.py` | Убраны `conn.commit()`; `column_exists` через SQLAlchemy inspector для SQLite и PostgreSQL; параметризованные `UPDATE` |
| `cef39c593384_add_missing_columns_to_bot_user_states.py` | `column_exists` через inspector (раньше на PG всегда возвращал `False`) |
| `plans_012.py` | Seed планов: `datetime('now')` заменён на Python `datetime.now(timezone.utc)` с bind-параметрами |
| `plans_developer_013.py` | То же для плана `developer`; идемпотентная вставка (`SELECT` перед `INSERT`) |
| `market_moderation_014.py` | `is_published = 1` → `is_published IS TRUE` на PostgreSQL |
| `constructor_core_015.py` | `server_default` для boolean: `true`/`false` на PG, `1`/`0` на SQLite |

Смысл схемы, таблицы и колонки **не удалялись**. Тарифная миграция `tariff_system_007` **не менялась**.

## 4. Что проверено

- Чистая PostgreSQL-БД `botforg_pg_chain_test` (drop/create).
- Полный `alembic upgrade head` до `tariff_system_007`.
- `alembic current` → `tariff_system_007 (head)`.
- Наличие ключевых таблиц (`users`, `plans`, `bots`, `scenarios`, `market_items`, `market_access_requests`, `addon_packages`, `user_subscriptions`, `user_addons`, `usage_counters`, `gift_grants`, `admin_audit_log`) — `ok: True`.
- `alembic downgrade market_access_020` → `market_access_020`; повторный `upgrade head` → `tariff_system_007`.
- SQLite dev-БД: после сброса `DATABASE_URL` — `tariff_system_007 (head)`, данные не пересоздавались.
- `pytest backend/tests -q` → **192 passed, 4 xfailed**.
- Backend/uvicorn **не запускались**.

## 5. Оставшиеся риски

- **Уже применённые «битые» PG-БД** (схема впереди `alembic_version`, например после старой версии `58ddbef` с `conn.commit()`): нужен drop/recreate или ручной `alembic stamp` + догонка — не входит в этот этап.
- Legacy `server_default='1'` на boolean в более ранних миграциях (`24c606c213ea`, `3a8f2b1c4d5e`, `d12ffa05e4c0`) на PG проходят; при будущих правках лучше выравнивать на паттерн `true`/`false`.
- `cadf51a204bd` без `has_table` — на чистой цепочке OK; повторный запуск на частично применённой БД может дать `DuplicateColumn` (как и раньше).

## 6. Как повторить проверку

```powershell
# из корня репозитория
docker compose up -d postgres

docker compose exec postgres dropdb -U botforg botforg_pg_chain_test --if-exists
docker compose exec postgres createdb -U botforg botforg_pg_chain_test

$env:DATABASE_URL = "postgresql://botforg:botforg_secret@localhost:5432/botforg_pg_chain_test"
backend\venv\Scripts\python.exe -m alembic upgrade head
backend\venv\Scripts\python.exe -m alembic current

backend\venv\Scripts\python.exe -c "from backend.database import engine; from sqlalchemy import inspect; i=inspect(engine); tables=set(i.get_table_names()); expected={'users','plans','bots','scenarios','market_items','market_access_requests','addon_packages','user_subscriptions','user_addons','usage_counters','gift_grants','admin_audit_log'}; print('missing:', sorted(expected-tables)); print('ok:', expected.issubset(tables))"

backend\venv\Scripts\python.exe -m alembic downgrade market_access_020
backend\venv\Scripts\python.exe -m alembic upgrade head

Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
backend\venv\Scripts\python.exe -m alembic current

backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

Ожидаемый `alembic current` на PG и SQLite после upgrade: `tariff_system_007 (head)`.
