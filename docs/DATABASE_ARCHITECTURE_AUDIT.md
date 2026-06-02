# BotForg — аудит базы данных и архитектуры хранения данных

**Дата аудита:** 2026-06-02  
**Режим:** только чтение и анализ (код, модели, миграции, локальные `.db` не изменялись).  
**Миграции:** `alembic upgrade head` **не выполнялся**.  
**Untracked Этап 3.1:** `backend/migrations/versions/tariff_system_007.py`, `docs/TARIFFS_STAGE_3_MIGRATION.md` — на месте, не применялись.

---

## 1. Краткий вывод

BotForg уже имеет **зрелую реляционную схему на SQLAlchemy + Alembic** (~71 таблица в актуальной dev-БД), с отдельными доменами: auth, bots/scenarios, constructor CRM (`ctor_*`), marketplace, billing, analytics, chat, legal/152-ФЗ.

**Production-цель (PostgreSQL + Redis)** отражена в `env.production.template`, `docker-compose.yml`, CI и `backend/database.py` (pool, timeouts), но **локальная разработка по умолчанию — SQLite** в корне репозитория (`botforg.db`), с **авто-миграцией при старте uvicorn** в `development`.

**Тарифный Этап 3:** модели `backend/models/tariff.py` и миграция `tariff_system_007` подготовлены, но **в БД ещё не применены** (версия Alembic `market_access_020`, tariff-таблиц нет). После **3.1.2** миграция **PostgreSQL-ready по синтаксису seed/DDL**; staging-прогон на PG ещё не выполнялся.

**Международный SaaS:** деньги в основном через `Numeric`, но валюта/локализация **ориентированы на RU** (`RUB`, `name_ru`, `language=ru`, `Europe/Moscow`). Сущности **workspace** в тарифах только как nullable `workspace_id` без таблицы и FK. Тарификация завязана на **`user_id` / `users.plan_code` / `user_quotas`**.

**Рекомендуемый следующий шаг (на момент аудита):** **не применять** `tariff_system_007` до PostgreSQL-ready правок миграции и прогона на PostgreSQL (как в CI/docker); параллельно устранить риск **двух SQLite-файлов** и авто-upgrade при dev-старте.

**Обновление (подэтап 3.1.2, 2026-06-02):** `tariff_system_007.py` приведён к PostgreSQL-ready (см. `docs/TARIFFS_STAGE_3_MIGRATION.md` §6). `alembic upgrade head` **всё ещё не выполнялся**; `current` остаётся `market_access_020`.

---

## 2. Какие БД сейчас используются

| Контекст | СУБД | Файл / URL | Назначение |
|----------|------|------------|------------|
| Локальная разработка (дефолт) | SQLite | `C:/Users/mamon/botforg/botforg.db` | Основная dev-БД (якорится из `backend/settings.py`) |
| Backend-тесты (pytest) | SQLite | `C:/Users/mamon/botforg/test_botforg.db` | Отдельная test DB (`backend/tests/conftest.py`) |
| Устаревшая копия | SQLite | `C:/Users/mamon/botforg/backend/botforg.db` | **Не актуальна** (Alembic `safe_missing_orm_tables_019`, нет `market_access_*`) |
| Production (целевой) | PostgreSQL | `env.production.template`, `docker-compose.yml` | Целевая prod-СУБД |
| Production (legacy-шаблон) | SQLite допускается | `env.production.example` | Временный вариант для РФ-файла — **не цель для масштаба** |
| CI (workflow) | PostgreSQL service | `postgresql://test:test@localhost:5432/test_botforg` | Заявлен в `.github/workflows/ci.yml` |
| CI (факт pytest) | SQLite перезаписывается | `test_botforg.db` | `conftest.py` **принудительно** выставляет SQLite URL |

**Redis:** опционален в dev (`STRICT_REDIS=false`), обязателен в production при `STRICT_REDIS` (`backend/main.py` readiness).

