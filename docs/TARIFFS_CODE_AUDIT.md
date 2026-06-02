# BotForg — аудит текущего кода под финальную тарифную модель

**Дата аудита:** 2026-06-02  
**Ветка:** `chore/fresh-clean`  
**Статус git на момент аудита:** рабочее дерево чистое (`nothing to commit, working tree clean`). Чужих незакоммиченных изменений нет.

**Ограничения этапа:** код backend/frontend не менялся; миграции не создавались; только документация.

**Эталон:** [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md)

---

## 1. Краткий вывод

### Уже готово (частично применимо к новой модели)

- Таблица `plans` в БД с JSON-лимитами; сидер в миграциях `plans_012`, `plans_developer_013`.
- Поле `users.plan_code` и отдача в `GET /me`.
- `GET /plans/` — публичный список тарифов.
- Утилиты `backend/utils/plan_limits.py` с централизованными проверками (боты, публикация сценариев, команда, шаблоны marketplace).
- Marketplace v2 (`/api/market/*`): заявки на доступ, grants, внутренний чат — **соответствует** политике «без P2P».
- Frontend marketplace: кнопки «Добавить», «Запросить доступ» (`frontend/src/api/market.ts`).
- Модель `PlatformRole` (BF-роли) отдельно от ролей команды.
- `UserQuota` + биллинг сообщений (отдельный контур).

### Частично готово

- Лимит ботов (`max_bots`) — есть, но считает **все** боты, не «активные».
- Команда (`max_team_members`) — проверяется при добавлении участника.
- Публикация сценариев (`can_publish`) — проверяется, но **закрыта на free** (противоречит финальной модели).
- Аналитика — функция `check_can_use_analytics` есть, но **нигде не вызывается** в роутерах.
- Платежи — CRUD `Payment`, без подписок и без связи с тарифами.
- Страница тарифов `Pricing.jsx` — загружает API, но с **fallback** и устаревшей сеткой free/pro/team/developer.

### Конфликтует с финальной моделью

- Тариф **Developer** как отдельный план с gate на публикацию шаблонов и кабинет разработчика.
- `can_publish` / `can_use_analytics` на free = false.
- `UserQuota.monthly_limit` по умолчанию **1000**, не привязан к `plan_code` (у «Старт» должно быть 500).
- Нет разделения черновик / активный бот; нет правила «1 бот = 1 канал» в enforcement.
- Нет сущностей: `addon_packages`, `subscriptions`, `usage_counters`, `gift_grants`, `admin_audit_log` (тарифы).
- Нет цен в `plans` (`price_month`, `currency`, флаги витрины).
- Legacy: `Purchase`, `marketplace.py`, `purchase.py` — **не подключены** в `main.py`, но модели и код остаются.
- Mock `POST /me/plan` без оплаты — риск в production.

### Опасно трогать сразу

- `POST /me/plan` — тесты и ручная смена тарифа завязаны на него.
- `UserQuota` + `message.py` — отдельная экономика сообщений (1 ₽ за сообщение сверх лимита), не совпадает с «блокировкой обработки».
- `market.py` install + `check_max_bots` при установке шаблона.
- Смешение `plan_code=developer` и `role=developer` во frontend (`roles.ts`).
- Удаление legacy `marketplace`/`purchase` без отдельного этапа.

### Менять поэтапно (рекомендация)

1. Модели и миграции (plans v2, addons, subscriptions, usage).  
2. Сервис лимитов (active bots, messages, период).  
3. Enforcement в bot/scenario/market/message runtime.  
4. API «Финансы и лимиты» + админка.  
5. Frontend Pricing + Balance + снятие Developer-gate.  
6. Тесты и русификация.

---

## 2. Текущая тарифная система

### Какие планы есть сейчас

| code | name (БД) | Источник |
| ---- | --------- | -------- |
| `free` | Free | `plans_012` |
| `pro` | Pro | `plans_012` |
| `team` | Team | `plans_012` |
| `developer` | Developer | `plans_developer_013` |

Документация `docs/plans.md` описывает ту же legacy-сетку.

### Где хранятся

- **Таблица `plans`:** `id`, `code`, `name`, `limits` (JSON), `created_at` — `backend/models/plan.py`.
- **Тариф пользователя:** `users.plan_code` (строка, default `free`) — `backend/models/user.py`.
- **Нет:** `price_month`, `is_public`, `is_recommended`, подписок, пакетов.

