/**
 * Editor-time graph types (React Flow nodes/edges + UI metadata).
 *
 * Эти типы описывают то, что хранится в редакторе:
 * - position, width/height, style и т.п.
 * - данные, нужные только для визуального представления
 *
 * Для выполнения сценария на backend используется отдельная нормализованная
 * структура (runtime graph), см. `src/utils/runtimeNormalization.ts`.
 */

import type { Node, Edge } from 'reactflow';

/**
 * Полный граф, который редактируется пользователем в React Flow.
 * Хранится в scenarioStore.currentState.{nodes,edges}.
 */
export interface EditorGraph {
  nodes: Node[];
  edges: Edge[];
}
