# Инфраструктура тестирования BotForg

## Обзор

- **Backend:** pytest, unit/integration тесты
- **Frontend:** Playwright, E2E тесты

## Backend-тесты

### Запуск

```bash
# Из корня проекта
npm run test:backend

# Или из папки backend
cd backend
python -m pytest tests/ -v --tb=short
```

### Требования

- Python 3.12+
- Зависимости: `pip install -r requirements.txt -r requirements-dev.txt`
- Тесты используют in-memory SQLite (не требуют PostgreSQL)
- **Важно:** В CI используется PostgreSQL (`DATABASE_URL`). Локально схема создаётся из моделей; при ошибках вида `no such column` убедитесь, что все миграции применены или модели синхронизированы со схемой.

### Структура тестов

```
backend/tests/
  conftest.py           # Фикстуры (client, register_and_get_token, create_test_bot)
  test_auth.py          # Регистрация, логин, защищённые эндпоинты
  test_scenarios.py     # CRUD сценариев
  test_versions.py      # Версии сценариев, восстановление
  test_publish.py       # Публикация черновика
  test_draft_published.py  # Draft/Published: runtime использует только published_content
  test_access_control.py   # Права: viewer не может публиковать, owner/developer может
  ...
```

### Тесты без БД (unit)

- `test_draft_published.py` — изоляция draft/published в runtime
- `test_access_control.py` — проверка check_bot_edit_permission

Запуск: `python -m pytest tests/test_draft_published.py tests/test_access_control.py -v`

### Переменные окружения

- `TESTING=true` — включён режим тестирования
- `DATABASE_URL` — в CI используется PostgreSQL; локально — SQLite по умолчанию

---

## Frontend E2E-тесты (Playwright)

### Запуск

```bash
# Из корня проекта
npm run test:e2e

# Или из папки frontend
cd frontend
npm run test:e2e

# UI-режим (интерактивный)
npm run test:ui
```

### Автозапуск dev-сервера

По умолчанию Playwright **автоматически запускает** `npm run dev` в `frontend/`, если не задан `QA_FRONTEND_URL`. Если сервер уже запущен на `http://127.0.0.1:5173`, он будет использован (`reuseExistingServer`).

### Использование уже запущенных серверов

```bash
# Запустите frontend вручную
cd frontend && npm run dev

# В другом терминале — тесты подключатся к работающему серверу
npm run test:e2e
```

**Важно:** Тесты авторизации и онбординга требуют запущенного backend (API). Запустите backend отдельно, например: `cd backend && uvicorn main:app --reload`.

Или укажите URL:

```bash
QA_FRONTEND_URL=http://localhost:5173 npm run test:e2e
```

### Структура E2E

```
frontend/tests/e2e/
  auth.spec.ts           # Регистрация, логин, кабинет
  smoke.spec.ts          # Публичные страницы, меню
  editor.spec.ts         # Редактор сценариев
  versions.spec.ts       # История версий
  demo_mode.spec.ts      # Демо-режим
  critical-scenarios.spec.ts  # Обязательные сценарии (1–7)
  global-api-collector.ts
  global-teardown.ts
```

### Обязательные сценарии (critical-scenarios.spec.ts)

1. **Авторизация** — успешный логин, отказ при неверном пароле
2. **Онбординг** — после регистрации есть бот и шаблоны
3. **Редактор** — открытие, demo read-only, обычный режим
4. **Версии** — кнопка История, модалка версий
5. **Draft/Published** — индикатор статуса, кнопка Опубликовать
6. **Автосохранение** — статус «Сохранено», localStorage
7. **Права доступа** — кнопка Опубликовать в зависимости от роли

Конфигурация: `qa/playwright.config.ts`

### Артефакты

- Скриншоты: `qa_artifacts/screens/`
- Отчёт: `qa_artifacts/playwright-report/`
- Результаты: `qa_artifacts/test-results/`

---

## CI

Backend-тесты запускаются в GitHub Actions (`.github/workflows/ci.yml`):

- `backend-test`: pytest с PostgreSQL
- `frontend-test`: lint + build (E2E не запускаются в CI по умолчанию)

Для запуска E2E в CI добавьте job с `webServer` или предзапущенным сервером.

---

## Анализ падений тестов (Cursor)

При падении теста Cursor может автоматически анализировать причину и предлагать фикс:

1. Запустите тесты: `npm run test:backend` или `npm run test:e2e`
2. Скопируйте вывод ошибки (traceback, assertion)
3. Опишите задачу: «Тест X упал с ошибкой Y. Предложи фикс»
4. Cursor проанализирует код и предложит изменения

Для backend: смотрите `tests/` и соответствующий модуль (например, `routers/scenario.py`).  
Для E2E: смотрите `frontend/tests/e2e/` и компоненты в `frontend/src/`.
