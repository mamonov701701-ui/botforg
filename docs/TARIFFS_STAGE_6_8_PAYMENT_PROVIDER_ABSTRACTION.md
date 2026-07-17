# Этап 6.8 — Payment provider abstraction

**Дата:** 2026-07-17
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `c882057`

---

## Интерфейс

`backend/payments/base.py` → `PaymentProvider`:

- `create_payment`
- `get_payment_status`
- `verify_and_parse_webhook`
- `cancel_payment`
- `refund_payment`

DTO / статусы: `backend/payments/dto.py`  
Нормализованные статусы: `pending`, `succeeded`, `failed`, `cancelled`, `refunded`.

---

## Registry

`backend/payments/registry.py`

- `get_payment_provider(name=None)` / `get_default_payment_provider()`
- `list_available_provider_names()` / `provider_config_public_view()`
- Выбор провайдера **не** в tariff / checkout / entitlement services
- Общие payment services **не** импортируют SDK YooKassa/Robokassa/CloudPayments

Fake: `backend/payments/providers/fake.py` — только non-production + (`TESTING` | `PAYMENT_PROVIDER_TEST_MODE` | `ALLOW_FAKE_PAYMENT_PROVIDER`).

---

## Конфигурация (env)

| Переменная | Назначение |
|------------|------------|
| `PAYMENT_PROVIDER_DEFAULT` | default имя (сейчас `yookassa`) |
| `PAYMENT_PROVIDERS_AVAILABLE` | CSV список имён |
| `PAYMENT_PROVIDER_TEST_MODE` | разрешить fake вне production |
| `ALLOW_FAKE_PAYMENT_PROVIDER` | явный opt-in fake вне production |
| `YOOKASSA_*` / `STRIPE_*` / `CLOUDPAYMENTS_*` | секреты только в env |

`PaymentAttempt.provider` сохраняет имя на момент создания; смена default не меняет старые attempts.

---

## Как добавить нового провайдера

1. Создать `backend/payments/providers/<name>.py` с классом `PaymentProvider`.
2. Импортировать SDK **только** внутри этого файла.
3. Зарегистрировать сборку в `_build_provider` (`registry.py`).
4. Добавить имя в `PAYMENT_PROVIDERS_AVAILABLE` / `KNOWN_PROVIDER_NAMES`.
5. Положить секреты в env (и `.env.example` без значений).
6. Покрыть unit-тестами verify_webhook + normalize status.
7. Не менять `fulfill_paid_intent` под конкретного провайдера.

---

## Что позже будет в админке

- выбор default provider;
- enable/disable провайдера;
- test_mode toggle (non-prod);
- статус «secrets configured» (без показа значений);
- ротация ключей через secure secret store (не plaintext UI).

Админка **не** должна возвращать raw secret keys.

---

## Секреты: хранение и маскирование

- Хранение: только env / secret manager (сейчас env).
- В API/логах: `mask_secret()` / `provider_config_public_view()` → только boolean `secrets_configured`.
- Запрещено: коммит `.env`, ответы webhook debug с полным secret, запись secret в `PaymentAttempt` / `PaymentWebhookEvent`.

---

## Fail-closed

- production → fake всегда запрещён, даже при флагах;
- unknown provider → error;
- unimplemented real provider → `provider_not_implemented` (нет тихого no-op).

---

## Changed files

- `backend/payments/**`
- `backend/settings.py`
- `backend/services/payment_fulfillment.py` (resolve default provider name)
- `backend/tests/test_payment_provider_abstraction.py`
- `backend/.env.example`, `backend/env.example`, `.env.example`
- `docs/TARIFFS_STAGE_6_8_PAYMENT_PROVIDER_ABSTRACTION.md`

---

## Tests

```text
pytest backend/tests/ -k "payment or provider or checkout or fulfillment" -q
→ 39 passed, 346 deselected

pytest backend/tests/ -q
→ 381 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit:

```text
backend: add payment provider abstraction
```
