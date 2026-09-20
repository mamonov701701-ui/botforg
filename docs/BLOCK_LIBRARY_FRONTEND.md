# Block Library UI

## Status

CURRENT. The block catalog has two separate application surfaces:

- `/dashboard/block-library` — the user-facing Russian block library;
- `/dashboard/platform/blocks` — the protected platform administration view.

The EditorV2 block picker remains the place where a block is inserted into a scenario.

## Canonical sources

The UI does not maintain an independent catalog:

- `backend/data/editor_blocks.json` — catalog records and configuration schemas;
- `frontend/src/pages/features/blockGuideRu.ts` — Russian user guides;
- `backend/services/scenario_flow/block_contracts.py` and
  `frontend/src/utils/blockContracts.ts` — 7.6A core contracts;
- `GET /blocks` — catalog filtered for the authenticated user;
- `GET /blocks/admin-catalog` — full read-only catalog, protected by platform-admin RBAC.

## Custom blocks

The user library also consumes the database-backed versioned custom-block API. Draft, publish, new-version, archive and restore transitions are backend-enforced. Published versions are immutable and EditorV2 stores the exact `customBlockVersionId`. See the canonical [Custom Block Lifecycle](architecture/custom-block-lifecycle.md).

System catalog editing remains intentionally unavailable: `backend/data/editor_blocks.json` is code-managed. Admin actions apply only to database-backed custom blocks.

## User contract

Cards and detail pages use Russian titles, categories, descriptions and parameter labels. Internal
codes and schema field types are not displayed as primary user labels. The CTA «Открыть в
редакторе» uses the existing `/editor` entry flow, which selects or creates the required workspace.

Legacy compatibility records hidden by the EditorV2 new-selection flow are also hidden in the user
library. Their persisted scenarios remain readable by the compatibility layer.

## Administration contract

The administration screen is deliberately read-only. It shows the system code beside the Russian
title, activation status, 7.6A classification, source, guide availability and a compact contract
summary. Editing the JSON catalog from the browser is not supported. Managed editing belongs to a
future Block Passport → Block Registry implementation.

## Security

- the user catalog requires authentication;
- the full catalog endpoint uses the existing platform/tariff administrator dependency;
- direct navigation by a regular user is rejected by the dashboard platform guard and by backend
  RBAC;
- no block API returns secrets or user content.

## Data and migrations

No database entity and no migration are required. The feature is a read-only presentation of the
existing catalog and documentation sources.
