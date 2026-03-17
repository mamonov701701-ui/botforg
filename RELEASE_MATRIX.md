# BotForg Release Matrix (2026-02-04, run: 2026-02-04_0809)

## A. P0 (must-have for release)

### Editor / Blocks / Library
- **Status:** PARTIAL
- **Evidence:**
  - UI: визуальный редактор (`/editor/1`, `EditorPage.tsx` + `Editor.tsx`) — реализован.
  - Статика кабинета: страницы `BotsPage`, `ScenariosPage`, `TemplatesPage` — полноценные экраны.
  - Backend: роуты `/bots/*`, `/scenarios/*`, `/bot-templates/*`, `/templates/*` есть в `backend_routes.txt`.
  - Тесты: множество падений в `backend/tests/test_billing.py`, `tests/test_templates.py`, `tests/test_legal_152.py` (см. `qa_artifacts/2026-02-04_0809/pytest_all.txt`).
- **Gaps:**
  - Миграции и модель User конфликтуют (InvalidRequestError / multiple mappers) — авторизация через email ломает большинство тестов.
  - Нет прохождения end-to-end сценариев по тестам (91 failed, 3 errors).
- **Required endpoints (основные):**
  - `/bots/`, `/bots/{bot_id}`, `/bots/{bot_id}/graph`
  - `/scenarios/`, `/scenarios/bot/{bot_id}`, `/scenarios/{scenario_id}/*`
  - `/templates`, `/templates/{id}`, `/bot-templates/*`, `/user-templates/*`

### Marketplace
- **Status:** PARTIAL
- **Evidence:**
  - UI: `MarketplacePage.tsx` (маркетплейс шаблонов/сценариев/услуг) — сложная страница с вкладками.
  - Backend: группа `/api/market/*` + `/api/team/*` реализована и видна в `backend_routes.txt`.
  - Тесты: отдельные marketplace-тесты (`backend/test_marketplace*.py`) падают из‑за отсутствующих фикстур и setup.
- **Gaps:**
  - Автотесты для marketplace не проходят, ручной обход не запускался (frontend не стартовал в QA-прогоне).
- **Required endpoints (основные):**
  - `/api/market/items*`, `/api/market/orders*`, `/api/market/reviews*`, `/api/market/freelancers*`

### Cabinet (Dashboard)
- **Status:** PARTIAL
- **Evidence:**
  - UI: `DashboardLayout.tsx` + страницы `HomePage`, `BotsPage`, `ScenariosPage`, `TemplatesPage`, `BalancePage`, `AnalyticsPage`, `TeamPage`, `MessagesPage`, `SettingsPage`.
  - Навигация: `/dashboard/*` маршруты и пункты меню заданы явно.
  - Backend: `/me`, `/billing/*`, `/analytics/*`, `/api/team/*`, `/api/user/security/*`, `/chat/*` присутствуют.
  - Тесты: множество падений в блоках billing, templates, legal/privacy.
- **Gaps:**
  - Нет успешного авторизационного сценария (AssertionError: Login failed ... в тестах).
  - Runtime UI не проверен (Playwright не смог запуститься из‑за frontend).
- **Required endpoints (основные):**
  - `/me`, `/me/settings`, `/billing/*`, `/analytics/*`, `/api/team/*`, `/api/user/security/*`, `/chat/*`

### Channels (MAX / WhatsApp)
- **Status:** PARTIAL
- **Evidence:**
  - Backend: маршруты `/bots/{bot_id}/channels/*`, `/webhooks/{channel}/{bot_id}`, `/webhooks/whatsapp/{bot_id}` реализованы.
  - Тесты: есть специализированные тесты `tests/test_max_webhook.py`, `tests/test_whatsapp_channel.py`, `tests/test_whatsapp_meta_cloud.py` (в текущем прогоне часть упала).
  - UI: разделы каналов находятся внутри `SettingsPage` и, вероятно, отдельных панелей (нет явного отдельного route).
- **Gaps:**
  - Автотесты каналов не зелёные; фактический статус интеграций MAX/WhatsApp не подтверждён.
- **Required endpoints (основные):**
  - `/bots/{bot_id}/channels*`, `/webhooks/max/{bot_id}`, `/webhooks/whatsapp/{bot_id}`

### Preview / Public site
- **Status:** PARTIAL
- **Evidence:**
  - Публичные страницы: `/` (Home — полноценный лендинг), `/market`, `/templates` (старая страница), `/bf-agent` (ведёт в NotFound).
  - `/features`, `/pricing`, `/login`, `/account` помечены как «(в разработке)».
- **Gaps:**
  - Нет устойчивого runtime-скрина публичного сайта (frontend dev не поднялся в QA-прогоне).
- **Required endpoints (основные):**
  - `/templates*`, `/public-templates`, `/legal/doc/*`, `/legal/docs`

