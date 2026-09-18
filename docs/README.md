# BotForg Documentation

## CURRENT / CANONICAL

These documents are the technical source of truth for their domains. Where an older stage document conflicts, the canonical document wins.

### Architecture
- [AI Credits Architecture (архитектура ИИ-кредитов)](architecture/ai-credits.md) — credits, ledger, buckets, allocations and provider boundary.

### Billing
- [Effective Entitlement (фактические права пользователя)](billing/effective-entitlement.md) — base-plan resolver and legacy boundary.
- [Refund Technical Policy (техническая политика возвратов)](billing/refunds-technical-policy.md) — technical refund and entitlement behavior.

### API
- [API documentation](technical/API_DOCS.md) — existing REST contracts. AI Credits API scope is recorded in the architecture document above.

### Operations
- [Database Migration Chain (цепочка миграций БД)](operations/migrations.md) — current migration head and 040/041.
- [Development ports](DEV_PORTS.md) — local service ports.

### Security
- [Security](SECURITY.md) — existing security technical material.
- [Auth and middleware](development/AUTH_AND_MIDDLEWARE.md) — runtime auth request handling.

### Legal inputs
- [Technical Facts for Legal Inputs (технические факты для юридических входных данных)](legal-inputs/technical-facts.md) — verified technical facts; not a legal policy.

### ADR
No current ADRs have been established in this repository. Add future decision records under `adr/`.

## HISTORICAL / SUPERSEDED

Stage reports and older implementation notes remain evidence of their original work; they are not current contracts. See markers in [plans.md](plans.md), [USER_DATABASE_STRUCTURE.md](technical/USER_DATABASE_STRUCTURE.md) and [POSTGRES_MIGRATION_CHAIN_CLEANUP.md](POSTGRES_MIGRATION_CHAIN_CLEANUP.md). The `TARIFFS_STAGE_*` documents are historical unless a canonical document explicitly incorporates their current behavior.

## Documentation Definition of Done (критерий готовности документации)

Every future stage must check:

- architecture/scope;
- data contract;
- API contract;
- lifecycle/invariants;
- UI contract;
- operations/rollout;
- tests;
- legal impact note;
- docs index update;
- supersession marker for obsolete documentation.
