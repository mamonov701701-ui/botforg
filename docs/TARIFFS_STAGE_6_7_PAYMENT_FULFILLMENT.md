# Этап 6.7 — Payment attempt model and provider-agnostic fulfillment

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `b08d93a`

---

## Модели и миграция

Миграция: `payment_fulfillment_022` ← `checkout_intents_021`

| Таблица / поле | Назначение |
|---------------|------------|
| `checkout_intents.status` | `pending`, `awaiting_payment`, `paid`, `fulfilled`, `failed`, `cancelled`, `refunded` |
| `checkout_intents` timestamps | `paid_at`, `fulfilled_at`, `failed_at`, `cancelled_at`, `refunded_at` |
| `checkout_intents` links | `payment_provider`, `provider_payment_id`, `fulfilled_subscription_id`, `fulfilled_addon_id` |
| `payment_attempts` | попытка оплаты (provider-agnostic) |
| `payment_webhook_events` | идемпотентные webhook events |
| `user_addons.provider_ref` | unique idempotency key для addon |

---

## Контракт fulfillment

`fulfill_paid_intent(...)` в `backend/services/payment_fulfillment.py`:

1. upsert `PaymentWebhookEvent` по `(provider, provider_event_id)`;
2. ownership check (`user_id`);
3. amount/currency == snapshot intent;
4. block `cancelled` / `failed` / `refunded`;
5. если уже `fulfilled` → no-op (`already_fulfilled`);
6. attempt → `succeeded`;
7. `activate_subscription` / `create_user_addon` (`commit=False`);
8. intent → `fulfilled` + FK entitlement;
9. event → `processed`;
10. единый `commit` (ошибка → rollback, event → `error` для retry).

Вспомогательно: `create_payment_attempt` (intent → `awaiting_payment`).

**Нет** YooKassa, `/pay`, webhook HTTP endpoints.

---

## Idempotency

- webhook: unique `(provider, provider_event_id)`;
- subscription: `provider_subscription_id = "{provider}:{payment_id}"`;
- addon: `provider_ref` unique + lookup в `create_user_addon`;
- out-of-order `failed` после `fulfilled` → `ignored`, без downgrade.

---

## Changed files

- `backend/models/checkout.py`
- `backend/models/tariff.py` (`provider_ref`)
- `backend/models/__init__.py`
- `backend/migrations/versions/payment_fulfillment_022.py`
- `backend/services/tariff_entitlements.py`
- `backend/services/payment_fulfillment.py`
- `backend/schemas/checkout.py`
- `backend/tests/test_payment_fulfillment.py`
- `docs/TARIFFS_STAGE_6_7_PAYMENT_FULFILLMENT.md`

---

## Tests

```text
pytest backend/tests/ -k "payment or checkout or fulfillment or tariff or addon" -q
→ 151 passed, 225 deselected

pytest backend/tests/ -q
→ 372 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit:

```text
backend: add payment attempt model and fulfillment contract
```
