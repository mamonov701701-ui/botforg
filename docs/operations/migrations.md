# Database Migration Chain (цепочка миграций БД)

Current single Alembic head: `legacy_plan_codes_to_current_041`.

## `ai_credit_ledger_040`

Создаёт AI credit ledger, buckets и debit allocations для grant/debit/expiry/revoke audit trail. Данные не мигрируются в spendable balance этой migration: opening grants выполняет отдельная идемпотентная cutover command. Downgrade удаляет эти таблицы; это разрушительно для ledger data и не является operational rollback plan.

## `legacy_plan_codes_to_current_041`

Нормализует `users.plan_code`: `free → start`, `pro → business_pro`, `developer → team`. Она затрагивает historical metadata, а не создаёт entitlement. Unknown non-empty legacy code вызывает fail-closed migration error, а не silent mapping. Downgrade возвращает только известные mappings; он не может восстановить исходное различие legacy значений после нормализации.

Development использует SQLite. Production target — PostgreSQL, но полная readiness для текущих 040/041 не заявляется без отдельного PostgreSQL gate. Перед upgrade необходимы backup, проверка revision chain и отсутствие неизвестных legacy codes.
