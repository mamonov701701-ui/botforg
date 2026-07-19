# Этап 6.14.4 — Refund UI и единый finance experience

**Ветка:** `chore/fresh-clean`  
**База:** `5d73f18` (`feat(billing): add refund request APIs`)  
**Тип этапа:** frontend UI возвратов + refundable purchases API + единый shell/mobile finance UX.  
**Статус:** этап завершён одним итоговым commit (без push).

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`
- `docs/TARIFFS_STAGE_6_14_1_REFUND_DATA_FOUNDATION.md`
- `docs/TARIFFS_STAGE_6_14_2_REFUND_CALCULATION_REVISIONS.md`
- `docs/TARIFFS_STAGE_6_14_3_REFUND_REQUEST_API.md`

## Цели

1. Пользовательский UI: список / создание / карточка / отмена заявки на возврат.
2. Админский UI: очередь, карточка решения, действия (recalculate, revision, needs-info, reject, confirm, approve).
3. Понятный workflow в admin-карточке (сводка → sticky actions → расчёт; вторичные блоки свёрнуты).
4. Страница «Финансы и лимиты» (улучшенное отображение usage).
5. Единый PageShell / shell-токены: кабинет, Home/Auth/Pricing, Возможности, Маркет, CRM/card chrome.
6. Mobile ~390px: drawer кабинета, компактное меню сайта, footer/scroll clearance.
7. Deep-link админ-финансов: `?tab=refunds`.

## Scope — входит

### Backend

- `GET` refundable purchases для формы создания заявки (`backend/services/refundable_purchases.py` + роут/схемы).
- Без provider refund, без entitlement mutate, без FIFO ledger payout.

### Frontend — user refunds

| Маршрут | Компонент |
|---------|-----------|
| `/dashboard/finance/refunds` | `RefundRequestsPage` |
| `/dashboard/finance/refunds/:refundId` | `RefundRequestDetailPage` |
| redirects с legacy `/dashboard/tariff/refunds*` | `main.jsx` |

API: `frontend/src/api/refunds.ts`  
Подписи: `frontend/src/features/dashboard/refunds/refundDisplay.ts`

### Frontend — admin refunds

| Место | Компонент |
|-------|-----------|
| `/dashboard/platform/finance?tab=refunds` | `RefundsAdminPanel` на `PlatformFinancePage` |

API: `frontend/src/api/refundsAdmin.ts`  
Подписи / next-step: `refundAdminDisplay.ts` (`resolveNextAdminStep`)

### Shell / mobile / public / finance UX

- `PageShell`, `SectionCard`, `shell.css`
- `DashboardLayout` (mobile drawer), `Header` (compact menu), `site-layout.css`
- PageShell на Features / Market
- Shell-токены: Home, Auth, Pricing, Marketplace, CRM, Card, botWorkspace chrome
- «Финансы и лимиты» (`TariffLimitsPage` + `tariffDisplay`)
- Deep-link tab sync в `PlatformFinancePage`

## Scope — намеренно не входит

- Provider refund / YooKassa payout
- `refund_processing` и статусы после `approved`
- Mutation тарифа / пакета / entitlement при approve
- FIFO per-addon ledger
- Изменения EditorV1 / EditorV2 / scenario graph / BotSimulator
- Локальные smoke-скрипты (`frontend/scripts/_smoke_*.mjs`) и QA screenshots
- Push в remote

## Admin card — порядок блоков

1. Сводка решения (открыта)
2. Действия администратора (sticky)
3. Расчёт возврата (открыт)
4. Сворачиваемые: пользователь и покупка → платёж → использование → история ревизий → история решений → технические детали

## Admin next-action (UI only)

| Состояние | Следующее действие | Primary CTA |
|-----------|--------------------|-------------|
| `manual_review_required` / manual flag | Указать сумму возврата | открывает admin revision form |
| `admin_edited` | Подтвердить расчёт | confirm |
| `awaiting_admin_review` / `awaiting_final_confirmation` | Одобрить заявку | approve |
| `approved` | Заявка одобрена, выплата ещё не выполнена | — |

На этапе всегда показывается:

> На этом этапе одобрение не выполняет денежный возврат и не изменяет тариф или пакет.

## Проверки

```bash
# Backend
backend\venv\Scripts\python.exe -m alembic -c backend/alembic.ini heads
backend\venv\Scripts\python.exe -m pytest backend/tests/test_refundable_purchases.py `
  backend/tests/test_refund_data_foundation.py `
  backend/tests/test_refund_calculation_revisions.py `
  backend/tests/test_refund_submit.py `
  backend/tests/test_refund_user_api.py `
  backend/tests/test_refund_admin_read.py `
  backend/tests/test_refund_admin_write.py -q

# Frontend
cd frontend
npm run typecheck
npm run lint
npx vitest run
npm run build
cd ..
git diff --check
```

## Commit

```text
feat(billing): add refund management UI and unified finance experience
```

В commit **не** входят: `_smoke_*.mjs`, `qa_artifacts/`, secrets, `.env`.
