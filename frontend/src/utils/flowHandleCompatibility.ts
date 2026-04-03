/**
 * Согласование рёбер с теми handle id, которые реально рендерит CustomNode в EditorV2Shell.
 *
 * Исторически в данных часто встречается targetHandle: "left" на вход в блоки,
 * у которых сейчас только target "top" (старт, message с кнопками). React Flow
 * тогда логирует "Couldn't create edge for target handle id: 'left'" и рёбра ломаются.
 */
import type { Node, Edge } from 'reactflow';

export function getNodeHandleSets(node: Node): {
  targetHandles: Set<string>;
  sourceHandles: Set<string>;
} {
  const data: any = node.data || {};
  const blockId = (data.blockId || data.type || '').toString().toLowerCase();
  const isStart = blockId === 'start';
  const isMessage = blockId === 'message';
  const isInput = blockId === 'input';
  const buttons = isMessage && Array.isArray(data.settings?.buttons) ? data.settings.buttons : [];
  const hasButtons = buttons.length > 0;

  if (isStart) {
    return {
      targetHandles: new Set(['top']),
      sourceHandles: new Set(['bottom']),
    };
  }
  if (isMessage && hasButtons) {
    const sources = new Set<string>();
    const n = Math.min(buttons.length, 5);
    for (let i = 0; i < n; i++) sources.add(`button_${i}`);
    return {
      targetHandles: new Set(['top']),
      sourceHandles: sources,
    };
  }
  if (isInput) {
    return {
      targetHandles: new Set(['top', 'left']),
      sourceHandles: new Set(['success', 'error']),
    };
  }
  return {
    targetHandles: new Set(['top', 'left']),
    sourceHandles: new Set(['right', 'bottom']),
  };
}

function pickFallbackSource(handles: Set<string>): string | undefined {
  if (handles.has('bottom')) return 'bottom';
  if (handles.has('right')) return 'right';
  const first = [...handles][0];
  return first;
}

function pickFallbackTarget(handles: Set<string>): string | undefined {
  if (handles.has('top')) return 'top';
  if (handles.has('left')) return 'left';
  const first = [...handles][0];
  return first;
}

export function normalizeScenarioEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return edges.map(e => normalizeOneEdge(e, byId));
}

function normalizeOneEdge(edge: Edge, byId: Map<string, Node>): Edge {
  const src = edge.source ? byId.get(edge.source) : undefined;
  const tgt = edge.target ? byId.get(edge.target) : undefined;

  let sourceHandle =
    edge.sourceHandle === '' || edge.sourceHandle == null ? undefined : edge.sourceHandle;

  if (src) {
    const s = getNodeHandleSets(src);
    const srcBlock = ((src.data as any)?.blockId || (src.data as any)?.type || '')
      .toString()
      .toLowerCase();
    if (
      srcBlock === 'input' &&
      (sourceHandle === 'right' ||
        sourceHandle === 'bottom' ||
        sourceHandle === undefined ||
        sourceHandle === '')
    ) {
      sourceHandle = 'success';
    }

    if (sourceHandle != null && !s.sourceHandles.has(sourceHandle)) {
      sourceHandle = pickFallbackSource(s.sourceHandles);
    }
  }

  let targetHandle =
    edge.targetHandle === '' || edge.targetHandle == null ? undefined : edge.targetHandle;
  if (tgt) {
    const t = getNodeHandleSets(tgt);
    if (targetHandle != null && !t.targetHandles.has(targetHandle)) {
      targetHandle = pickFallbackTarget(t.targetHandles);
    }
  }

  return { ...edge, sourceHandle, targetHandle };
}

/** Проверка «как в данных», до нормализации — для сообщений пользователю */
export function listInvalidFlowEdges(nodes: Node[], edges: Edge[]): string[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const issues: string[] = [];
  for (const e of edges) {
    const src = e.source ? byId.get(e.source) : undefined;
    const tgt = e.target ? byId.get(e.target) : undefined;
    if (!src && !tgt) continue;
    const sh = e.sourceHandle && e.sourceHandle !== '' ? e.sourceHandle : null;
    const th = e.targetHandle && e.targetHandle !== '' ? e.targetHandle : null;
    if (src) {
      const s = getNodeHandleSets(src);
      if (sh && !s.sourceHandles.has(sh)) {
        issues.push(`ребро ${e.id}: несовместимый sourceHandle «${sh}»`);
      }
    }
    if (tgt) {
      const t = getNodeHandleSets(tgt);
      if (th && !t.targetHandles.has(th)) {
        issues.push(`ребро ${e.id}: несовместимый targetHandle «${th}»`);
      }
    }
  }
  return issues;
}