---

## 3. Конфигурация DATABASE_URL

### Файлы

| Файл | Статус | Содержание по БД |
|------|--------|------------------|
| `backend/database.py` | есть | `DATABASE_URL = settings.DATABASE_URL`; SQLite vs PG engine kwargs |
| `backend/config.py` | **отсутствует** | Конфигурация в `backend/settings.py` |
| `backend/settings.py` | есть | `DATABASE_URL`, якорь SQLite к корню репо |
| `backend/main.py` | есть | startup: `ensure_dev_sqlite_migrations_applied()` |
| `.env` (корень) | **не прочитан** (Permission denied) | Реальные локальные значения недоступны агенту |
| `.env.example` | есть | `DATABASE_URL=sqlite:///./botforg.db` |
| `backend/.env` | **не прочитан** (Permission denied) | Основной источник для backend (см. `settings`) |
| `backend/.env.example` | есть | SQLite по умолчанию |
| `env.production.template` | есть | **PostgreSQL** + Redis, `DATA_REGION=RU` |
| `env.production.example` | есть | SQLite path в `/opt/botforg/data/` |
| `alembic.ini` | есть | fallback `sqlalchemy.url = sqlite:///./botforg.db` |
| `backend/migrations/env.py` | есть | URL из `settings.DATABASE_URL` |

### Откуда берётся `DATABASE_URL`

1. **Pydantic Settings** (`backend/settings.py`): env-файл `backend/.env` (если есть), иначе `.env` в корне.
2. Дефолт: `sqlite:///./botforg.db`.
3. **Валидатор `_anchor_dev_sqlite_url`:** при дефолтном URL подставляется абсолютный путь `sqlite:///{repo_root}/botforg.db` — чтобы Alembic и uvicorn видели **один файл** независимо от cwd.

Проверено: `python -c "from backend.settings import settings; print(settings.DATABASE_URL)"` → `sqlite:///C:/Users/mamon/botforg/botforg.db`.

### Режимы development / test / production

| Режим | Признак | БД |
|-------|---------|-----|
| development | `ENVIRONMENT=development` | SQLite (типично) |
| test | `TESTING=true` | SQLite `test_botforg.db` (conftest) |
| production | `ENVIRONMENT=production` | PostgreSQL (рекомендовано); SQLite не для CRM aggregate loop |

### PostgreSQL в шаблонах

- **Да:** `env.production.template`, `docker-compose.yml`, комментарии в `README.md` / `docs/DEPLOYMENT.md`.
- **Нет как дефолт dev:** `.env.example`, `backend/.env.example`, `alembic.ini`.

### SQLite fallback

- Явный дефолт для local dev и примеров.
- `backend/database.py`: `check_same_thread=False` для SQLite.
- `ensure_migrations`: авто `upgrade head` **только** SQLite + `ENVIRONMENT=development`.

### Автозапуск миграций при старте

- **Да (dev SQLite):** `backend/services/ensure_migrations.py` → `alembic upgrade head` в lifespan (`backend/main.py`).
- **Важно:** при следующем запуске backend в dev **применится** `tariff_system_007`, если файл миграции в `versions/` — это против текущего решения «остановить до отдельного решения». Нужно не стартовать uvicorn с auto-migrate или временно исключить миграцию из цепочки (организационно, не делалось в аудите).

### Отдельная test database

- **Да:** `test_botforg.db` в корне репозитория.
- `conftest.py` удаляет файл (если возможно), затем `command.upgrade(..., "head")`.

### Как Alembic получает URL

`backend/migrations/env.py`:

```python
url = getattr(settings, "DATABASE_URL", "sqlite:///botforg.db")
config.set_main_option("sqlalchemy.url", url)
```

Тесты дополнительно переопределяют URL в `Config` перед `upgrade`.

---

## 4. Локальные SQLite-файлы

