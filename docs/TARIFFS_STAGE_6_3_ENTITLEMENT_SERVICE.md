# Этап 6.3 — Gate mock plan write and entitlement service

**Дата:** 2026-07-16  
**Ветка:** `chore/fresh-clean`  
**HEAD до изменений:** `bb9e130`  
**Опора:** аудит 6.2 (tariff write API contract)

---

## 1. Закрытые bypass

| Endpoint | Было | Стало |
|----------|------|--------|
| `POST /me/plan` | любой auth user менял `plan_code` | 403, если не (non-production **и** `ALLOW_DEV_TARIFF_FULFILLMENT=true`) |
| `PATCH /billing/quota` | пользователь менял legacy `UserQuota` | тот же fail-closed gate |

Gate: `backend/services/dev_tariff_gate.py`.  
В production всегда запрещено, даже при флаге.

Тесты включают `ALLOW_DEV_TARIFF_FULFILLMENT=true` через `conftest` (ENVIRONMENT ≠ production).

---

## 2. Entitlement service (internal)

Модуль: `backend/services/tariff_entitlements.py`

| Функция | Назначение |
|---------|------------|
| `activate_subscription` | ACTIVE `UserSubscription`; overlap → cancel (replace) или error; idempotent по `provider_subscription_id` |
| `create_user_addon` | ACTIVE `UserAddon` с явным `source`; amount из каталога |
| `grant_gift` / `revoke_gift` | ACTIVE / CANCELLED `GiftGrant` |
| `expire_entitlements(now)` | ACTIVE → EXPIRED по `period_end` / `ends_at` |

Контракт:

- транзакционно (`commit` / `flush`);
- явный `source` для addon;
- валидация period start &lt; end;
- запрет пересекающихся ACTIVE subscriptions (`replace_active=False` → error);
- idempotent повтор по `provider_subscription_id`;
- нет цен от клиента, нет публичных purchase endpoints, нет имитации оплаты.

---

## 3. Изменённые файлы

- `backend/settings.py` — `ALLOW_DEV_TARIFF_FULFILLMENT`
- `backend/services/dev_tariff_gate.py` — новый
- `backend/services/tariff_entitlements.py` — новый
- `backend/routers/account.py` — gate `/me/plan`
- `backend/routers/billing.py` — gate `/billing/quota`
- `backend/tests/conftest.py` — flag для pytest
- `backend/tests/test_tariff_entitlements.py` — новый
- `backend/.env.example` — документация флага
- `docs/TARIFFS_STAGE_6_3_ENTITLEMENT_SERVICE.md` — этот документ

---

## 4. Не менялось

payments provider, frontend, marketplace, миграции, legacy webhook, `POST /messages/`, summary/enforcement business logic.

---

## 5. Результаты тестов

```text
pytest backend/tests/ -k "tariff or entitlement or billing" -q
→ 125 passed, 219 deselected

pytest backend/tests/ -q
→ 340 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit (не создан):

```text
backend: gate mock plan changes and add entitlement service
```
