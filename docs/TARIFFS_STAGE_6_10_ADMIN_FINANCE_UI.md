# Этап 6.10 — Admin finance UI foundation

**Дата:** 2026-07-17
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `a2f3fbd`

---

## Routes и components

| Путь | Компонент |
|------|-----------|
| `/dashboard/platform/finance` | `PlatformFinancePage` |
| вкладка «Платёжные провайдеры» | `PaymentProvidersPanel` |
| placeholders | `FinancePlaceholderTab` |
| confirm default | `ConfirmDefaultModal` |

Nav: пункт **Финансы** в режиме «Управление платформой» (`DashboardLayout`).

Доступ nav: `owner` и `admin` (как backend User.role gate).

---

## API integration

`frontend/src/api/paymentProvidersAdmin.ts` → `/api/admin/payment-providers`

- list / patch / set-default / health-check
- без secret fields в запросах и UI

---

## Состояния UI

loading, empty, API error, permission denied (403), incomplete configuration, health success/degraded/fail, action in progress (busy per card).

Confirm modal перед set-default; клиентские блокировки + server 409.

---

## Фирменный стиль

DARK `#0A1B3D`, AMBER `#FFB300`, DANGER `#FF3B30` (`ui/tokens.ts`), русский UI.

Унификация (UI polish):
- акцент только AMBER `#FFB300` (без legacy `#ffd24c` / orange на вкладках и пункте «Финансы»);
- панели: непрозрачный `#0A1B3D` / `#0E2348`, тонкая amber-граница;
- текст: `#F2F5FA` / вторичный `#C5CDD9` (без тусклого `--text-muted` и без просвечивания фона).

## Not Found на вкладке провайдеров

Frontend path = backend prefix: `/api/admin/payment-providers`.
Сообщение `Not Found` — ответ FastAPI 404, если процесс backend запущен **до** этапа 6.9 и не перезапущен. UI не подставляет фейковые провайдеры.

---

## Tests / checks

```text
npm run typecheck → ok
npm run lint → 0 errors (существующие warnings)
npm run build → ok
npm run test -- --run → 142 passed (включая financeHelpers 5)
```

Рекомендуемый commit:

```text
frontend: add admin finance provider settings UI
```