| Путь | Размер (прибл.) | Alembic version | Используется проектом? |
|------|-----------------|-----------------|------------------------|
| `botforg.db` (корень) | ~4.2 MB | `market_access_020` | **Да** — resolved `DATABASE_URL` |
| `test_botforg.db` | ~1.2 MB | `market_access_020` | **Да** — pytest |
| `backend/botforg.db` | ~1.5 MB | `safe_missing_orm_tables_019` | **Нет** — устаревшая копия |

### Gitignore

В `.gitignore`: `*.db`, `botforg.db`, `test_botforg.db` — **локальные БД не должны коммититься**.

### Риски

- **Средний:** скрипты/доки (`reset_password.py`, `docs/user/QUICK_START.md`) ссылаются на `backend/botforg.db` — путаница со схемой.
- **Низкий:** случайный commit `.db` при снятии ignore (сейчас защищено).

---

## 5. Alembic: состояние миграций

Команды (без `upgrade`):

| Команда | Результат |
|---------|-----------|
| `python -m alembic current` | **`market_access_020`** (SQLiteImpl) |
| `python -m alembic heads` | **`tariff_system_007` (head)** — одна голова |
| `python -m alembic history` | линейная цепочка **~34 revision-файла** от `24b5f3912745_init` |

### Несколько heads

**Нет** — единственный head: `tariff_system_007` (файл untracked, в истории Alembic уже виден).

### Битая кодировка в описаниях

В `alembic history` у части ревизий docstring отображается как mojibake (например `safe_missing_orm_tables_019`, `ctor_user_environment_017`). На выполнение DDL не влияет, но **усложняет сопровождение**.

### Миграции с SQLite-спецификой

| Миграция | Признак |
|----------|---------|
| `472098a6ab59_add_scenarios_table.py` | `CREATE TABLE IF NOT EXISTS`, raw SQL |
| `58ddbef24e18_*`, `cef39c593384_*` | `PRAGMA table_info` |
| `marketplace_tables_001.py` | комментарии про SQLite ENUM/CHECK |
| `scenario_*`, `add_users_public_id_007` | `batch_alter_table` |
| ~~`tariff_system_007.py`~~ | ~~`datetime('now')`, boolean `0/1` в seed~~ — **исправлено в 3.1.2** |

### Потенциально проблемные для PostgreSQL

| Проблема | Где | Критичность |
|----------|-----|-------------|
| ~~`datetime('now')` в seed/DDL~~ | `tariff_system_007.py` | **Снято в 3.1.2** |
| `sa.Enum(...)` без `create_type=False` / dialect branch | `tariff_system_007`, chat/market migrations | Средняя (дубли типов при повторном deploy) |
| `JSON` вместо `JSONB` | многие миграции | Низкая–средняя (производительность PG) |
| `crm_perf_indexes_018` | `pg_trgm` только при `dialect == postgresql` | OK (условно) |

### Политика «не править применённые миграции»

Уже применённые ревизии до `market_access_020` трогать нельзя. **`tariff_system_007` ещё не применён** — его можно и нужно править до первого `upgrade`.

---

## 6. Модели и таблицы проекта

Источник: `backend/models/` (37 файлов), регистрация через `backend/models/__init__.py` (импорт **всех** моделей при загрузке пакета).

### Сводка по зонам