### Лимиты в JSON (текущие)

| План | max_bots | can_publish | can_use_analytics | max_team_members | can_publish_templates | can_sell_templates | can_view_marketplace_stats |
| ---- | -------- | ----------- | ----------------- | ---------------- | --------------------- | ------------------ | -------------------------- |
| free | 1 | false | false | 0 | false | false | false |
| pro | 5 | true | true | 3 | false | false | false |
| team | 20 | true | true | 10 | false | false | false |
| developer | 10 | true | true | 5 | true | true | true |

### Какие лимиты реально проверяются

| Лимит | Проверка в runtime |
| ----- | ------------------ |
| max_bots | Да — `check_max_bots` в `bot.py` (connect, create), `market.py` (install) |
| can_publish (сценарии) | Да — `scenario.py` publish |
| can_publish_templates | Да — `market.py` create/update template |
| require_developer_plan | Да — `market.py` my-templates, submit moderation |
| max_team_members | Да — `team.py` add-member |
| can_use_analytics | **Нет** (функция есть, вызовов нет) |
| can_sell_templates | **Нет** (только декларация в limits) |
| monthly_messages | **Нет** через plans; отдельно `UserQuota` |
| active_bots vs drafts | **Нет** |
| 1 bot = 1 channel | **Нет** (есть `bot_channel_connections`, без лимита по тарифу) |

### Mock-смена тарифа

- **`POST /me/plan`** — `backend/routers/account.py`: меняет `plan_code` без оплаты, периода, аудита.
- Сообщение об ошибке 404 упоминает только `free, pro, team`, хотя `developer` тоже валиден.
- Используется в тестах: `test_plans.py`, `test_publish.py`, `test_moderation.py`, `test_my_templates.py`, `test_market_template_publish_access.py`.

### Риски `POST /me/plan`

| Риск | Описание |
| ---- | -------- |
| Обход оплаты | Любой авторизованный пользователь может выставить себе `team` или `developer`. |
| Нет периода | Нет `current_period_end`, автопродления. |
| Нет аудита | Нет записи «кто и зачем сменил тариф». |
| Production | При открытом API — критическая уязвимость до внедрения реальных подписок и отключения mock. |

---

## 3. Текущие лимиты

| Лимит | Где хранится | Где проверяется | Работает сейчас | Соответствует финальной модели | Что менять |
| ----- | ------------ | --------------- | --------------- | ------------------------------ | ---------- |
| active_bots | — | — | Нет | Нет | Ввести в `limits`, считать ботов с активным каналом |
| max_bots (все боты) | `plans.limits`, default в `plan_limits.py` | `bot.py`, `market.py` install | Да | Частично (считает черновики) | Заменить на active_bots; не лимитировать черновики жёстко |
| channels (1 на бота) | `bot_channel_connections` | — | Нет | Нет | Enforcement при подключении второго канала |
| messages (месяц) | `user_quotas.monthly_limit` (default 1000) | `message.py` (платное сообщение 1 ₽) | Частично | Нет (500 на Старт, общий пул, блокировка не оплата) | `usage_counters`, связь с plan+addons, stop processing at 100% |
| team members | `plans.limits.max_team_members` | `team.py` | Да | Частично (лимиты другие) | Новые коды тарифов и лимиты 0/5 |
| analytics | `can_use_analytics` в plans | — | Нет | Нет (доступна всем) | Убрать gate; ограничить history/export |
| export reports | — | — | Нет | Нет | Добавить в limits |
| scenario publish | `can_publish` | `scenario.py` | Да | **Нет** (должна быть на Старт) | Убрать или всегда true для SaaS-политики |
| template publish | `can_publish_templates` | `market.py` (template only) | Да | **Нет** (не только Developer) | Убрать developer gate; модерация отдельно |
| marketplace access | — | Публичный list items | Да | Да | Сохранить |
| API/webhook | — | — | Нет по тарифу | TBD | По продуктовому решению |
| packages (addons) | — | — | Нет | Нет | Новые таблицы и API |
| gifts | — | — | Нет | Нет | `gift_grants` + админка |
| subscriptions | `PaymentType.subscription` enum only | — | Нет | Нет | `workspace_subscriptions` / user_subscriptions |

