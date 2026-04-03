import type { Node } from 'reactflow';
import { migrateInputNodeSettings } from './inputBlock';

/** Точечные миграции контента сценария при загрузке / перед сохранением. */
export function migrateScenarioNodes(nodes: Node[]): Node[] {
  return nodes.map(n => {
    if (n.data?.blockId !== 'input') return n;
    const settings = (
      n.data?.settings && typeof n.data.settings === 'object' ? n.data.settings : {}
    ) as Record<string, unknown>;
    return {
      ...n,
      data: {
        ...n.data,
        settings: migrateInputNodeSettings(settings),
      },
    };
  });
}
