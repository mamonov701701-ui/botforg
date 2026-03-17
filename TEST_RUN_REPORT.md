# Отчёт о прогоне тестов BotForg

**Дата:** 2026-02-02

## 1. Backend тесты

**Команда:** `cd backend && python -m pytest tests/ -v --tb=line`

**Результат:** 85 passed, 22 failed

### Исправленные баги

| # | Проблема | Решение |
|---|----------|---------|
| 1 | `sqlite3.OperationalError: no such column: users.token_version` | Тестовая БД создавалась через `Base.metadata.create_all()` без учёта миграций. Исправлено: использование Alembic `upgrade head` для применения всех миграций (включая `legal_152_token_version_006`) к тестовой БД. |
| 2 | `no such table: nodes` при очистке данных | `client` fixture удалял данные из всех таблиц в `Base.metadata`, включая таблицы, которых нет в миграциях. Исправлено: использование `inspect(test_engine).get_table_names()` для удаления только из существующих таблиц. |

### Изменения в `backend/tests/conftest.py`

- `DATABASE_URL` для тестов: `sqlite:///test_botforg.db` (файловая БД)
- Перед запуском: `alembic upgrade head` для создания актуальной схемы
- `client` fixture: удаление только из таблиц, существующих в БД

### Оставшиеся падения (22)

- **test_bot_tags_api** (5): 404 — API ожидает `BotInstance.id`, а тест создаёт `Bot` через `/bots/connect`; ID из разных таблиц не совпадают
- **test_bot_user_state** (7): PermissionError (возможно, блокировка файла БД на Windows)
- **test_bots** (1): `test_get_bots_list` — assert 2 == 1
- **test_database_integration** (4): sqlalchemy ошибки (таблицы bot_tags, bot_user_state)
- **test_message** (4): AssertionError (ожидания по формату ответа)
- **test_scenarios** (1): `test_get_bot_scenarios_empty` — AssertionError

---

## 2. E2E тесты фронтенда

**Команда:** `cd frontend && npx playwright test`

**Результат:** Полный прогон включает все e2e-спеки.

---

## 3. Визуальные smoke-тесты

**Команда:** `cd frontend && npx playwright test smoke-screenshots.spec.ts`

**Результат:** 7 passed (49.7s)

| Экраны | Маршрут | Файл скриншота |
|--------|---------|----------------|
| login | /login | frontend/e2e/screenshots/login.png |
| dashboard | /dashboard | frontend/e2e/screenshots/dashboard.png |
| bots | /dashboard/bots | frontend/e2e/screenshots/bots.png |
| editor | /editor/1 | frontend/e2e/screenshots/editor.png |
| templates | /dashboard/templates | frontend/e2e/screenshots/templates.png |
| analytics | /dashboard/analytics | frontend/e2e/screenshots/analytics.png |
| pricing | /pricing | frontend/e2e/screenshots/pricing.png |

---

## 4. Сводка

| Категория | Passed | Failed | Статус |
|-----------|--------|--------|--------|
| Backend | 85 | 22 | Частично |
| Smoke-screenshots | 7 | 0 | Зелёный |
| E2E (полный) | — | — | В процессе |

---

## 5. Рекомендации

1. **Backend:** Проверить регистрацию роутов `/bot-tags/` и наличие миграций для `bot_tags`, `bot_user_state`.
2. **Параллельный запуск:** При `workers > 1` на Windows возможны PermissionError из‑за файла `test_botforg.db`; при необходимости использовать `:memory:` или отдельные файлы на воркер.
3. **Скриншоты:** Сохраняются в `frontend/e2e/screenshots/`; можно добавить в CI для визуальной регрессии.