### UserQuota (отдельно от plans)

- Модель: `backend/models/billing.py` — `monthly_limit`, `used_messages`.
- `GET /billing/summary`, `PATCH /billing/quota` — пользователь может менять свою квоту (тесты).
- `message.py`: при `used_messages >= monthly_limit` сообщение помечается `is_paid=True`, price 1.00 — **не** «остановка обработки бота».

---

## 4. Marketplace

### Что реализовано (актуальный контур `/api/market`)

| Возможность | Статус |
| ----------- | ------ |
| Бесплатные шаблоны/сценарии | Да — install endpoints |
| Платные/закрытые | Да — `price` + request/grant (`market_access.py`) |
| Заявки на доступ | `MarketAccessRequest` + статусы |
| Grants | `MarketItemAccessGrant` |
| Внутренний чат | `chat_room_id` на заявке |
| Install/add | install scenario/template; UI «Добавить» |
| Модерация шаблонов | draft → pending; `market_admin` router |
| P2P checkout в market API | **Не найден** в `market.py` |

### Legacy (не в `main.py`)

| Компонент | Файл | Примечание |
| --------- | ---- | ---------- |
| Старый marketplace | `backend/routers/marketplace.py` | `GET /marketplace`, `Template`, `Purchase.is_purchased` |
| Legacy purchases | `backend/routers/purchase.py`, `models/purchase.py` | P2P-покупка шаблона по `template_id` |

Роутеры **не подключены** в `backend/main.py` — фронт использует `/api/market`.

### Противоречия финальной политике

| Место | Проблема |
| ----- | -------- |
| `plan_limits.check_can_publish_templates` | Публикация шаблонов только на `developer` |
| `market.py` `require_developer_plan` | Кабинет `/api/market/my-templates`, submit moderation |
| `plans.limits.can_sell_templates` | Идея «продажи» на платформе; в UI «Продажа шаблонов (скоро)» |
| `Pricing.jsx` секция Developer | Отдельный «тариф разработчика» вместо SaaS-тарифов |
| `roles.ts` `PLAN_DEVELOPER_ACTIONS` | `template_publish`, `marketplace_stats` требуют `plan_code === 'developer'` |
| `DeveloperTemplatesPage.tsx` | Редирект на `/pricing` без developer |
| `docs/plans.md` | can_publish false на free; analytics false на free |

### Соответствия финальной политике

- Платные товары: request → chat → grant — **OK**.
- Frontend не показывает «Купить» для paid items без grant — **OK** (`getMarketItemPrimaryActionState`).
- BotForg не проводит оплату между пользователями в активном API — **OK**.

---

## 5. Роли

### Глобальные роли пользователя (`users.role`)

`owner`, `admin`, `developer`, `templates_manager`, `support`, `viewer`, `user` — `backend/models/user.py`, `frontend/src/constants/roles.ts`.

Используются для **доступа к разделам ЛК** (frontend `SECTION_ACCESS`, `ACTION_ACCESS`), не для SaaS-тарифа.

### Роли команды (`team_members.role`)

`TeamMember.role` — default `observer`; проверки прав на бота в `bot_access.check_bot_edit_permission` (`developer`, `admin`).

Путаница: строка `'developer'` в команде ≠ `plan_code='developer'`.

### Роли сотрудников платформы

`PlatformRole` — BF Администратор, BF Модератор и т.д. (`backend/models/platform_role.py`).  
Отдельно от `users.role` и от тарифа.

### Marketplace author

`seller_id` на `MarketItem`; статусы заявок — не тариф.

### Места смешения

| Контекст | Смешение |
| -------- | -------- |
| `plan_code=developer` | Gate публикации шаблонов и stats |
| `role=developer` | Права в команде и в ЛК |
| `require_developer_plan` | Название проверяет `can_view_marketplace_stats` в limits |
| `Pricing.jsx` | Отдельная карточка «Developer» как тариф |
| `hasAccessToPlanRestrictedAction` | role OK **и** plan developer |

**Финальная модель:** тариф ≠ роль команды ≠ роль marketplace; сейчас тариф Developer дублирует «роль автора маркетплейса».

---

## 6. Billing / Payments / Subscriptions

### Payment

