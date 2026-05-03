# QA Tester Agent — BotForg

Один прогон: backend (миграции, health, pytest, роуты), frontend (Playwright: меню, auth, ключевые страницы), сверка UI↔API. Результат: **QA_REPORT.md** и **qa_artifacts/\<timestamp\>/**.

## Запуск одной командой

Из **корня проекта**:

```powershell
.\qa\run_qa.ps1
```

Скрипт:

1. Создаёт **qa_artifacts/YYYY-MM-DD_HHmm/**.
2. Запускает миграции (`alembic upgrade head`), лог в `backend_alembic.log`.
3. Запускает backend на **8001**, логи в `backend_stdout.log`, `backend_stderr.log`, ждёт `/health` или `/` (30 с).
4. Сохраняет роуты в `backend_routes.txt`, при возможности — `openapi.json`.
5. Запускает **pytest -q** → `pytest_all.txt`, затем выбранные тесты → `pytest_selected.txt`.
6. Запускает frontend через `cmd.exe /c` (устойчивый запуск npm на Windows), логи в `frontend_stdout.log`, `frontend_stderr.log`, ждёт доступности http://127.0.0.1:5173 до 60 с; при неудаче — P0 в отчёте.
7. Запускает **Playwright** E2E из `frontend/tests/e2e/` (smoke.spec.ts, auth.spec.ts, crm-8002-smoke.spec.ts; при необходимости вручную — workspace-stability, auth-runtime-stability), скриншоты в `screens/`, отчёт в `playwright_report.txt`, API-вызовы в `ui_api_calls.json`, консоль в `console_log.txt`.
8. Сверка UI↔API → `ui_api_reconciliation.txt`.
9. Генерация **QA_REPORT.md** в корне.
10. Останавливает backend и frontend.

## Требования

- **Для QA требуется установленный Node.js (npm).** Если Node.js/npm не найдены, скрипт выведет сообщение и не упадёт с ошибкой Win32.
- Python (alembic, pytest), Node.js LTS с npm (frontend и Playwright).
- Установка Node.js: https://nodejs.org (рекомендуется LTS).
- Playwright: при первом запуске скрипт при необходимости выполняет `npm i -D @playwright/test` и `npx playwright install chromium` в `frontend/`.

## Структура

| Файл | Назначение |
|------|------------|
| **qa/run_qa.ps1** | Единая точка запуска. |
| **qa/config.json** | URL страниц, селекторы контента, пункты меню. |
| **qa/dump_routes.py** | Дамп роутов FastAPI в `backend_routes.txt` (принимает каталог артефактов). |
| **qa/reconcile_ui_api.py** | Сверка `ui_api_calls.json` с `backend_routes.txt`. |
| **qa/generate_report.py** | Сборка QA_REPORT.md из каталога прогона. |
| **qa/playwright.config.ts** | testDir = frontend/tests/e2e, артефакты в QA_ARTIFACTS_DIR. |
| **frontend/tests/e2e/smoke.spec.ts** | S1: публичные страницы, меню, 404. |
| **frontend/tests/e2e/auth.spec.ts** | S2: регистрация/вход, S3: настройки, шаблоны, боты. |
| **frontend/tests/e2e/global-api-collector.ts** | Сбор вызовов API для ui_api_calls.json. |
| **frontend/tests/e2e/global-teardown.ts** | Запись ui_api_calls.json по завершении тестов. |

## Артефакты (qa_artifacts/\<timestamp\>/)

| Файл/папка | Описание |
|------------|----------|
| **backend_alembic.log** | Лог миграций. |
| **backend_stdout.log**, **backend_stderr.log** | Вывод backend. |
| **frontend_stdout.log**, **frontend_stderr.log** | Вывод frontend. |
| **pytest_all.txt**, **pytest_selected.txt** | Результаты pytest. |
| **backend_routes.txt**, **openapi.json** | Роуты и OpenAPI (если доступен). |
| **playwright_report.txt** | Вывод Playwright. |
| **screens/** | Скриншоты страниц. |
| **ui_api_calls.json** | Агрегат вызовов API (method + path, статусы). |
| **console_log.txt** | Ошибки консоли со страниц. |
| **ui_api_reconciliation.txt** | Сверка UI↔API. |
| **qa_run.log** | Лог самого прогона QA. |

## Ограничения

- Только диагностика и отчёт, без рефакторинга. **Git push не выполняется.**