| Зона | Модели (класс) | Таблицы |
|------|------------------|---------|
| **users/auth** | `User`, `UserSettings`, `Account`, `EmailVerification`, `PasswordReset`, `TokenBlacklist` | `users`, `user_settings`, `accounts`, `email_verifications`, `password_resets`, `token_blacklist` |
| **plans/tariffs** | `Plan`; tariff: `AddonPackage`, `UserSubscription`, `UserAddon`, `UsageCounter`, `GiftGrant`, `AdminAuditLog` | `plans`; tariff-таблицы **только после миграции** |
| **payments/billing** | `Payment`, `BillingRecord`, `UserQuota`, `UserBonusAccount`, `Purchase` | `payments`, `billing_records`, `user_quotas`, `user_bonus_accounts`, `purchases` |
| **marketplace** | `MarketItem`, `MarketOrder`, `OrderProposal`, `FreelancerProfile`, `MarketReview` | `market_items`, `market_orders`, `order_proposals`, `freelancer_profiles`, `market_reviews` |
| **market_access** | `MarketAccessRequest`, `MarketItemAccessGrant` | `market_access_requests`, `market_item_access_grants` |
| **bots** | `Bot`, `BotInstance`, `BotChannelConnection`, `ProcessedUpdate` | `bots`, `bot_instances`, `bot_channel_connections`, `processed_updates` |
| **scenarios** | `Scenario`, `ScenarioVersion` | `scenarios`, `scenario_versions` |
| **templates** | `Template`, `UserTemplate`, `BotTemplate`, `Tag` (+ `template_tags`) | `templates`, `user_templates`, `bot_templates`, `tags`, `template_tags` |
| **teams/roles** | `TeamMember`, `PlatformRole`, `BaseRole`, `BFTeamMember` | `team_members`, `platform_roles`, `base_roles`, `bf_team_members` |
| **analytics/events** | `Event`, `ScenarioExecution`, `DailyStats`, `ScenarioEvent`, `UserSession` | `events`, `scenario_executions`, `daily_stats`, `scenario_events`, `user_sessions` |
| **CRM (legacy)** | `BotUserState`, `BotTag`, `Message` | `bot_user_states`, `bot_tags`, `bot_contact_tags`, `messages` |
| **CRM (constructor)** | `CtorBot`, `CtorBotUser`, `CtorScenario`, `CtorBlock`, …, `CtorCrmOverviewAggregate` | `ctor_*`, `ctor_crm_overview_aggregates` |
| **nodes/edges/editor** | `Node`, `Edge` | `nodes`, `edges` |
| **chat** | `ChatRoom`, `ChatMessage`, … | `chat_*`, `friendships`, … |
| **legal** | `Consent` | `consents` |
| **platform** | `PlatformUser` | `platform_users` |

### `backend/models/__init__.py`

Подключены все перечисленные домены, включая **tariff-модели** (строки 47–60) и `market_access`.

### `backend/migrations/env.py`

Импортирует подмножество модулей, но из‑за выполнения `backend/models/__init__.py` в metadata попадают **все** зарегистрированные модели.

### Расхождения модель ↔ миграция ↔ БД

| Наблюдение | Детали |
|------------|--------|
| Tariff-таблицы | Модели есть, миграция есть, **в БД нет** (ожидаемо) |
| `Plan` ORM | В модели **нет** полей `name_ru`, `price_month`, `currency`, … — миграция их добавит; ORM не синхронизирован с будущей схемой |
| `users.plan_code` | Legacy-поле; параллельно планируется `user_subscriptions` |
| `user_quotas` vs `usage_counters` | Две модели учёта сообщений; billing API использует **`user_quotas`** |
| `workspace_id` | В tariff-моделях nullable **без FK** и без таблицы `workspaces` |

---

## 7. Что есть в текущей локальной БД

**Источник:** `C:/Users/mamon/botforg/botforg.db` (71 таблица).

### Ключевые таблицы

| Таблица | Есть? |
|---------|-------|
| `users` | да |
| `plans` | да (4 строки: `free`, `pro`, `team`, `developer`) |
| `user_quotas` | да |
| marketplace (`market_items`, …) | да |
| `market_access_requests`, `market_item_access_grants` | да |
| tariff (`addon_packages`, `user_subscriptions`, …) | **нет** |

### Колонки (выборочно)

**`users`:** `id`, `email`, `name`, `role`, `plan_code`, `public_id`, `token_version`, suspension-поля, …