- Модель: `payments` — amount, currency, status, type (`purchase`, `subscription`, `messages`).
- Роутер: `POST /payments/`, `GET /payments/my-payments` — **подключён** в `main.py`.
- **Нет** webhook-обработки смены тарифа в просмотренном коде; нет связи Payment → plan_code.

### BillingRecord / UserQuota

- `billing_records` — action message/purchase/subscription.
- Роутер `/billing` — подключён.
- Квота **не синхронизируется** с `plans.limits`.

### Подписки

- Таблицы `subscription` / `workspace_subscriptions` — **отсутствуют**.
- Только enum `PaymentType.subscription`.

### Сообщения

- Учёт: `UserQuota.used_messages` при создании сообщения через API.
- Channel runtime (`channel_runtime.py`) — **не найдено** использование quota/plan.

### Mock / legacy

| Элемент | Статус |
| ------- | ------ |
| `POST /me/plan` | Mock смена тарифа |
| `PATCH /billing/quota` | Пользователь может задать лимит (тесты) |
| `purchase.py` + `Purchase` model | Legacy, не в main |
| `marketplace.py` | Legacy, не в main |

### Роутеры в `main.py` (релевантное)

| Роутер | Prefix | Подключён |
| ------ | ------ | --------- |
| account | — | Да (`/me`, `/me/plan`) |
| plans | `/plans` | Да |
| billing | `/billing` | Да |
| payment | `/payments` | Да |
| market | `/api/market` | Да |
| market_admin | (см. router) | Да |
| marketplace | — | **Нет** |
| purchase | — | **Нет** |

---

## 7. Frontend

### Тарифная страница

- `frontend/src/pages/Pricing.jsx` — `FALLBACK_PLANS` (free/pro/team/developer), hardcoded `BUSINESS_FEATURES`, секция Developer.
- `frontend/src/api/plans.ts` — типы без цен и без `active_bots` / `monthly_messages`.
- **Нет** тарифов Старт/Бизнес/Бизнес PRO/Команда/Корпоративный.

### AccessLocked / roles.ts

- `AccessLocked` — блокировка по **роли**, не по тарифу (кроме связки в `hasAccessToPlanRestrictedAction`).
- `balance_topup`, `transactions_export` — только owner/admin (роль), не тариф.
- `PLAN_DEVELOPER_ACTIONS` — конфликт с «публикация на всех тарифах».

### Marketplace UI

- `MarketplacePage.tsx`, `market.ts` — русские «Добавить», «Запросить доступ»; нет P2P «Купить» для paid.
- Ссылка на `/developer/templates` — developer gate в UI.

### Balance / Финансы

- `BalancePage.tsx` — баланс/транзакции; `AccessLocked` для topup/export по ролям.
- **Нет** раздела «Финансы и лимиты» по финальной спецификации (тариф, период, остаток сообщений, пакеты).

### Analytics / Team guards

- В dashboard **не найдено** проверок `plan_code` / `can_use_analytics`.
- Backend analytics — доступ по владельцу бота, не по тарифу.

### Расхождения frontend ↔ backend

| UI | Backend |
| -- | ------- |
| Публикация шаблонов доступна ролям owner/admin/… | Только `plan_code=developer` для template market item |
| Free может заходить в analytics (раздел виден всем ролям) | `can_use_analytics=false` в plans, но не enforced |
| Pricing показывает free/pro/team | Финальная модель — другие названия и лимиты |
| Developer как отдельный тариф | Финально — не отдельный SaaS-тариф |

---

## 8. Backend enforcement

