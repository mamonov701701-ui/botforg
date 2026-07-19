# Этап 6.14.5 — Provider refund adapter contract

**Ветка:** `chore/fresh-clean`  
**База:** `f8f0ac5`  
**Тип:** provider-neutral refund API (Fake + YooKassa).  
**Без** orchestration, live payout, ledger writers, webhook refund, entitlement, UI.

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`
- `docs/TARIFFS_STAGE_6_14_1_REFUND_DATA_FOUNDATION.md` … `6_14_4`
- `docs/TARIFFS_STAGE_6_8_PAYMENT_PROVIDER_ABSTRACTION.md`

## Цели

1. Единый контракт создания и чтения статуса возврата у платёжного провайдера.
2. Паритет Fake ↔ YooKassa по статусам объекта возврата.
3. Caller-owned `Idempotence-Key` (не из суммы внутри adapter).
4. Безопасные ошибки timeout/network/invalid response для обработки на 6.14.6.
5. Unit-тесты без реальных вызовов ЮKassa.

## DTO

| Тип | Назначение |
|-----|------------|
| `NormalizedRefundStatus` | `pending` \| `succeeded` \| `canceled` |
| `CreateRefundRequest` | `provider_payment_id`, `amount`, `currency`, `idempotency_key`, optional `description`, optional safe `metadata` |
| `RefundPaymentResult` | результат create: id, status, amount, currency, `created_at`, `cancellation_details`, sanitized `raw` |
| `RefundStatusResult` | результат get by refund id |

`provider_unknown` **не** входит в adapter DTO. Это состояние заявки/ledger на этапе оркестрации.

## Методы `PaymentProvider`

```text
refund_payment(request: CreateRefundRequest) -> RefundPaymentResult
get_refund_status(refund_id: str) -> RefundStatusResult
```

## Idempotency

- Ключ **обязан** передать вызывающий код (ledger / request scoped на 6.14.6).
- YooKassa: заголовок `Idempotence-Key` = `request.idempotency_key` (обрезается до 64).
- Adapter **не** строит ключ из `payment_id`+amount+currency.
- Fake: replay того же ключа с тем же payload → тот же refund; другой payload → `idempotency_conflict`.

## Статусы (parity)

| YooKassa / Fake refund object | `NormalizedRefundStatus` |
|-------------------------------|--------------------------|
| `pending` | `pending` |
| `succeeded` | `succeeded` |
| `canceled` | `canceled` |
| unknown / empty id | `invalid_provider_response` |

## Безопасные ошибки

| Ситуация | `PaymentProviderError.code` |
|----------|------------------------------|
| timeout | `provider_timeout` |
| network | `provider_network_error` |
| 401 | `invalid_credentials` |
| HTTP ≥400 | `provider_http_error` |
| пустой id / unknown status / amount|currency|payment mismatch | `invalid_provider_response` |
| нет idempotency_key | `idempotency_key_required` |

Adapter **не** делает повторный POST при timeout (решает 6.14.6 через get + тот же ключ).

## Sanitized raw

Сохраняемый subset: `id`, `status`, `payment_id`, `amount`, `created_at`, `cancellation_details` (`party`, `reason` only).  
Без secret key, Authorization и прочих секретов.

## Границы этапа

### Входит

- DTO + `base.PaymentProvider` методы
- Fake + YooKassa implementations
- Unit tests (`backend/tests/test_provider_refund_adapter.py`)
- Этот документ

### Не входит (следующие этапы)

- Вызов `refund_payment` из refund services / routers
- Смена `RefundRequest.status` (`refund_processing` и далее)
- Ledger execution writers (`succeeded` / `provider_unknown`)
- Webhook `refund.*`
- Entitlement mutate
- UI
- Реальный live refund в ЮKassa

## Файлы

- `backend/payments/dto.py`
- `backend/payments/base.py`
- `backend/payments/__init__.py`
- `backend/payments/providers/fake.py`
- `backend/payments/providers/yookassa.py`
- `backend/tests/test_provider_refund_adapter.py`
- `docs/TARIFFS_STAGE_6_14_5_PROVIDER_REFUND_ADAPTER.md`
