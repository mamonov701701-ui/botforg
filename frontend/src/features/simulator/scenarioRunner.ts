import type { Node, Edge } from 'reactflow';

/**
 * Формальная модель исполнения сценария для симулятора.
 *
 * CONTRACT:
 * - Симулятор следует тем же правилам переходов, что и реальный рантайм сценариев.
 * - Для каждого типа блока явно определены:
 *   - Поведение при входе (какие сообщения создаются).
 *   - Правила выбора следующего ребра.
 * - Добавление нового типа блока требует:
 *   - Расширить NodeKind.
 *   - Описать правила в getNodeKind и stepNode.
 *   - (опционально) добавить новые поля в RuntimeVariables и логику маршрутизации.
 */

export type SimulatorRole = 'bot' | 'user';

export type NodeKind = 'start' | 'message' | 'input' | 'condition' | 'action' | 'unknown';

export interface SimulatorMessage {
  id: string;
  from: SimulatorRole;
  text: string;
  buttons?: { id: string; label: string; sourceHandle?: string | null }[];
  meta?: {
    nodeId?: string;
    kind?: NodeKind;
  };
}

export interface ScenarioGraph {
  nodes: Node[];
  edges: Edge[];
}

export interface RuntimeVariables {
  // произвольные переменные, например результаты условий, контекст пользователя и т.п.
  [key: string]: any;
}

export interface RuntimeContext {
  graph: ScenarioGraph;
  currentNodeId: string | null;
  variables: RuntimeVariables;
  lastUserInput: string | null;
  history: SimulatorMessage[];
}

export interface SimulatorState {
  currentNodeId: string | null;
  history: SimulatorMessage[];
  variables: RuntimeVariables;
  lastUserInput: string | null;
}

/** Результат шага: всегда `context` (полный RuntimeContext), не поле `state`. */
export interface RunStepResult {
  context: RuntimeContext;
  waitingForUser: boolean;
}

export function findStartNode(nodes: Node[]): Node | null {
  // Явно ищем блок, помеченный как start.
  const explicit = nodes.find(n => {
    const data: any = n.data || {};
    return data.blockId === 'start' || data.type === 'start';
  });
  if (explicit) return explicit;

  // Fallback (явно задокументировано): первый узел в списке.
  if (nodes.length === 0) return null;
  return nodes[0];
}

function getNodeKind(node?: Node | null): NodeKind {
  if (!node) return 'unknown';
  const data: any = node.data || {};
  const t = (data.type || data.blockId || '').toString().toLowerCase();
  if (t === 'start') return 'start';
  if (t === 'message') return 'message';
  if (t === 'input') return 'input';
  if (t === 'condition') return 'condition';
  if (t === 'action') return 'action';
  return 'unknown';
}

function getOutgoingEdges(edges: Edge[], nodeId: string) {
  return edges.filter(e => e.source === nodeId);
}

/**
 * Правила выбора следующего ребра.
 *
 * Порядок приоритета:
 * 1. Если передан buttonId — ищем edge.data?.buttonId === buttonId.
 * 2. Если передан sourceHandle — ищем edge.sourceHandle === sourceHandle.
 * 3. Для condition-узла:
 *    - читаем settings.conditionKey;
 *    - берём variables[conditionKey] или lastUserInput;
 *    - ищем edge.data?.conditionValue === computedValue.
 * 4. Fallback (явно задокументировано): первый исходящий edge.
 */
function resolveNextNodeId(
  context: RuntimeContext,
  fromNode: Node,
  opts?: { sourceHandle?: string | null; buttonId?: string | null }
): string | null {
  const outgoing = getOutgoingEdges(context.graph.edges, fromNode.id);
  if (outgoing.length === 0) return null;

  const data: any = fromNode.data || {};
  const kind = getNodeKind(fromNode);

  // 1. Маршрутизация по buttonId (сообщения/инпуты с кнопками)
  if (opts?.buttonId) {
    const byButton = outgoing.find(e => (e.data as any)?.buttonId === opts.buttonId);
    if (byButton) return byButton.target;
  }

  // 2. Маршрутизация по sourceHandle
  if (opts?.sourceHandle) {
    const byHandle = outgoing.find(e => e.sourceHandle === opts.sourceHandle);
    if (byHandle) return byHandle.target;
  }

  // 3. Маршрутизация по условию для condition-узла
  if (kind === 'condition') {
    const settings: any = data.settings || {};
    const key: string | undefined = settings.conditionKey;
    if (key) {
      const value = context.variables[key] ?? context.lastUserInput ?? null;
      const byCondition = outgoing.find(
        e =>
          (e.data as any)?.conditionValue !== undefined && (e.data as any).conditionValue === value
      );
      if (byCondition) return byCondition.target;
    }
  }

  // 4. Явно задокументированный fallback: первый исходящий edge.
  return outgoing[0].target;
}

function buildMessageFromNode(node: Node, kind: NodeKind): SimulatorMessage {
  const settings: any = node.data?.settings || {};
  const text: string =
    settings.text || settings.title || (node.data as any)?.title || `Блок ${node.id}`;

  const buttons: { id: string; label: string; sourceHandle?: string | null }[] | undefined =
    Array.isArray(settings.buttons) && settings.buttons.length
      ? settings.buttons.map((btn: any, index: number) => ({
          id: btn?.id || `btn_${index}`,
          label: btn?.label || `Вариант ${index + 1}`,
          sourceHandle: `button_${index}`,
        }))
      : undefined;

  return {
    id: `msg_${node.id}_${Date.now()}`,
    from: 'bot',
    text,
    buttons,
    meta: {
      nodeId: node.id,
      kind,
    },
  };
}