| Route / функция | Что проверяет | Где | Модель доступа | Проблема |
| --------------- | ------------- | --- | -------------- | -------- |
| `POST /bots/connect`, `POST /bots/` | max_bots (все боты) | `bot.py` | plan limits | Не active_bots; черновики в лимите |
| `POST /scenarios/{id}/publish` | can_publish | `scenario.py` | plan limits | Free не может — конфликт с Старт |
| `POST /api/team/add-member` | max_team_members | `team.py` | plan limits | Free = 0, ок для «нет команды» |
| `POST /api/market/items` (template) | can_publish_templates | `market.py` | developer limits | Gate только Developer |
| `PUT /api/market/items/{id}` publish template | can_publish_templates | `market.py` | developer limits | То же |
| `GET /api/market/my-templates` | require_developer_plan | `market.py` | developer limits | Кабинет только developer |
| `POST /api/market/templates/{id}/submit` | require_developer_plan | `market.py` | developer limits | То же |
| install market item (template) | check_max_bots | `market.py` | plan limits | Создаёт бота → лимит всех ботов |
| `POST /messages/` | UserQuota | `message.py` | quota, не plan | 1000 default; платное сообщение ≠ стоп бота |
| `POST /me/plan` | plan exists | `account.py` | mock | Нет оплаты, риск abuse |
| `check_can_use_analytics` | can_use_analytics | — | не используется | Мёртвый код / будущее |
| `check_can_sell_templates` | can_sell_templates | — | не используется | Mock-идеология продаж |
| Analytics routes | bot ownership | `analytics.py` | ACL бота | Не тариф |
| `require_role([...])` | users.role | разные роутеры | роль ЛК | Не путать с тарифом |

---

## 9. Тесты

| Тест | Что проверяет | Покрывает финальную модель? | Что добавить |
| ---- | ------------- | --------------------------- | ------------ |
| `test_plans.py` | GET /plans, /me plan_code, POST /me/plan | Частично (legacy codes) | start/business/…, запрет mock в prod |
| `test_publish.py` | publish с pro plan | Нет (нужен publish на start) | free/start publish ok |
| `test_market_template_publish_access.py` | template только developer | **Против** (ожидает 403 без developer) | Переписать под «все тарифы» |
| `test_my_templates.py` | developer + my-templates | Против | publish без developer plan |
| `test_moderation.py` | developer plan | Частично | — |
| `test_billing.py` | quota, paid messages | Частично | sync с plan limits, block at 100% |
| `test_payment.py` | CRUD payments | Нет | subscription flow |
| `test_market_access_*.py` | request/grant/status | **Да** (marketplace policy) | — |
| `test_market_install.py` | install free items | Частично | active_bots limit |
| `test_access_control.py` | team role developer edit | Роли команды, не тариф | — |
| frontend e2e | smoke, demo | Нет тарифов | pricing, limits UI |

### Предлагаемая матрица (будущие тесты)

- plan × feature (publish, marketplace, analytics export)
- plan × limit (active_bots, messages, team)
- role × action (команда)
- marketplace: free install; paid request/grant/install
- subscription: active / expired
- package: active / expired; не перенос остатка
- gift: active / expired
- messages: 70/85/95/100% уведомления
- active bot limit; channel 1 per bot
- marketplace открыт на «Старт»

---

## 10. Риски

### Высокий риск

| Риск | Детали |
| ---- | ------ |
| `POST /me/plan` в production | Самоназначение любого тарифа |
| Две системы лимитов | `plans` vs `UserQuota` — рассинхрон |
| Developer-gate на marketplace publish | Блокирует продуктовую модель «всем на Старт» |
| max_bots считает черновики | Пользователь не сможет создавать черновики сверх лимита «активных» |
| Нет stop-processing при лимите сообщений | Только платные сообщения по 1 ₽ |

### Средний риск

| Риск | Детали |
| ---- | ------ |
| Hardcoded FALLBACK_PLANS / BUSINESS_FEATURES | Неверные тарифы при падении API |
| Legacy Purchase/marketplace | Путаница при рефакторинге |
| `PATCH /billing/quota` | Обход лимитов в тестах/злоупотребление |
| Смешение developer role/plan | Неверные UI-блокировки |
| Нет подписок и периодов | Невозможно автопродление и учёт месяца |

### Низкий риск

| Риск | Детали |
| ---- | ------ |
| `check_can_use_analytics` не вызывается | Поведение «как будто аналитика открыта» |
| marketplace.py не в main | Мёртвый код до удаления |
| Английские name в plans (Free, Pro) | Русификация UI отдельным этапом |

---

## 11. Рекомендуемая дорожная карта внедрения

