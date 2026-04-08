import type { Edge, Node } from 'reactflow';
import { migrateInputNodeSettings } from './inputBlock';
import { canonicalizeActionSettings } from './actionBlock';

/** Точечные миграции контента сценария при загрузке / перед сохранением. */
export function migrateScenarioNodes(nodes: Node[]): Node[] {
  return nodes
    .filter(n => {
      const blockId = String(n.data?.blockId || n.data?.type || '').toLowerCase();
      return blockId !== 'choice';
    })
    .map(n => {
      const settings = (
        n.data?.settings && typeof n.data.settings === 'object' ? n.data.settings : {}
      ) as Record<string, unknown>;
      if (n.data?.blockId === 'input') {
        return {
          ...n,
          data: {
            ...n.data,
            settings: migrateInputNodeSettings(settings),
          },
        };
      }
      if (n.data?.blockId === 'action') {
        return {
          ...n,
          data: {
            ...n.data,
            settings: canonicalizeActionSettings(settings),
          },
        };
      }
      return n;
    });
}

/** Миграция графа целиком: узлы + отсечение рёбер к удалённым узлам. */
export function migrateScenarioGraph(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const migratedNodes = migrateScenarioNodes(nodes);
  const validNodeIds = new Set(migratedNodes.map(n => n.id));
  const migratedEdges = (edges || []).filter(
    e => validNodeIds.has(String(e.source || '')) && validNodeIds.has(String(e.target || ''))
  );
  return { nodes: migratedNodes, edges: migratedEdges };
}
