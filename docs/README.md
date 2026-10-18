# BotForg Documentation

- [Custom Block Lifecycle](architecture/custom-block-lifecycle.md) — CURRENT / CANONICAL: immutable versions, passport, archive/restore and EditorV2 references.
- [Custom Block Engineering Contract](development/CUSTOM_BLOCK_ENGINEERING.md) — правила добавления и версионирования типов.
- [Как создать свой блок](user/CUSTOM_BLOCKS.md) — пользовательский lifecycle и мастер.

## CURRENT / CANONICAL

These documents are the technical source of truth for their domains. Where an older stage document conflicts, the canonical document wins.

### Architecture

- [Stage 8 User Profile & Account Settings](architecture/user-profile-account-settings.md) — CURRENT implementation contract for registration, public username, email verification, sessions, 2FA, profile, deletion review, isolated SMTP tests and migrations 053–054. Final Manual QA passed 8/8 on 2026-10-18; Production deployment prerequisites remain separate.
- [Custom Block Marketplace & Licensing](architecture/custom-block-marketplace.md) — Free/Paid, Direct Grant, Use/Distribution rights, attribution, snapshots and Trust & Safety.
- [Block Contracts Foundation](architecture/block-contracts.md) — 7.6A.1/7.6A.2 canonical contracts, Start/End runtime semantics and validation boundaries.
- [AI Credits Architecture (архитектура ИИ-кредитов)](architecture/ai-credits.md) — credits, ledger, buckets, allocations and provider boundary.
- [AI Provider Layer](architecture/ai-provider-layer.md) — canonical provider-neutral routing, invocation accounting and reserve → call → settle lifecycle.

### Development
- [Stage 8 миграции и состояние Development DB](operations/migrations.md) — Alembic 054, проверенная резервная копия и сохранность данных после миграции, архив исторической FK-записи и локальная тестовая юридическая редакция.
- [Production Readiness Checklist (условия готовности к запуску)](operations/PRODUCTION_READINESS_CHECKLIST.md) — обязательные `PROD-BLOCKER-01/02` для юридических документов и реальной почты.
- [Dev-порты и локальная почта](DEV_PORTS.md) — запуск Stage 8 QA без внешней отправки писем.
- [Block Engineering Contract](development/BLOCK_ENGINEERING_CONTRACT.md) — required production block layers, parity, legacy and future Passport rules.
- [Block Library UI](BLOCK_LIBRARY_FRONTEND.md) — canonical user/admin catalog surfaces and their data-source boundaries.

### User guides

- [Профиль и настройки аккаунта](user/PROFILE_AND_ACCOUNT_SETTINGS.md) — регистрация, подтверждение почты, профиль, безопасность и запрос на удаление.
- [Marketplace кастомных блоков](user/CUSTOM_BLOCK_MARKETPLACE.md) — Free/Paid, контакт с автором, прямая выдача, библиотека и распространение.
- [Библиотека блоков](user/BLOCK_LIBRARY.md) — поиск, инструкции и переход в редактор.

### Billing
- [Effective Entitlement (фактические права пользователя)](billing/effective-entitlement.md) — base-plan resolver and legacy boundary.
- [Refund Technical Policy (техническая политика возвратов)](billing/refunds-technical-policy.md) — technical refund and entitlement behavior.

### API
- [API documentation](technical/API_DOCS.md) — existing REST contracts. AI Credits API scope is recorded in the architecture document above.

### Operations
- [Database Migration Chain (цепочка миграций БД)](operations/migrations.md) — current head 054, optional public username after profile security 053, and earlier migration notes.
- [Development ports](DEV_PORTS.md) — local service ports.

### Security
- [Security](SECURITY.md) — existing security technical material.
- [Auth and middleware](development/AUTH_AND_MIDDLEWARE.md) — runtime auth request handling.

### Legal inputs
- [Требования к будущей оферте Custom Blocks](legal-inputs/custom-block-license-offer-requirements.md) — лицензии, прямые расчёты, споры и санкции; не текст оферты.
- [Technical Facts for Legal Inputs (технические факты для юридических входных данных)](legal-inputs/technical-facts.md) — verified technical facts; not a legal policy.

### ADR
No current ADRs have been established in this repository. Add future decision records under `adr/`.

### Product and AI knowledge
- [Правила лицензирования Custom Blocks](product/CUSTOM_BLOCK_LICENSING_RULES.md) — понятные бизнес-правила.
- [Canonical AI knowledge: Custom Block licensing](ai-knowledge/custom-block-licensing.md) — определения, переходы и edge cases для будущего grounding.
- [Original Stage 8 scope brief](roadmap/USER_PROFILE_ACCOUNT_SETTINGS.md) — историческая постановка, не описание текущей реализации.
- [Market UX backlog](roadmap/MARKET_UX_BACKLOG.md) — Scenario-card visual consistency deferred beyond Stage 7.9.

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