| Этап | Содержание |
| ---- | ---------- |
| 0 | Документ концепции — **готово** (`TARIFFS_FINAL_CONCEPT.md`) |
| 1 | Аудит — **готово** (этот документ) |
| 2 | Проектирование backend-моделей тарифов и пакетов |
| 3 | Миграции БД (plans v2, addons, subscriptions, usage, gifts, audit) |
| 4 | Сервис лимитов (период, active bots, messages, addons) |
| 5 | Проверки лимитов в backend (bot, channel, message runtime, team) |
| 6 | API тарифов и лимитов пользователя |
| 7 | Раздел «Финансы и лимиты» (frontend) |
| 8 | Раздел «Платежи» / интеграция провайдера |
| 9 | Админка: тарифы |
| 10 | Админка: пакеты |
| 11 | Админка: подарочные начисления |
| 12 | Журнал действий администратора |
| 13 | Marketplace и тарифы (снять Developer-gate, сохранить request/grant) |
| 14 | Русификация тарифов и marketplace |
| 15 | Авторекомендации пакетов |
| 16 | Защита экономики тарифов (цены пакетов vs апгрейд) |
| 17 | Backend tests (матрица выше) |
| 18 | Frontend tests |
| 19 | Финальная проверка / smoke |

---

## 12. Файлы, которые нужно будет менять позже

### Backend

- `backend/models/plan.py`
- `backend/models/user.py`
- `backend/models/billing.py`
- `backend/models/payment.py` (+ новые: subscription, addon, usage, gift, audit)
- `backend/utils/plan_limits.py`
- `backend/routers/account.py` (me/plan → subscription или admin-only)
- `backend/routers/plans.py`
- `backend/routers/billing.py`
- `backend/routers/payment.py`
- `backend/routers/bot.py`, `backend/routers/channels.py`, `backend/routers/channel_webhooks.py`
- `backend/routers/message.py`
- `backend/services/channel_runtime.py`
- `backend/routers/scenario.py`
- `backend/routers/market.py`, `backend/routers/market_admin.py`
- `backend/routers/team.py`
- `backend/routers/platform_admin.py` (новые разделы тарифов)
- `backend/main.py`
- `backend/migrations/versions/*` (новые revisions)
- Legacy (отдельный этап): `backend/routers/marketplace.py`, `purchase.py`, `models/purchase.py`

### Frontend

- `frontend/src/pages/Pricing.jsx`, `Pricing.css`
- `frontend/src/api/plans.ts`
- `frontend/src/constants/roles.ts`
- `frontend/src/components/AccessLocked.tsx`
- `frontend/src/features/dashboard/pages/BalancePage.tsx` (или новый FinanceLimits)
- `frontend/src/pages/MarketplacePage.tsx`, `MarketItemDetailPage.tsx`
- `frontend/src/pages/DeveloperTemplatesPage.tsx` (переименование/доступ)
- `frontend/src/api/market.ts`
- `frontend/src/stores/authStore.ts` (plan metadata)

### Tests

- `backend/tests/test_plans.py`
- `backend/tests/test_publish.py`
- `backend/tests/test_market_template_publish_access.py`
- `backend/tests/test_billing.py`, `test_payment.py`
- `backend/tests/test_market_*.py` (дополнить)
- Новые: subscription, addons, gifts, limits matrix
- `frontend/tests/e2e/*` (pricing, limits)

### Docs

- `docs/plans.md` — устарел, заменить ссылкой на `TARIFFS_FINAL_CONCEPT.md`
- `docs/TARIFFS_CODE_AUDIT.md` — обновлять по этапам

### Migrations

- Новые revisions только вперёд; **не править** `plans_012`, `plans_developer_013`.

---

## 13. Что нельзя менять без отдельного задания

- Подключать P2P payments между пользователями за шаблоны/сценарии.
- Удалять legacy `marketplace` / `purchase` без отдельного этапа и проверки данных.
- Ломать цепочку marketplace access request / grant / chat.
- Менять рабочую ветку с чужими незакоммиченными изменениями (на момент аудита — чисто).
- Глобальный редизайн UI тарифов.
- Mobile-first рефакторинг (`04-mobile.mdc`).
- Ломать существующие тесты без плана миграции тестов.
- Внедрять миграции или переписывать marketplace policy **в рамках аудита** (только документы).

---

## Связанные документы

- [TARIFFS_FINAL_CONCEPT.md](./TARIFFS_FINAL_CONCEPT.md) — утверждённая модель
- [plans.md](./plans.md) — **legacy**, описывает free/pro/team/developer
- [ACCESS_CONTROL_IMPLEMENTATION.md](./ACCESS_CONTROL_IMPLEMENTATION.md) — роли ЛК (не тарифы)
