# Refund Technical Policy (техническая политика возвратов)

Это описание технического поведения, не юридическая refund policy (политика возвратов).

Refund request проходит lifecycle draft/revision, approval, provider execution/reconciliation и entitlement application. Refund ledger и audit events фиксируют попытки, provider outcome и изменение статуса. Partial refund допустим, пока ledger сохраняет refundable amount; полный подтверждённый refund исчерпывает доступный остаток и блокирует дальнейший refund сверх него.

Execution использует idempotency key и reservation: повтор завершённого результата возвращает already-completed outcome. При provider-unknown с известным provider refund id выполняется reconciliation; без id требуется manual recovery вместо небезопасного повторного денежного POST. Optimistic versioning и addon reservation защищают конкурирующие операции.

Поддерживаемые subscription actions: `cancel_immediate`, `cancel_at`, `expire_at`. Addon actions: `cancel`, `expire`, `reduce` там, где это поддерживает revision/action contract. Entitlement mutation применяется только к объекту fulfilled purchase, не к произвольным subscription, addon или gift.

AI Credits имеют особую границу: automatic monetary refund AI-credit addon запрещён и требует manual review/safe block. Spent credits не возвращаются; generic refund path не должен silently mutate AI-credit ledger. Полный контракт исторических этапов находится в `TARIFFS_STAGE_6_14_*`; этот документ является current technical summary.
