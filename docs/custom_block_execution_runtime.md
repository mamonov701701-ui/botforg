# Custom Block Execution Runtime (Stage 7.7)

## Trust boundary

Custom Block source is untrusted. FastAPI never evaluates it, imports it, starts a subprocess for it, or supplies it with a database session, ORM object, graph, node/edge ID, token, secret, environment variable, filesystem or channel adapter.

The trusted Backend Execution Core validates an exact Custom Block Version, its ownership-based execution right, its immutable artifact hash and a JSON envelope. It invokes a replaceable HTTP Runner Provider. The runner receives only `input`, `settings`, and `{executionMode, blockVersionId}`; it returns only `{outputs, route, logs}`. The platform resolves the named route to an edge.

## Development runner and production warning

`custom-runner` is a separate QuickJS/WASM service. It has no injected host APIs, module loader, network API, filesystem API, `process`, `require`, imports or package dependencies for user source. Docker Compose applies read-only filesystem, dropped capabilities, no-new-privileges, process, CPU and memory limits, and an internal runner network.

This Development Runner / Docker isolation is **not automatically a Production-grade Sandbox**. Production must use a separately operated Production Isolation Provider, such as a MicroVM, Firecracker, or a managed secure sandbox. Replacing it changes only the Runner Provider implementation, not the execution core or scenario contract.

## JavaScript contract

Only JavaScript with a `run(envelope)` function is supported. It must return JSON-compatible data:

```js
function run(envelope) {
  return { outputs: { result: "ok" }, route: "success", logs: [] };
}
```

`route` must exactly match a declared output port. Output keys must be declared and type-compatible. The runner cannot choose a next node.

Capabilities are declarative and deny-by-default: network, filesystem, secrets, database, persistence, dependencies, subprocess and platform API are all false. No capability can be enabled in Stage 7.7.

## Versioned Connections Contract

Each Custom Block version stores its Connections Contract (контракт соединений) in the immutable Block Passport (паспорте блока): `input_count` is 0 or 1 and `outputs` contains 0–32 ports. Thirty-two is a Technical Safety Limit (технический защитный предел), not a business-product limit. Every port has a Russian-facing `display_name` and stable lower-snake-case `name` machine key. Published names and keys cannot change in place.

Author-entered input labels use the same identifier boundary: the Frontend (фронтенд) preserves `display_name` and generates a schema-compatible `name` before sending the Execution Specification (спецификацию выполнения). Backend validation remains authoritative and rejects invalid identifiers with a safe user-facing category instead of exposing Pydantic internals or regex text.

EditorV2 renders handles from the exact passport snapshot: no input handle for `input_count=0`, one for `input_count=1`, and one labelled source handle per output. A zero-output block is terminal. For JavaScript, a route is required when there are multiple outputs; a single omitted route deterministically selects the only output; zero outputs forbid a route. Older versions with no explicit contract are normalized to one input and one `success` output without rewriting their published row.

Machine keys are generated deterministically from display names. Common route names have stable aliases and other Cyrillic names use transliteration; collisions receive `_2`, `_3`, and so on. The Backend (бэкенд) repeats this normalization at the trust boundary. Message fallback (резервное выполнение сообщением) permits at most one output, so a multi-output draft must explicitly enable JavaScript Runtime (выполнение JavaScript) before publication.

## Limits and failures

The fixed MVP profile is 750 ms wall-clock, 500 ms CPU budget, 32 MB memory, 32 KB source, 16 KB input/output, 20 log records, 512 bytes per record and 4 KB total logs. A per-version concurrency limit is supplied to the runner.

Failures are controlled and machine-readable: `validation_error`, `authorization_error`, `timeout`, `resource_limit`, `policy_violation`, `runtime_error`, `invalid_output`, `runner_feature_disabled`, `runner_url_missing`, `runner_connection_refused`, `runner_authentication_failed`, and `runner_unavailable`. User-facing APIs do not expose stack traces, paths, tokens or provider URLs. Preview maps these categories to distinct safe Russian diagnostics instead of treating every configuration or transport failure as generic runner unavailability.