**`plans`:** `id`, `code`, `name`, `limits` (JSON), `created_at` — **без** tariff-колонок (`name_ru`, `price_month`, …).

**`user_quotas`:** `user_id`, `monthly_limit`, `used_messages`, `updated_at`.

**`market_items`:** включает `price NUMERIC(10,2)`, `moderation_status`, без отдельного `currency`.

---

## 8. Готовность к PostgreSQL

### Уже хорошо

- `backend/database.py`: connection pool, `pool_pre_ping`, `statement_timeout` / `lock_timeout` для PG.
- `crm_perf_indexes_018`: GIN `pg_trgm` под PostgreSQL.
- `docker-compose.yml`, `env.production.template`: PostgreSQL как prod-цель.
- Денежные поля в моделях: **`Numeric`**, не `Float`.

### Допустимо для local dev

- SQLite file в корне репозитория.
- `batch_alter_table`, `PRAGMA` в старых миграциях (уже применены).
- JSON вместо JSONB.
- Naive `DateTime` в legacy-моделях (часть таблиц).

### Опасно для production

- SQLite как prod (`env.production.example`).
- ~~`tariff_system_007` с `datetime('now')`~~ — снято в 3.1.2; остаётся риск **непрогнанного** upgrade на PG.
- Синхронная обработка webhooks в HTTP-запросе (`channel_webhooks.py` → `process_channel_update`).
- Инкремент `user_quotas.used_messages` без row-level locking / atomic UPDATE — гонки при нескольких воркерах.
- Рост `events`, `ctor_bot_user_events`, `messages` без партиционирования/TTL на уровне БД.
- CRM full-text на SQLite dev без `pg_trgm` (на PG будет лучше).

### До международного запуска

- Единый prod URL PostgreSQL + Redis `STRICT_REDIS=true`.
- Прогон всех **новых** миграций на PostgreSQL в staging.
- Timezone-aware `DateTime(timezone=True)` для billing/tariff периодов.
- Стратегия i18n цен/планов (не только `name_ru`).
- Workspace/tenant model для B2B billing.

### Можно отложить

- ClickHouse / OpenSearch.
- JSONB-миграция всех JSON-полей.
- Полный перенос аналитики в OLAP.

---

## 9. Международная готовность

| Тема | Текущее состояние |
|------|-------------------|
| **Валюты** | `Payment.currency`, tariff `currency` default **`RUB`**; marketplace `price` без currency |
| **Хранение денег** | `Numeric(10,2)` / `Numeric(24,8)` — OK |
| **Float для денег** | **Не используется** в `backend/models` |
| **Часовые пояса** | `UserSettings.timezone` default `Europe/Moscow`; constructor — `DateTime(timezone=True)`; legacy — UTC naive |
| **Локализация** | `UserSettings.language` default `ru`; tariff/plan seed — **`name_ru`** |
| **country_code / locale** | Нет на `users` / marketplace |
| **Регионы данных** | `DATA_REGION`, `STORAGE_REGION` в settings; prod **жёстко RU** в `main.py` |
| **GDPR / 152-ФЗ** | `consents`, `chat_hash`, retention, `token_version`, minimal storage flags |
| **Marketplace по странам** | Нет региональной модели каталога/цен |
| **Платёжные провайдеры** | YooKassa, Stripe, CloudPayments, Telegram — через env |
| **Workspace-first** | **Нет**; tariff — `user_id` + nullable `workspace_id` |

---

## 10. Масштабируемость до крупной SaaS-платформы