export function createInitialRuntimeContext(graph: ScenarioGraph): RuntimeContext {
  const start = findStartNode(graph.nodes);
  return {
    graph,
    currentNodeId: start?.id ?? null,
    variables: {},
    lastUserInput: null,
    history: [],
  };
}

export function createInitialSimulatorState(graph: ScenarioGraph): SimulatorState {
  const ctx = createInitialRuntimeContext(graph);
  return {
    currentNodeId: ctx.currentNodeId,
    history: ctx.history,
    variables: ctx.variables,
    lastUserInput: ctx.lastUserInput,
  };
}

/**
 * Исполнение одного шага сценария от текущего узла.
 * Возвращает обновлённый RuntimeContext и флаг, нужен ли ввод пользователя.
 */
export function stepFromCurrentNode(graph: ScenarioGraph, state: SimulatorState): RunStepResult {
  let context: RuntimeContext = {
    graph,
    currentNodeId: state.currentNodeId,
    variables: state.variables || {},
    lastUserInput: state.lastUserInput ?? null,
    history: state.history,
  };

  if (!context.currentNodeId) {
    const start = findStartNode(graph.nodes);
    if (!start) {
      return { context, waitingForUser: false };
    }
    const kind = getNodeKind(start);
    const msg = buildMessageFromNode(start, kind);
    context = {
      ...context,
      currentNodeId: start.id,
      history: [...context.history, msg],
    };
    return { context, waitingForUser: !!msg.buttons?.length };
  }

  const node = graph.nodes.find(n => n.id === context.currentNodeId);
  if (!node) {
    return { context, waitingForUser: false };
  }

  const kind = getNodeKind(node);

  // Явная модель исполнения по типам.
  switch (kind) {
    case 'message': {
      const msg = buildMessageFromNode(node, kind);
      context = {
        ...context,
        history: [...context.history, msg],
      };
      return { context, waitingForUser: !!msg.buttons?.length };
    }

    case 'input': {
      const msg = buildMessageFromNode(node, kind);
      context = {
        ...context,
        history: [...context.history, msg],
      };
      // Ожидаем пользовательский ввод (кнопка или текст в будущем).
      return { context, waitingForUser: true };
    }

    case 'condition': {
      const nextId = resolveNextNodeId(context, node, {});
      context = {
        ...context,
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'action': {
      const msg = buildMessageFromNode(node, kind);

      // ACTION: setVariable поддержка
      const data: any = node.data || {};
      const settings: any = data.settings || {};
      const varName: string | undefined = settings.setVariable;
      if (varName) {
        // Простая модель значения:
        // - если value === '$lastUserInput' -> берём последний ввод пользователя;
        // - иначе используем literal.
        const raw = settings.value;
        let value = raw;
        if (raw === '$lastUserInput') {
          value = context.lastUserInput ?? null;
        }
        context = {
          ...context,
          variables: {
            ...context.variables,
            [varName]: value,
          },
        };
      }

      const nextId = resolveNextNodeId(context, node, {});
      context = {
        ...context,
        history: [...context.history, msg],
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'start': {
      // Стартовый блок ведём как message без ожидания ввода, если нет кнопок.
      const msg = buildMessageFromNode(node, kind);
      context = {
        ...context,
        history: [...context.history, msg],
      };
      return { context, waitingForUser: !!msg.buttons?.length };
    }

    case 'unknown':
    default: {
      const msg = buildMessageFromNode(node, kind);
      context = {
        ...context,
        history: [...context.history, msg],
      };
      return { context, waitingForUser: false };
    }
  }
}

/**
 * Обработка пользовательского выбора (клик по кнопке).
 *
 * CONTRACT:
 * - Добавляет сообщение пользователя в историю.
 * - Обновляет lastUserInput и (при необходимости) переменные.
 * - Выбирает следующее ребро по buttonId/sourceHandle.
 */
export function applyUserChoice(
  graph: ScenarioGraph,
  state: SimulatorState,
  payload: { label: string; sourceHandle?: string | null; buttonId?: string | null }
): RunStepResult {
  if (!state.currentNodeId) {
    return {
      context: {
        graph,
        currentNodeId: state.currentNodeId,
        variables: state.variables,
        lastUserInput: state.lastUserInput,
        history: state.history,
      },
      waitingForUser: false,
    };
  }

  const userMessage: SimulatorMessage = {
    id: `user_${Date.now()}`,
    from: 'user',
    text: payload.label,
  };

  const baseVariables = state.variables || {};
  const node = graph.nodes.find(n => n.id === state.currentNodeId);
  const kind = getNodeKind(node || null);

  // INPUT: если указано settings.variableName, записываем ввод пользователя в переменную.
  let updatedVariables = { ...baseVariables };
  if (node && kind === 'input') {
    const data: any = node.data || {};
    const settings: any = data.settings || {};
    const varName: string | undefined = settings.variableName;
    if (varName) {
      updatedVariables[varName] = payload.label;
    }
  }

  const graphContext: RuntimeContext = {
    graph,
    currentNodeId: state.currentNodeId,
    variables: updatedVariables,
    lastUserInput: payload.label,
    history: [...state.history, userMessage],
  };

  const nextNodeId = node
    ? resolveNextNodeId(graphContext, node, {
        sourceHandle: payload.sourceHandle ?? null,
        buttonId: payload.buttonId ?? null,
      })
    : null;

  const updatedContext: RuntimeContext = {
    ...graphContext,
    currentNodeId: nextNodeId,
  };

  return {
    context: updatedContext,
    waitingForUser: false,
  };
}