## B. Pages inventory (сводка по статическому аудиту)

Route | Area | Status | Component | Backend wiring | Notes
----- |------|--------|-----------|----------------|------
/ | public | OK | Home | YES (templates, analytics, bots упомянуты) | Полноценный лендинг
/pricing | public | TODO | Pricing | NO (отдельного backend нет) | «Страница “Pricing” (в разработке)»
/features | public | TODO | Features | NO | «Страница “Features” (в разработке)»
/market | public | OK | MarketplacePage | YES (`/api/market/*`, `/bots`, `/scenarios`) | Тяжёлый UI, зависит от многих API
/dashboard | cabinet | OK | HomePage | YES (`/analytics/*`, `/bots`, `/me`) | Главная дашборда
/dashboard/bots | cabinet | OK | BotsPage | YES (`/bots/*`) | Управление ботами
/dashboard/scenarios | cabinet | OK | ScenariosPage | YES (`/scenarios/*`) | Управление сценариями
/dashboard/templates | cabinet | OK | TemplatesPage | YES (`/templates*`, `/user-templates*`) | Личная библиотека шаблонов
/dashboard/balance | cabinet | OK | BalancePage | YES (`/billing/*`) | Баланс/транзакции
/dashboard/analytics | cabinet | OK | AnalyticsPage | YES (`/analytics/*`) | Глубокая аналитика
/dashboard/team | cabinet | OK | TeamPage | YES (`/api/team/*`, `/api/platform-admin/*`) | Команда и роли
/dashboard/messages | cabinet | OK | MessagesPage | YES (`/chat/*`) | Чаты и сообщения
/dashboard/settings | cabinet | OK | SettingsPage | YES (`/me`, `/auth`, `/api/user/security/*`) | Настройки профиля/интерфейса/BF Agent
/dashboard/platform | platform | OK | PlatformOverviewPage | YES (`/api/platform-admin/*`) | Обзор платформы
/dashboard/platform/users | platform | OK | PlatformUsersPage | YES (`/api/platform-admin/users*`) | Пользователи/проекты
/dashboard/platform/analytics | platform | OK | PlatformAnalyticsPage | YES (`/api/platform-admin/analytics`) | Платформенная аналитика
/dashboard/bf-team | platform | OK | BFTeamPage | YES (`/api/platform-admin/*`) | Управление BF-командой
/editor/1 | editor | OK | EditorPage/Editor | YES (`/bots`, `/scenarios`, `/blocks`) | Визуальный редактор

## C. API inventory highlights

- **Auth / Users:** `/auth/email/*`, `/auth/{provider}/*`, `/me`, `/me/settings`, `/api/user/security/*` — активно используются UI (AuthModal, SettingsPage). Тесты по privacy/152-ФЗ падают (см. `tests/test_legal_152.py`).
- **Bots / Scenarios / Templates:** роуты `/bots/*`, `/scenarios/*`, `/templates*`, `/bot-templates/*`, `/user-templates/*` присутствуют и используются в кабинетных страницах.
- **Market:** `/api/market/*`, `/api/team/*` — поддержка маркетплейса и командной работы.
- **Channels:** `/bots/{bot_id}/channels/*`, `/webhooks/{channel}/{bot_id}`, `/webhooks/whatsapp/{bot_id}` — MAX + WhatsApp, с отдельными тестами.
- **Legal / Privacy:** `/legal/*`, `/privacy/*` реализованы, но автотесты частично падают.
- **Billing / Payments:** `/billing/*`, `/payments/*` — используются в `BalancePage` и тестах `backend/tests/test_billing.py`, `tests/test_payment.py` (много падений).

## D. Release blockers (P0 Bugs)

1. **Backend tests massively failing** — `91 failed, 3 errors` в `pytest_all.txt` (см. `qa_artifacts/2026-02-04_0809/pytest_all.txt`). Основные области: billing, templates, legal/privacy, user templates, marketplace helper-тесты.
2. **Auth / User model mapper conflict** — `InvalidRequestError: Multiple classes found for path \"User\"` в логах login/register (см. `test_billing.py`, `tests/test_basic.py`, `tests/test_legal_152.py`).
3. **Frontend QA не выполняется** — dev-сервер Vite не поднимается на 127.0.0.1:5173 в рамках QA-скрипта; Playwright / runtime UI-аудит недоступен (см. `frontend_stdout.log` / `frontend_stderr.log` — файлы не созданы в этом прогоне).
4. **Страницы Pricing / Features / Login / Account находятся в статусе “(в разработке)”** — для прод‑релиза требуется либо скрыть, либо довести до рабочего состояния.
5. **Каналы и marketplace не покрыты зелёными тестами** — критичные сценарии интеграций и marketplace должны быть подтверждены хотя бы частично (сейчас тесты ломаются на инфраструктуре и auth).