| Компонент | Оценка | Комментарий |
|-----------|--------|-------------|
| SQLite | Блокер prod | Только dev/test |
| Webhooks | Слабое место | Синхронный сценарный runtime в request |
| Счётчики сообщений | Слабое место | `user_quotas.used_messages` + будущие `usage_counters` |
| Analytics `events` | Рост | Индексы есть, партиций нет |
| Market search | Средне | PG `pg_trgm` для CRM; marketplace search не выделен |
| Payment history | Средне | `payments` без партиционирования |
| CRM `ctor_*` | Лучше | Индексы 018, aggregate table + Redis dirty queue (PG only) |
| Очереди | Частично | Redis для cache/dirty CRM; нет общей job queue для webhooks |
| Redis | Prod-ready опция | Не строг в dev |
| ClickHouse/OpenSearch | Нет | Рекомендуется позже для логов/поиска |

---

## 11. Риски

### Критичные

1. ~~**`tariff_system_007` не переносим на PostgreSQL** без замены `datetime('now')`~~ — seed/DDL исправлены в 3.1.2; нужен **staging upgrade** на PG.
2. **Dev auto-migrate** при старте uvicorn применит tariff-миграцию без отдельного решения.
3. **Два SQLite-файла** (корень vs `backend/`) — риск отладки на устаревшей схеме.

### Средние

4. **ORM `Plan` не отражает** будущие колонки tariff-миграции.  
5. **Параллельные системы лимитов:** `user_quotas` + `usage_counters` + `users.plan_code`.  
6. **CI заявляет PostgreSQL**, pytest conftest **форсирует SQLite** — расхождение с prod.  
7. **Тарификация на `user_id`**, workspace не оформлен.  
8. **RUB / `name_ru`** — барьер для глобального каталога.  
9. Mojibake в docstring части миграций.

### Низкие

10. `env.production.example` допускает SQLite.  
11. Legacy scripts на `backend/botforg.db`.  
12. Marketplace без `currency` на item.

---

## 12. Рекомендации

### Что сделать сейчас, до применения tariff migration

1. **Не запускать** `alembic upgrade head` и dev uvicorn с auto-migrate, пока не принято решение по Этапу 3.  
2. ~~**Исправить `tariff_system_007.py`**~~ — **сделано в 3.1.2** (PostgreSQL-ready seed/DDL).  
3. Зафиксировать **один путь** к dev-БД; архивировать/удалить локально `backend/botforg.db` (вручную, вне git).  
4. Документировать для команды: актуальная БД — **только** `{repo_root}/botforg.db`.  
5. Согласовать **источник правды лимитов:** `user_quotas` vs `usage_counters` на переходный период.

### Что сделать на этапе PostgreSQL-ready

1. Staging на PostgreSQL + `alembic upgrade head` (сначала без tariff, затем с исправленной tariff).  
2. Выровнять **pytest** с PG (опционально отдельный job) или явно задокументировать SQLite-only tests.  
3. Добавить в `Plan` ORM-поля из миграции или отдельную read-model.  
4. Проверить ENUM-типы на idempotent create для PG.

### Что сделать перед production

1. `DATABASE_URL` → PostgreSQL, Redis strict.  
2. Асинхронная обработка webhooks (очередь).  
3. Атомарные счётчики (SQL `UPDATE ... SET used = used + 1` / Redis).  
4. Retention/partition policy для `events`, CRM events.  
5. Региональная стратегия (EU/US) — отдельный design, не только `DATA_REGION=RU`.

### Что можно отложить

- ClickHouse/OpenSearch.  
- Полный workspace billing.  
- i18n таблицы переводов.  
- JSONB-миграция.

---

## 13. Влияние на Этап 3 тарифной системы

| Вопрос | Ответ |
|--------|--------|
| Применять `tariff_system_007` как есть? | **Применена** на dev SQLite (`botforg.db`); PG — изолированно на тестовой БД (3.2-PG) |
| Что поправить дальше? | **ORM ENUM** в `tariff.py`; legacy PG chain (`472098a6ab59`); UI/API |
| Менять модели tariff? | После миграции — синхронизировать **`Plan`** с новыми колонками; tariff-модели уже есть |
| Менять типы price? | **Нет** — `Numeric(10,2)` достаточен |
| Добавлять i18n сейчас? | **Нет** в 3.2; заложить в design (`name` + translations), не блокер DDL |
| `user_id` → workspace сейчас? | **Позже**; оставить `workspace_id` nullable до появления `workspaces` |

