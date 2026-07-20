# Этап 6.14.9B-1B — Интерфейс юридических документов и контроль готовности

**Ветка:** `chore/fresh-clean`  
**База:** поверх 6.14.9B-1A (рабочее дерево, без отдельного commit)  
**Тип:** frontend SPA + минимальный user API `/legal/account`  
**Без:** нового дизайна, формулы скидки, рекламного согласия, автоплатежа, backfill, реальных платежей, editor/marketplace/legacy webhook.

## Маршруты и страницы

| URL | Доступ | Назначение |
|-----|--------|------------|
| `/legal` | публичный | список published |
| `/legal/:slug` | публичный | актуальная published |
| `/legal/:slug/v/:version` | публичный | published/archived версия |
| `/legal/:slug/archive` | публичный | архив версий |
| `/dashboard/platform/legal` | admin (`owner`/`admin`) | редакции + lifecycle |
| `/dashboard/platform/legal?tab=readiness` | admin | checklist + `legal_launch_ready` |
| `/dashboard/account/legal` | текущий пользователь | согласия и purchase snapshots |
| `/features?tab=policy` | публичный | ссылки на `/legal…` |

## AuthModal

- Убрана hardcoded версия `1.0`.
- Версии берутся из `GET /legal/documents` (`privacy-policy`, `public-offer`).
- `acceptConsent` вызывается только при наличии обеих published-редакций.
- Backend `POST /legal/consent` больше не создаёт фиктивную запись без CMS published.

## Доступы

- Public legal — без авторизации; только published/archived.
- Admin legal — `require_tariff_admin` (как финансы платформы).
- Account legal — только свои данные (`GET /legal/account`); без IP / user-agent / internal_notes.

## API-клиенты

- `frontend/src/api/legal.ts` — public + account
- `frontend/src/api/legalAdmin.ts` — `/api/admin/legal/*`

## Backend (минимально для ЛК)

- `GET /legal/account` — overview для текущего пользователя
- Harden: `record_consent` / legacy accept → `no_published_revision`

## Проверки

| Проверка | Результат |
|----------|-----------|
| `frontend` typecheck | ok |
| vitest related (legal + nav) | 18 passed |
| vitest full | 39 files / 252 passed |
| `npm run build` | ok |
| lint | 0 errors (warnings без новых) |
| `git diff --check` | ok |
| `test_legal_versioning.py` | 12 passed |

Commit/push **не** выполнялись.
