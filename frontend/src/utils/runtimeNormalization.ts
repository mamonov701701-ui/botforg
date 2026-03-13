/**
 * Runtime normalization utilities.
 *
 * Editor graph (React Flow)  ->  Runtime graph (normalized)
 *
 * Editor graph:
 * - хранит все UI-поля: position, style, width/height, selection, z-index, и т.п.
 * - может содержать временные данные, не предназначенные для выполнения
 *
 * Runtime graph:
 * - минимальная, стабильная структура для выполнения сценария (frontend/ backend)
 * - содержит только данные, которые реально нужны runtime‑движку:
 *   - id узла, тип/блок, настройки
 *   - исходящие рёбра с информацией для маршрутизации (handle, conditionValue, buttonId и т.п.)
 *
 * ВАЖНО:
 * - этот модуль ничего не знает о UI и React Flow
 * - его цель — подготовить "published snapshot", который может храниться
 *   в backend и использоваться движком выполнения сценариев.
 */

import type { Node, Edge } from 'reactflow';

/**
 * Нормализованный вид одного runtime‑узла.
 * Здесь нет координат, размеров и прочих UI‑полей.
 */
export interface RuntimeNode {
  id: string;
  /** blockId из каталога блоков (message, input, condition, action, start, ...) */
  blockId: string;
  /** Человекочитаемое название (опционально, но полезно для логов/отладки) */
  title?: string;
  /** Основные настройки блока (то, что редактор пишет в data.settings) */
  settings: Record<string, unknown>;
}

/**
 * Нормализованное runtime‑ребро.
 *
 * Оставляем только поля, которые используются для маршрутизации:
 * - source / target
 * - sourceHandle/targetHandle (для ветвлений)
 * - data.buttonId, data.conditionValue и прочие ключи маршрутизации
 */
export interface RuntimeEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Дополнительные данные для маршрутизации (buttonId, conditionValue, и т.п.) */
  routing?: {
    buttonId?: string;
    conditionValue?: string | number | boolean | null;
    [key: string]: unknown;
  };
}

/**
 * Полный runtime‑граф, готовый к выполнению.
 *
 * Этот snapshot может:
 * - сохраняться в published_content на backend
 * - использоваться backend‑движком выполнения
 * - кешироваться отдельно от редакторских данных
 */
export interface RuntimeGraph {
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
  /** ID стартового узла, если он найден. */
  startNodeId: string | null;
  /**
   * Дополнительные метаданные сценария, не относящиеся к UI:
   * - версия схемы исполнения
   * - флаги совместимости и т.п.
   */
  meta: {
    schemaVersion: number;
  };
}

/**
 * Нормализует один React Flow node в RuntimeNode.
 * UI‑поля (position, style и т.п.) игнорируются.
 */
export function normalizeNodeForRuntime(node: Node): RuntimeNode {
  const data: any = node.data || {};

  return {
    id: node.id,
    blockId: String(data.blockId || data.type || 'unknown'),
    title: typeof data.title === 'string' ? data.title : undefined,
    settings: (data.settings && typeof data.settings === 'object'
      ? { ...data.settings }
      : {}) as Record<string, unknown>,
  };
}

/**
 * Нормализует одно ребро React Flow в RuntimeEdge.
 */
export function normalizeEdgeForRuntime(edge: Edge): RuntimeEdge {
  const data: any = edge.data || {};

  const routing: RuntimeEdge['routing'] = {};

  if (data.buttonId) {
    routing.buttonId = String(data.buttonId);
  }

  if (typeof data.conditionValue !== 'undefined') {
    routing.conditionValue = data.conditionValue as string | number | boolean | null;
  }

  // Кладём любые другие потенциально нужные runtime‑поля как есть.
  // UI‑флаги (например, isSelected) сюда НЕ добавляем.
  Object.keys(data).forEach(key => {
    if (key === 'buttonId' || key === 'conditionValue') return;
    if (key.startsWith('ui_')) return;
    if (routing && typeof routing[key] === 'undefined') {
      routing[key] = data[key];
    }
  });

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    routing: Object.keys(routing).length ? routing : undefined,
  };
}

/**
 * Выполняет полную нормализацию редакторского графа в runtime‑snapshot.
 *
 * ВАЖНО: функция не делает валидацию. Предполагается, что сценарий
 * уже прошёл валидацию перед публикацией.
 */
export function buildRuntimeGraph(nodes: Node[], edges: Edge[]): RuntimeGraph {
  const runtimeNodes = nodes.map(normalizeNodeForRuntime);
  const runtimeEdges = edges.map(normalizeEdgeForRuntime);

  // Стартовый узел: ищем блок с blockId === 'start'
  const start = runtimeNodes.find(n => n.blockId.toLowerCase() === 'start');

  return {
    nodes: runtimeNodes,
    edges: runtimeEdges,
    startNodeId: start ? start.id : null,
    meta: {
      schemaVersion: 1,
    },
  };
}