Metadata-only audit rows retain execution ID, version, artifact hash, mode, runner profile, duration, byte counts and error category. Source, input and output payloads are not persisted in the audit table.

## Version, archive and future integration

The artifact hash is SHA-256 of canonical JSON for the entire Execution Specification, including source, language/profile, declared ports, settings schema, capabilities and resource profile. Published Versions are immutable; Create New Version creates a new draft artifact.

Archive prevents new insertion but an existing exact archived version remains executable. Security disable is a separate execution state for a future review/revocation workflow.

Stage 7.8 can attach review decisions to the immutable hash and capability declaration. Stage 7.9 can replace ownership authorization with licence-based execution rights without changing the execution core. Neither workflow is implemented here.

## Developer operation

For local Windows development, start the isolated service and then the Backend (бэкенд) with the canonical launchers from the repository root:

```powershell
.\scripts\dev-custom-runner.ps1
.\scripts\dev-backend.ps1
```

The local canonical address is `http://127.0.0.1:8090`. Each Runner start generates a fresh development-only service token in the local gitignored file `scripts/.dev-custom-runner-token`; the value is neither committed nor printed. `dev-backend.ps1` starts the backend through `dev-backend-runtime-env.cmd`; that wrapper reads the local token at runtime and establishes the URL, feature flag, and token in the same process tree as Uvicorn, including its reload child and worker. The launcher terminates a verified Uvicorn process tree before its reloader root and removes only orphan workers proven to belong to former listeners on port 8001. This prevents stale workers with inherited Windows listening sockets from serving requests with obsolete settings. The global application configuration remains fail-closed.

Preview always calls the Backend Preview API, which authorizes the exact published version, verifies its artifact hash, calls the Runner Provider over authenticated HTTP, validates the result envelope, and returns only the named route and safe output. The browser never evaluates Custom Block source. A healthy Runner `/healthz` response proves only that the Runner process is ready; if Preview still fails, inspect the safe category returned by Backend: disabled feature, missing URL, refused connection, authentication failure, timeout, runtime error, invalid output, or unknown route.

Draft auto-save is debounced by four seconds and writes the complete draft plus the current Wizard step to the Backend Draft. Backend state is the Source of Truth; save requests are serialized so an older response cannot overwrite a newer edit. JavaScript source is stored byte-for-byte as entered, including line breaks, indentation, and other whitespace. Canonical artifact hashing remains deterministic because it hashes canonical JSON containing that exact source string rather than reformatting the source.

For Compose/managed environments, set all of these explicitly to enable execution:

```text
CUSTOM_BLOCK_EXECUTION_ENABLED=true
CUSTOM_BLOCK_RUNNER_URL=http://custom-runner:8090
CUSTOM_BLOCK_RUNNER_SHARED_TOKEN=<dedicated secret>
CUSTOM_BLOCK_RUNNER_PORT=8090
CUSTOM_BLOCK_RUNNER_TIMEOUT_SECONDS=1.5
CUSTOM_BLOCK_MAX_CONCURRENT_PER_VERSION=2
```

The runner must be started independently (Compose profile `custom-runner`). Its `/healthz` endpoint reports only readiness and the runtime profile. Do not point the URL at an arbitrary service and do not reuse the local development token or a user/API secret in production. With any missing setting outside the canonical local launcher, execution fails closed.

After startup, run the loopback-only Development Self-check (самопроверку разработки):

```powershell
.\scripts\check-custom-runner.ps1
```

It samples the actual Backend worker, rejects stale/multiple workers, reports only a token hash prefix, and sends fixed JavaScript through the authenticated Backend → Runner HTTP path. A successful result includes `route=success`. The status and probe endpoints return 404 outside Development (разработки) and outside a loopback client.
