# AI Credits Architecture (архитектура ИИ-кредитов)

## Назначение и границы

AI Credits — внутренняя единица BotForg для оплачиваемых AI/compute capabilities (ИИ-/вычислительных возможностей). Это не LLM tokens (токены модели): конвертация в токены конкретного провайдера не является частью текущего ledger. Один баланс пользователя предназначен для будущих text AI, Generator (генератора), Copilot/Assistant (ИИ-помощника), vision, image, 3D и других capabilities.

AI Provider Layer (слой подключения ИИ-провайдеров) пока не реализован. В частности, DeepSeek не подключён. Будущий provider accounting (провайдер, модель, токены, себестоимость) будет отдельным контуром и будет использовать этот ledger только для пользовательского списания.

## Grants и buckets (партии)

Есть два класса кредитов:

- **included** (включённые тарифом): создаются для актуального effective entitlement period (периода фактических прав);
- **purchased** (купленные): создаются при fulfilled `UserAddon` типа `ai_credits`.

Каждый `AiCreditBucket` хранит класс, исходное и оставшееся количество, source, `granted_at`, `expires_at`, статус и ссылку на grant ledger entry. Статусы: `active`, `depleted`, `expired`, `revoked`.

Included credits не переносятся автоматически. Immediate switch (немедленная смена тарифа) отзывает оставшийся included bucket старого entitlement и создаёт новый grant. Delayed switch (отложенная смена) не меняет текущий entitlement до конца периода. Одновременно действующие included grants не должны stack (накапливаться).

Purchased bucket имеет срок из addon grant (`validity_days`/периода addon); срок не зашит в ledger. Он доступен также пользователю Start независимо от paid subscription.

## Списание и баланс

Канонический порядок consumption (списания):

1. current included credits;
2. purchased credits с ближайшим `expires_at`;
3. при одинаковом `expires_at` — старший `granted_at`, затем stable bucket id;
4. purchased credits без срока — последними.

Debit создаёт один `debit` ledger event и `AiCreditDebitAllocation` для каждой затронутой партии. Баланс — сумма spendable active buckets; отдельная materialized balance не является source of truth. После cutover именно buckets являются единственным spendable source.

## Ledger, lifecycle и идемпотентность

`AiCreditLedgerEntry` — append-only журнал. Текущие операции: `grant`, `debit`, `expiration`, `revoke`. Для будущих контролируемых lifecycle операций используются термины `reversal` и `adjustment`, но они пока не эмитируются сервисом. `USED`, `EXPIRED` и `REVOKED` — разные причины уменьшения, они не взаимозаменяемы.

Один idempotency key с тем же meaningful payload безопасно повторяется. Тот же ключ с отличающимся payload вызывает conflict/fail closed. Debit использует conditional update bucket и при конкурентном изменении возвращает retryable conflict, не допуская отрицательный остаток.

## Refund boundary (граница возвратов)

Автоматический monetary refund (денежный возврат) для AI-credit addon запрещён: запрос направляется на manual review/safe block. Потраченные кредиты не восстанавливаются. Generic refund flow не должен молча менять AI-credit ledger или entitlement; это предотвращает расхождение денег, addon и buckets.

## Реальные API и сервисы

- `GET /me/ai-credits` — текущий баланс;
- `GET /me/ai-credits/history` — история пользователя с cursor pagination;
- `GET /api/admin/tariffs/ai-credits/ledger` — административное чтение ledger с RBAC.

Сервисы: `backend.services.ai_credits`, `ai_credit_gift_lifecycle`, `ai_credit_cutover` и entitlement services. Cutover — идемпотентная команда, не Alembic migration; legacy `plan_code` без надёжного периода не превращается в выдуманный grant и reportится для manual handling.

## Security и audit

Ledger, bucket source и allocations обеспечивают auditability. API требуют существующий auth/RBAC; финансовое решение о возврате остаётся вне AI-credit automation. Provider keys не хранятся и не используются этим контуром.
