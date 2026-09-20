# Custom Block Lifecycle (canonical)

## Scope

BotForg stores user-created blocks in PostgreSQL/SQLite-compatible relational tables. A custom block is a stable identity (`custom_blocks`); its behavior, Block Passport and user guide are immutable version snapshots (`custom_block_versions`). System blocks remain code-managed in `backend/data/editor_blocks.json` and cannot be edited through the UI.

The first safe executable custom-block contract is deliberately narrow: `runtime_kind=message`. It reuses the proven Message runtime and simulator. Arbitrary Python/JavaScript, network calls, AI execution and multi-branch custom runtimes are not supported or claimed.

## Lifecycle and versioning

- `draft` / **Черновик**: editable, validated on demand, eligible for physical deletion only when unused and outside lineage.
- `published` / **Опубликован**: immutable. A change creates a new draft with the next monotonically increasing version and a `parent_version_id`.
- `archived` / **Архив**: immutable and excluded from new EditorV2 selection. Exact saved references continue to open and execute. Restore changes only that version back to `published`; deterministic new selection always chooses the greatest published version number.

Published and archived rows are never physically deleted by the API. Publishing v2 does not update any v1 scenario. There is no automatic upgrade.

## Exact scenario reference

An inserted custom node stores:

- `customBlockVersionId` — immutable database version id;
- `customBlockStableId` — stable identity snapshot;
- `customBlockVersion` — version-number snapshot;
- `customBlockPassport`, versioned user guide and title — presentation snapshots;
- `blockId=message` — the reviewed executable contract;
- node settings, including the message text.

Scenario create/update validates that the three reference values match the database version. Draft references are rejected. An archived reference may be saved again only when it was already present in that scenario; it cannot be newly inserted. Runtime uses the saved message contract, so archiving or later versions cannot break the old graph.

## Block Passport and canonical content

Every custom version owns one machine-readable JSON passport: stable identity, version, owner, Russian title, description, purpose, usage guidance, category, parameters/config schema, inputs, outputs, connection rules, supported channels, runtime and simulator compatibility, limitations, examples and lifecycle status. Its versioned `user_guide` is stored beside it.

The same API representation feeds the user library, detail page, EditorV2 catalog and admin view. No custom-block facts are duplicated in frontend constants. Creation-learning copy is shared by the wizard and “Как создать свой блок” through `customBlockWizardContent.ts`.

For code-managed system blocks, structural facts remain owned by `editor_blocks.json`; Russian long-form presentation remains owned by `blockGuideRu.ts`. Presentation helpers compose these non-overlapping sources. Moving system passports into the database is not required for the custom lifecycle and the UI cannot mutate the JSON.

## Validation and ownership

The backend, not the browser, enforces ownership, immutability, status transitions, system-code collision checks and safe deletion. Platform owner/admin roles can administer custom versions. Publication requires all mandatory passport facts, valid `lower_snake_case` parameter keys, an executable `text` parameter, one output, simulator support, an example and a versioned guide.

## Restore and usage

More than one historical version may be published after restore. This is not ambiguous: new selection takes the highest published version; exact existing references never change. Usage count scans draft and published scenario JSON for exact version ids. This is sufficient for safe lifecycle decisions at current scale; a normalized usage-reference table is a future optimization.

## Future boundaries

Marketplace sales, billing, AI duplicate moderation (`UNIQUE` / `OVERLAP` / `DUPLICATE`), arbitrary executable code, custom network access and advanced runtime kinds remain out of scope. New runtime kinds require a reviewed backend and simulator adapter, contract tests, migration-compatible passport evolution and explicit channel support.
