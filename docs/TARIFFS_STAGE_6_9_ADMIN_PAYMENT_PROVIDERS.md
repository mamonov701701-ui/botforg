# Этап 6.9 — Admin payment provider settings backend

**Дата:** 2026-07-17
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `a9335e6`

---

## Модель и миграция

Таблица `payment_provider_settings` (`payment_provider_settings_023`):

- `code`, `display_name`, `enabled`, `mode` (test/production), `currency`, `priority`
- `is_default_for_new_payments`
- `last_health_check_*`, `last_webhook_*`
- **без** secret fields

Seed: yookassa (default), cloudpayments, stripe, robokassa, fake.

---

## Endpoints

Prefix: `/api/admin/payment-providers`

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/{code}` |
| PATCH | `/{code}` |
| POST | `/{code}/set-default` |
| POST | `/{code}/health-check` |

Permissions: `owner` / `admin` / BF «BF Администратор» (`require_tariff_admin`).

---

## Что в админке / что в env

**Админка:** enabled, mode, currency, priority, display name, default, health/webhook status, readiness.

**Env only:** `YOOKASSA_*`, `STRIPE_*`, `CLOUDPAYMENTS_*`, Robokassa passwords, fake flags.

API возвращает `configured`, `masked_identifiers`, `missing_required_settings`, `readiness_status` — никогда полные ключи.

---

## Fail-closed

- fake нельзя включить / сделать default в production;
- default только для enabled + готового провайдера;
- production default без secrets / без adapter → 409;
- смена default не меняет старые `PaymentAttempt.provider`.

---

## Безопасная смена провайдера

1. Настроить secrets в env на сервере.
2. Health-check нового провайдера.
3. Включить (`enabled=true`), mode=test → проверить.
4. `set-default` на новый код.
5. Старые attempts остаются на прежнем provider.
6. При ошибке: `set-default` обратно на предыдущий готовый провайдер.

---

## Восстановление

- Audit: `payment_provider_update` / `set_default` / `health_check` в `AdminAuditLog` (safe before/after).
- Вернуть default через `POST .../set-default` на прежний код.
- Не удалять env-секреты старого провайдера до стабилизации.

---

## Будущий экран админки (фирменный стиль BotForg)

- фон DARK `#0A1B3D`, акцент AMBER `#FFB300`, danger `#FF3B30`;
- русский UI, логотип BotForg, существующая дизайн-система;
- таблица провайдеров: статус readiness, default badge, masked shop id;
- карточка провайдера: toggle enabled, mode, priority, health-check;
- модалки подтверждения смены default;
- адаптив; без стороннего визуального стиля.

---

## Tests

```text
pytest backend/tests/ -k "payment_provider or provider_settings or admin or payment" -q
→ 53 passed, 343 deselected

pytest backend/tests/ -q
→ 392 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit:

```text
admin: add payment provider settings backend
```
