# Этап 6.14.9B-1A — Юридические версии и блокировка реальных продаж

**Ветка:** `chore/fresh-clean`  
**База:** `dbfb488`  
**Тип:** backend CMS редакций юр. документов, checklist готовности, gate production-платежей, snapshot на CheckoutIntent.  
**Без:** frontend SPA, формулы пакетной скидки, автопродления, editor, legacy webhook.

## Модели

| Таблица | Назначение |
|--------|------------|
| `legal_document_revisions` | Редакции документов (тип, slug, version, status, body, sha256, internal_notes) |
| `legal_launch_checklist_items` | Чек-лист готовности к запуску |
| `consents` (+ поля) | `revision_id`, `source`, `content_sha256`, `confirmation_result` |
| `checkout_intents` (+ поля) | Legal snapshot: offer/refund/tariff revision ids, units, formula version, price_grid placeholder |

Миграция: `legal_versioning_029` ← `addon_refund_reservation_028`.

## Жизненный цикл редакции

```text
draft → ready_for_review → lawyer_approved → published
                                              ↓
                                          archived
```

- Публикация **только** из `lawyer_approved`.
- `published` / `archived` **неизменяемы** (правка = новая редакция).
- При publish предыдущая published того же `doc_type` → `archived`.
- Одновременно одна published на тип.
- `internal_notes` только в admin API / никогда в public.

## Согласия

Отдельные события на тип (оферта ≠ ПДн ≠ реклама ≠ автоплатёж).  
Поля: revision (если есть), version, user, at, IP, UA, source (`registration|login|checkout|settings`), content_sha256, confirmation_result.

Legacy `POST /legal/consent` сохранён для AuthModal.

## Снимок покупки

При `create_checkout_intent` (если есть published):

- `offer_revision_id`, `refund_policy_revision_id`, `tariff_terms_revision_id`
- `product_units`, `refund_formula_version=proportional_v1`
- `price_grid_snapshot=null` (зарезервировано под 9Б-2)
- `legal_snapshot_at`

Старые intents **не** backfill-ятся. Смена опубликованной оферты **не** меняет уже записанный snapshot.

## Юридическая готовность

Backend `compute_legal_launch_status()`:

- все пункты checklist `is_completed`;
- все `REQUIRED_PUBLISHED_DOC_TYPES` имеют published-редакцию;
- `required_revisions_published` синхронизируется с фактом публикаций (не доверяем frontend).

`legal_launch_ready` **не** принимается от клиента.

## Блокировка платежей

При `ENVIRONMENT=production` и `not legal_launch_ready`:

- `create_checkout_intent` → `legal_launch_not_ready`
- `start_checkout_payment` → `legal_launch_not_ready` (403)

development / test — **не** блокируются.  
Проверки payment connection readiness **сохраняются**.

## API

**Public (без auth):**

- `GET /legal/documents`
- `GET /legal/documents/{slug}`
- `GET /legal/documents/{slug}/versions/{version}`
- `GET /legal/documents/{slug}/archive`
- legacy `/legal/docs`, `/legal/doc/{type}`, `/legal/consent`

**Admin (`require_tariff_admin`):**

- CRUD lifecycle `/api/admin/legal/revisions...`
- `/api/admin/legal/checklist`, `PATCH .../{item_key}`
- `/api/admin/legal/launch-status`

## Ограничения этапа

- Нет frontend `/legal` SPA и кабинета согласий.
- Нет окончательных юридических текстов и авто-publish текущего md-пакета.
- Нет формулы пакетной скидки.
- Текущий md-пакет **не** считается lawyer-approved / published.

## Файлы

- `backend/models/legal.py`, `checkout.py`
- `backend/migrations/versions/legal_versioning_029.py`
- `backend/services/legal_documents.py`, `legal_consent.py`, `legal_launch.py`
- `backend/routers/legal.py`, `legal_admin.py`
- `backend/schemas/legal.py`
- `backend/services/checkout_intents.py`, `checkout_pay.py`
- `backend/tests/test_legal_versioning.py`
- этот документ
