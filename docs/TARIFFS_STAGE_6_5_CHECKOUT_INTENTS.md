# Этап 6.5 — Order and checkout-intent foundation

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `6108894`

---

## Аудит (кратко)

| Сущность | Назначение | Для тарифов 6.5 |
|----------|------------|-----------------|
| `BillingRecord` | учёт сообщений/квот | не подходит |
| `Payment` | legacy Telegram/marketplace | не расширяли |
| `Purchase` / `MarketOrder` | шаблоны / фриланс | не трогали |

Новая таблица: `checkout_intents` — pending-заказ без оплаты и без entitlement.

---

## Модель `CheckoutIntent`

Поля: `user_id`, `product_type` (`tariff`|`addon`), `product_code`, `product_name`, `description`, `amount`, `currency`, `status=pending`, `idempotency_key`, timestamps.

Уникальность: `(user_id, idempotency_key)`.

---

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/me/checkout-intents` | JWT |
| GET | `/me/checkout-intents/{id}` | JWT, только свои |

Тело create: `{ product_type, code, idempotency_key }`.  
Цена/валюта/описание — только из активного публичного каталога (`is_active` + `is_public`).

Создание **не** создаёт `UserSubscription` / `UserAddon` / `GiftGrant`.

---

## Миграция

`backend/migrations/versions/checkout_intents_021.py`  
`down_revision = tariff_system_007`

---

## Changed files

- `backend/models/checkout.py`
- `backend/models/__init__.py`
- `backend/migrations/versions/checkout_intents_021.py`
- `backend/services/checkout_intents.py`
- `backend/schemas/checkout.py`
- `backend/routers/checkout.py`
- `backend/main.py`
- `backend/tests/test_checkout_intents.py`
- `docs/TARIFFS_STAGE_6_5_CHECKOUT_INTENTS.md`

---

## Не менялось

frontend, marketplace, BalancePage, payments provider, legacy webhook, `POST /messages/`.

---

## Tests

```text
pytest backend/tests/ -k "checkout or payment or tariff or addon" -q
→ 140 passed, 225 deselected

pytest backend/tests/ -q
→ 361 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit:

```text
backend: add checkout intent foundation
```
