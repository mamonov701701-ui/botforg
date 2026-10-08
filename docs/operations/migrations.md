# Database Migration Chain (цепочка миграций БД)

Current single Alembic head: `custom_block_trust_schema_repair_052`.

## `custom_block_trust_schema_repair_052`

Repair migration после `custom_block_free_paid_trust_051`: в development SQLite ревизия 051 была записана, но таблица `trust_safety_reports` и её индексы отсутствовали. 052 проверяет объекты схемы 051, создаёт только отсутствующие таблицы/индексы и nullable price columns, а корректные объекты и данные не пересоздаёт. Некорректная структура существующей таблицы вызывает ошибку для отдельного разбора. Downgrade 052 возвращает только revision marker на 051: удалять объекты, принадлежащие 051, или их данные при таком откате нельзя. Миграция 051 остаётся неизменной.

## `ai_credit_ledger_040`

Создаёт AI credit ledger, buckets и debit allocations для grant/debit/expiry/revoke audit trail. Данные не мигрируются в spendable balance этой migration: opening grants выполняет отдельная идемпотентная cutover command. Downgrade удаляет эти таблицы; это разрушительно для ledger data и не является operational rollback plan.

## `legacy_plan_codes_to_current_041`

Нормализует `users.plan_code`: `free → start`, `pro → business_pro`, `developer → team`. Она затрагивает historical metadata, а не создаёт entitlement. Unknown non-empty legacy code вызывает fail-closed migration error, а не silent mapping. Downgrade возвращает только известные mappings; он не может восстановить исходное различие legacy значений после нормализации.

Development использует SQLite. Production target — PostgreSQL, но полная readiness для текущих 040/041 не заявляется без отдельного PostgreSQL gate. Перед upgrade необходимы backup, проверка revision chain и отсутствие неизвестных legacy codes.