**Конфликт `team`:** миграция обновит limits существующего legacy-плана `team` — проверить на staging (см. `docs/TARIFFS_STAGE_3_MIGRATION.md`).

---

## 14. Рекомендуемый следующий шаг

**Этап 3.3 (2026-06-02):** `tariff_system_007` применена **вручную** к `botforg.db` (`tariff_system_007` head). Backup: `botforg_before_tariff_system_007.db`. ORM `Plan` обновлён. `pytest backend/tests`: 192 passed. Подробности: `docs/TARIFFS_STAGE_3_MIGRATION.md` → «Результат Этапа 3.3».

**Далее:** ORM ENUM в `tariff.py`; staging PG; UI/API тарифов.

### Auto-migrate (не изменён в коде)

Пока `tariff_system_007` не утверждена и не применена вручную, **нельзя запускать backend в development**: `ensure_dev_sqlite_migrations_applied()` выполнит `alembic upgrade head` автоматически.

**Будущий этап:** добавить защиту dev auto-migrate — не применять новые risk migrations автоматически без явного флага.

### UTC / i18n / деньги (зафиксировано в TARIFFS_STAGE_3_MIGRATION.md)

- Даты в БД — **UTC**; отображение — timezone пользователя.
- `Numeric(10,2)` для цен; `RUB` как ISO-код.
- `name_ru` — MVP; полноценный i18n — отдельный этап до международного production.

---

## Приложение A. Команды аудита

```bash
git status --short
python -m alembic current
python -m alembic heads
python -m alembic history
# dir *.db ; backend\*.db ; recursive *.db
```

## Приложение B. Файлы конфигурации

- Отсутствует: `backend/config.py`
- Не читались агентом: `.env`, `backend/.env` (Permission denied)

---

---

## Результат PostgreSQL-проверки tariff_system_007 (этап 3.2-PG)

| Пункт | Результат |
|-------|-----------|
| Docker доступен | **да** (29.5.2, Compose v5.1.4) |
| PostgreSQL поднят | **да** — сервис `postgres`, `postgres:15-alpine`, `:5432` |
| `DATABASE_URL` | `postgresql://botforg:botforg_secret@localhost:5432/botforg_tariff_migration_test` |
| Alembic upgrade (`tariff_system_007`) | **прошёл** (изолированно от `market_access_020`) |
| Alembic downgrade → `market_access_020` | **прошёл** |
| Повторный upgrade | **прошёл** |
| Таблицы тарифной системы | **созданы** (6 таблиц) |
| Колонки `plans` | **добавлены** (8 колонок) |
| Seed тарифов / пакетов | **да** (5 планов, 6 addon) |
| `member_1` price | **490.00** |
| Основная SQLite `botforg.db` | **обновлена на 3.3** → `tariff_system_007`, таблицы тарифов созданы |
| Backend/uvicorn | **не запускались** |

**Остаточные риски:** полный PG chain с нуля — `472098a6ab59`; ORM `AddonPackage` enum read — `values_callable` в `tariff.py` (3.4).

---

## Результат Этапа 3.3 — SQLite dev + ORM Plan

| Пункт | Результат |
|-------|-----------|
| Backup | `botforg_before_tariff_system_007.db` |
| `alembic upgrade head` (SQLite) | **успешно** |
| `alembic current` | `tariff_system_007` |
| ORM `Plan` | **синхронизирован** |
| `pytest backend/tests -q` | **192 passed**, 4 xfailed |
| Backend/uvicorn | **не запускались** |

---

*Документ создан в рамках аудита 2026-06-02. Обновлён после 3.3 (миграция на dev SQLite, ORM Plan).*
