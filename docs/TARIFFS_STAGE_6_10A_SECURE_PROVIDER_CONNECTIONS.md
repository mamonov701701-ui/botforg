# Этап 6.10A — Secure payment provider connections

**Дата:** 2026-07-17  
**Ветка:** `chore/fresh-clean`  
**HEAD до изменений:** `a2f3fbd`  
**Предлагаемый commit:** `backend: add secure payment provider connections`

---

## Аудит `payment_provider_settings` (6.9)

| Аспект | Решение |
|--------|---------|
| Таблица | **Сохранена** без удаления/ломающих изменений |
| Секреты | По-прежнему **не** в БД (только env readiness для 6.9 UI) |
| Конфликт | Новая модель `payment_provider_connections` — multi-connection + encrypted credentials |
| Миграция данных | Секретов в settings не было → в connections **не** копируются plaintext. Settings остаются источником для legacy `/api/admin/payment-providers` |
| Default | `create_payment_attempt`: сначала verified+enabled connection `is_default`, иначе settings/env (6.9) |
| PaymentAttempt | Добавлен nullable `connection_id` (ON DELETE SET NULL); строка `provider` — snapshot, не меняется |

---

## Threat model (кратко)

| Угроза | Митигация |
|--------|-----------|
| Утечка секретов через API | Secret values никогда не в response; только schema field names + masked public ids |
| Утечка через audit | Audit: field names, masked ids, versions — без plaintext/ciphertext/nonce/tag |
| Утечка через логи/repr | Exceptions/repr без payload; wipe локальных ссылок после verify |
| Кража DB dump | AES-256-GCM; без master key ciphertext бесполезен |
| Подмена ciphertext | GCM auth tag → decrypt fail-closed |
| Неверный/отсутствующий master key | Fail-closed; в production без ключа encrypt/decrypt запрещены |
| Fake в production | Create/default fake → 403 |
| Planned adapter | Create → 409 `adapter_planned` |
| Privilege escalation | Credentials write/verify/delete — только `User.role=owner` |
| Удаление при активных платежах | DELETE запрещён при attempt status ∈ {created, pending} |

---

## Encryption envelope

**Алгоритм:** AES-256-GCM (`cryptography.hazmat.primitives.ciphers.aead.AESGCM`)

**Колонки:**

- `credentials_encryption_version`
- `credentials_key_id`
- `credentials_nonce` (12 bytes, unique per encrypt)
- `credentials_ciphertext`
- `credentials_auth_tag` (16 bytes)
- `credentials_version` (инкремент при каждом write/replace)

**Payload:** UTF-8 JSON object field→value (только на время encrypt/decrypt в памяти).

---

## Master-key management

| Env | Назначение |
|-----|------------|
| `PAYMENT_CREDENTIALS_MASTER_KEY` | 32 bytes как urlsafe-base64 или hex; **не** в БД |
| `PAYMENT_CREDENTIALS_KEY_ID` | Логический id ключа (default `default`) |
| `PAYMENT_CREDENTIALS_ENCRYPTION_VERSION` | Версия envelope (default `1`) |

- Production: ключ обязателен (fail-closed).
- `TESTING=true` без ключа: детерминированный test-only key (только pytest).
- Dev без ключа: fail-closed (нужно выставить env).

Генерация:  
`python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"`

### Key rotation strategy

1. Сгенерировать новый master key + новый `PAYMENT_CREDENTIALS_KEY_ID`.
2. Добавить re-encrypt job (будущий этап): decrypt старым key_id → encrypt новым → bump version.
3. Пока dual-key не реализован — ротация = downtime/re-enter credentials через `PUT .../credentials`.
4. Старые PaymentAttempt не зависят от ciphertext connection.

### Backup / restore

- Бэкап БД содержит только ciphertext envelope.
- Без отдельного безопасного бэкапа master key восстановление credentials невозможно → потребуется повторный ввод в админке.
- Master key хранить в Secret Manager / KMS, не в git.

### Production Secret Manager / KMS

- Вынести `PAYMENT_CREDENTIALS_MASTER_KEY` в Vault / AWS KMS / GCP Secret Manager.
- Желательно envelope encryption (DEK в БД, KEK в KMS) — следующий hardening-этап.
- Аудит доступа к master key на стороне cloud IAM.

