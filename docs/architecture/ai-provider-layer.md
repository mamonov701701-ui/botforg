# AI Provider Layer

## Purpose and scope

Stage 7.5 provides the internal, provider-neutral execution foundation for future AI features. It implements only the `text_generation` capability and deliberately exposes no generic public AI endpoint. Assistant, Generator, Copilot, AI Blocks, EditorV2, images, vision, 3D, provider admin UI, real credentials and real provider integrations are outside this stage.

Features request a capability and feature source; they never hardcode or expose a provider or model. The router deterministically selects a configured route. In 7.5 a user cannot select a provider or model.

## Components

- `AiProvider` is a provider-neutral contract: `execute(AiProviderRequest) -> AiProviderResponse`.
- `AiProviderConfig` is provider configuration: reviewed adapter code, enabled/status/priority and an optional secret *reference*. It stores no plaintext key.
- `AiModelCatalog` is the DB-backed model catalog: capability, feature allow-list, limits, structured-output support, route priority and versioned pricing rule.
- The static registry maps reviewed adapter code to adapter code. It cannot load arbitrary Python from the database.
- The router chooses the lowest-priority enabled, non-deprecated, capability-compatible model/provider pair. No eligible route fails explicitly before a reservation or provider call.
- `AiInvocation` is append-oriented technical accounting for one logical request. It records IDs, route snapshots, usage, cost, credits, status, timing and safe errors. It is not a balance.
- `AiCreditReservation` is a temporary availability hold linked one-to-one to an invocation. It is not a second balance.

## Provider contract and errors

The request carries capability, selected model, normalized text/messages, optional structured-output schema, safe parameters, output limit, correlation ID, idempotency key and sanitized metadata. The response carries normalized content/structured result, generic usage dimensions, provider request ID, latency, finish reason, optional provider cost/currency and safe metadata.

Typed errors normalize timeout, authentication, rate limit, invalid request, unavailable provider/model, policy refusal, malformed response and unknown errors. Vendor payloads never cross the adapter boundary.

The in-process `MockAiProvider` implements this same contract with deterministic output, usage, request IDs, optional structured result, configurable cost and deterministic failure modes. It never uses a network or credential. A future `DeepSeekAdapter` belongs behind this contract and registry; no DeepSeek API, model name, price, key or live test is part of 7.5.

## Credits lifecycle: reserve → call → settle

The AI Credits ledger and its FIFO buckets remain the sole entitlement and final-balance mechanism.

1. Authorization is completed before any routing, reservation or provider call.
2. The router selects a model and the pricing rule calculates a maximum reservation.
3. `reserve_for_invocation` locks the user row on PostgreSQL, subtracts active holds from spendable ledger balance, and persists the reservation. The reservation transaction commits before external work.
4. A provider call is forbidden until this successful reservation exists.
5. On success, pricing turns generic usage dimensions into an actual whole-credit charge. Settlement calls canonical `debit_credits`; the remaining hold is released in the same transaction.
6. On a confirmed provider failure the hold is released and no debit occurs.
7. If a dispatched call times out or safe settlement cannot be proven, invocation and reservation become `provider_unknown`. The hold is not automatically released; reconciliation/manual resolution is required.

Therefore AI Credits cannot go below zero: active reservations reduce availability for new reservations and for ordinary ledger debits, while settlement can exempt only its own active hold. Same-user reservations are serialized by the PostgreSQL user-row lock; SQLite test/dev writer serialization is covered by the same availability check. PostgreSQL production concurrency should additionally receive an integration gate before a production rollout.

## Idempotency, retry and fallback

The unique identity is `(user_id, idempotency_key)`. A SHA-256 fingerprint covers user, feature, capability, authorized bot target, normalized input and routing-relevant parameters.

- Same key and fingerprint returns the existing terminal or pending invocation; it cannot dispatch a second call.
- Same key with a different fingerprint fails closed.
- 7.5 performs no blind automatic retry after dispatch. Future retries must be bounded, use the same logical invocation identity and respect provider idempotency support.
- The catalog/router supports ordered routes structurally, but automatic fallback is disabled. Silent provider/model substitution is forbidden because cost, quality and data destination can change. Any future fallback must be capability-compatible, auditable and cost-bounded.

## Cost and data retention

Pricing is versioned per model. Generic dimensions include input/output tokens, requests, images, seconds and vendor units; AI Credits are an internal whole-credit charge and are not provider tokens. Invocations preserve the pricing version, provider-cost snapshot and charged-credit snapshot, so history is not repriced later.

Technical accounting and logs do not persist raw prompts, messages, responses or provider payloads by default. They store fingerprints, IDs, safe metadata, usage, cost, route, status and timing. A future feature that needs content owns it in its own domain. Secrets are backend-only, referenced rather than stored as plaintext in provider configuration, never returned through API and never logged.

Structured observability includes correlation/invocation/user/target identifiers, feature, capability, route, latency, status, safe error, provider cost and charged credits. Provider adapters do not perform RBAC; caller-side ownership uses existing bot access helpers before billing.

## Boundaries

Future Assistant, Generator, Copilot and AI Block layers call this internal orchestration boundary with their capability and constraints. They own feature-specific prompts, content, UX and authorization context. The provider layer does not know EditorV2, Block Registry/Passport or scenario/patch formats.
