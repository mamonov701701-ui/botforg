# Runtime architecture for scenarios

## Overview

The system distinguishes between:

- **Editor graph** — full React Flow graph used by the visual editor (positions, styles, UI-only flags).
- **Runtime graph (published snapshot)** — normalized, UI-free representation used for executing scenarios (on frontend simulator and, in the future, on backend runtime).

This document explains the separation and the transformation layer between them.

## Editor graph

Editor graph is what the user sees and edits in the canvas:

- Stored in `scenarioStore.currentState.nodes` / `currentState.edges`.
- Contains all React Flow fields: `position`, `style`, `width`, `height`, selection state, etc.
- May include UI-only data in `node.data` / `edge.data` (e.g. `ui_*` flags).

Type:

- `src/types/editor/graph.ts` — `EditorGraph` (wrapper around `Node[]` / `Edge[]` from React Flow).

## Runtime graph

Runtime graph is a compact, stable snapshot that contains only execution-relevant data:

- Node identity and block type (`blockId`, `title`).
- Block settings (`data.settings`) needed by the runtime engine.
- Edges with routing metadata (e.g. button IDs, condition values).
- No coordinates, sizes, or visual styling.

Types:

- `src/utils/runtimeNormalization.ts`
  - `RuntimeNode` — `{ id, blockId, title?, settings }`
  - `RuntimeEdge` — `{ id, source, target, sourceHandle?, targetHandle?, routing? }`
  - `RuntimeGraph` — `{ nodes, edges, startNodeId, meta }`

`routing` on edges captures:

- `buttonId` — for message/input buttons.
- `conditionValue` — for condition-based branching.
- Any other execution-relevant keys, excluding UI-only flags (by convention: `ui_*`).

## Transformation layer

The transformation from editor graph to runtime snapshot is implemented in:

- `src/utils/runtimeNormalization.ts`
  - `normalizeNodeForRuntime(node: Node): RuntimeNode`
  - `normalizeEdgeForRuntime(edge: Edge): RuntimeEdge`
  - `buildRuntimeGraph(nodes: Node[], edges: Edge[]): RuntimeGraph`

Key rules:

- **Include**:
  - `node.id`, `data.blockId` or `data.type`, `data.title`, `data.settings`.
  - `edge.source`, `edge.target`, `edge.sourceHandle`, `edge.targetHandle`.
  - `edge.data.buttonId`, `edge.data.conditionValue` and other non-UI keys.
- **Exclude**:
  - React Flow positioning and style: `position`, `style`, `width`, `height`, etc.
  - UI-only flags such as selection or temporary editor hints.
  - Any `edge.data` keys prefixed with `ui_`.

Start node:

- `buildRuntimeGraph` sets `startNodeId` by looking for a node with `blockId === 'start'` (case-insensitive).

## Scenario store integration

`scenarioStore` exposes a helper to get a runtime snapshot of the current scenario:

- `src/stores/scenarioStore.ts`
  - `getCurrentRuntimeGraph(): RuntimeGraph | null`

This helper:

- Reads `currentState.nodes` / `currentState.edges`.
- Calls `buildRuntimeGraph` to strip UI and React Flow-specific fields.
- Returns a `RuntimeGraph` ready to be sent to backend or used by the simulator.

## Backend integration (planned)

API types and placeholders for backend runtime execution live in:

- `src/api/scenarios.ts`
  - `PublishedRuntimeSnapshot` — normalized published snapshot compatible with `RuntimeGraph`.
  - `ScenarioRuntimeExecuteRequest` — DTO for sending snapshot + context to backend.
  - `executeScenarioRuntime` — TODO-ready client for a future `/scenarios/runtime/execute` endpoint.

Data model notes:

- `Scenario.content` / `published_content` currently store editor graphs (React Flow).
- A future backend field like `published_content_runtime: PublishedRuntimeSnapshot | null` is recommended to cache normalized runtime snapshots and avoid re-normalizing on every execution.

## Editor vs runtime responsibilities

- **Editor**:
  - Manages the full React Flow graph and UI state.
  - Validates scenarios and blocks before publish.
  - Produces runtime snapshots via normalization utilities.

- **Runtime (frontend simulator / backend engine)**:
  - Consumes `RuntimeGraph` / `PublishedRuntimeSnapshot`.
  - Ignores any editor-only concerns (layout, visual state).
  - Implements deterministic traversal rules for nodes and edges.