---

## Provider definitions

| code | regions | adapter_status |
|------|---------|----------------|
| yookassa | RU | **planned** |
| cloudpayments | RU | **planned** |
| tbank | RU | **planned** |
| robokassa | RU | **planned** |
| stripe | INTL | **planned** |
| paypal_braintree | INTL | **planned** |
| adyen | INTL | **planned** |
| checkout_com | INTL | **planned** |
| fake | DEV | **available** (единственный реализованный адаптер 6.8) |

**Почему planned нельзя подключить:** нет рабочего адаптера в registry → create вернёт 409. Каталог виден в UI для roadmap и построения форм по `credential_schema`.

### Как добавить definition

1. Добавить `PaymentProviderDefinition` в `backend/payments/definitions/catalog.py`.
2. Заполнить `credential_schema` с metadata (required/secret/label_ru/pattern/help/modes).
3. `adapter_status="planned"` до реализации адаптера.
4. Тест на наличие в `GET /api/admin/payment-provider-definitions`.

### Как реализовать adapter

1. Класс в `backend/payments/providers/<code>.py` по контракту `PaymentProvider`.
2. Зарегистрировать в `registry._build_provider`.
3. Сменить definition `adapter_status` → `available`.
4. Internal decrypt только в provider adapter (не в API).

---

## Admin API

| Method | Path | Rights |
|--------|------|--------|
| GET | `/api/admin/payment-provider-definitions` | viewer |
| GET | `/api/admin/payment-provider-connections` | viewer |
| GET | `/api/admin/payment-provider-connections/{id}` | viewer |
| POST | `/api/admin/payment-provider-connections` | **owner** (credentials) |
| PATCH | `.../{id}` | viewer (без credentials) |
| PUT | `.../{id}/credentials` | **owner** |
| POST | `.../{id}/set-default` | viewer (enabled+verified) |
| POST | `.../{id}/verify` | **owner** (decrypt) |
| DELETE | `.../{id}` | **owner** |

**viewer** = owner / admin / BF Администратор (`require_tariff_admin`).  
**owner** = `User.role == owner` (`require_payment_credentials_manager`).  
Отдельной привилегии `manage_payment_credentials` в RBAC пока нет — зарезервировано в docs/deps.

---

## Audit protection

Пишется в `AdminAuditLog`:  
`connection_create`, `connection_update`, `credentials_set`, `credentials_replace`, `connection_verify`, `set_default`, `connection_disable`, `connection_delete`.

Разрешено: provider_code, connection_id, changed field names, masked identifiers, actor, result, credentials_version.  
Запрещено: plaintext, ciphertext, nonce, auth tag, полный body с credentials.

---

## Verify (этот этап)

- Проверка schema + decrypt + format validation.
- Без live HTTP к провайдеру.
- Результат: `config_valid` | `adapter_not_implemented` | `invalid`.
- Planned connection создать нельзя → `adapter_not_implemented` актуален при будущем soft-state.
- `verified=True` только при `config_valid` + `adapter_status=available`.

---

## Frontend (позже)

`GET definitions` → модалка по `credential_schema` (label_ru, secret, required, pattern, help_text, allowed_modes).  
Secret inputs: type=password, send only on create/replace; никогда не ожидать secret в GET.

### Аварийное отключение

`PATCH {enabled:false}` → если был default, `is_default` снимается. Старые attempts не меняются.

### Смена default

`POST .../set-default` только для enabled+verified. Влияет только на **новые** PaymentAttempt.

---

## Миграция

`payment_provider_connections_024` ← `payment_provider_settings_023`  
SQLite: `batch_alter_table` для `payment_attempts.connection_id`.  
PostgreSQL: прямой `add_column` + FK.  
Upgrade/downgrade покрыты тестом.

---

## Остаточные риски

- Dual-key rotation ещё не автоматизирована.
- Env-legacy secrets (YOOKASSA_*) и encrypted connections сосуществуют до унификации UI.
- Только `fake` available → в production нельзя создать connection до появления реального адаптера.
- Master key loss = потеря возможности расшифровать (нужен re-enter).
