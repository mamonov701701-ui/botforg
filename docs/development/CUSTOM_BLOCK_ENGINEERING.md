# Custom Block Engineering Contract

1. Never mutate a `published` or `archived` `CustomBlockVersion`. Create a new draft version.
2. Preserve `customBlockVersionId`, `customBlockStableId` and `customBlockVersion` in scenario nodes. Never silently replace them with “latest”.
3. Add a runtime kind only after backend runtime, simulator, validation and channel compatibility all exist. Until then publication must fail closed.
4. Keep custom user facts in the version passport/user guide. Library, detail, EditorV2 and admin consume the API; do not copy the text into a frontend registry.
5. Keep system blocks code-managed. Add a new system type through `editor_blocks.json`, the runtime contract and simulator tests; do not expose JSON mutation in admin UI.
6. Archived versions are unavailable to new nodes but remain readable/executable for existing scenarios.
7. A schema change requires a new Alembic revision. Never rewrite `custom_block_lifecycle_043` after release.
