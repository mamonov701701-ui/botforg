import type { Node, Edge } from 'reactflow';

export type SimulatorRole = 'bot' | 'user';

export interface SimulatorMessage {
  id: string;
  from: SimulatorRole;
  text: string;
  buttons?: { id: string; label: string; sourceHandle?: string | null }[];
  meta?: {
    nodeId?: string;
    type?: string;
  };
}

export interface SimulatorState {
  currentNodeId: string | null;
  history: SimulatorMessage[];
}

export interface RunStepResult {
  state: SimulatorState;
  waitingForUser: boolean;
}

export interface ScenarioGraph {
  nodes: Node[];
  edges: Edge[];
}

function findStartNode(nodes: Node[]): Node | null {
  // эвристика: ищем блок с title "Start" или без входящих рёбер
  const explicit = nodes.find(n =>
    String(n.data?.title || '')
      .toLowerCase()
      .includes('start')
  );
  if (explicit) return explicit;
  if (nodes.length === 0) return null;
  return nodes[0];
}

function getOutgoingEdges(edges: Edge[], nodeId: string) {
  return edges.filter(e => e.source === nodeId);
}

export function createInitialSimulatorState(graph: ScenarioGraph): SimulatorState {
  const start = findStartNode(graph.nodes);
  return {
    currentNodeId: start?.id ?? null,
    history: [],
  };
}

function buildMessageFromNode(node: Node): SimulatorMessage {
  const settings: any = node.data?.settings || {};
  const text: string = settings.text || settings.title || node.data?.title || `Блок ${node.id}`;

  const buttons: { id: string; label: string; sourceHandle?: string | null }[] | undefined =
    Array.isArray(settings.buttons) && settings.buttons.length
      ? settings.buttons.map((btn: any, index: number) => ({
          id: `btn_${index}`,
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
      type: node.data?.type || settings.type || 'message',
    },
  };
}

function resolveNextNodeId(
  graph: ScenarioGraph,
  fromNodeId: string,
  opts?: { sourceHandle?: string | null }
): string | null {
  const outgoing = getOutgoingEdges(graph.edges, fromNodeId);
  if (outgoing.length === 0) return null;

  if (opts?.sourceHandle) {
    const byHandle = outgoing.find(e => e.sourceHandle === opts.sourceHandle);
    if (byHandle) return byHandle.target;
  }

  return outgoing[0].target;
}

export function stepFromCurrentNode(graph: ScenarioGraph, state: SimulatorState): RunStepResult {
  if (!state.currentNodeId) {
    const start = findStartNode(graph.nodes);
    if (!start) {
      return { state, waitingForUser: false };
    }
    const msg = buildMessageFromNode(start);
    return {
      state: {
        ...state,
        currentNodeId: start.id,
        history: [...state.history, msg],
      },
      waitingForUser: !!msg.buttons?.length,
    };
  }

  const node = graph.nodes.find(n => n.id === state.currentNodeId);
  if (!node) {
    return { state, waitingForUser: false };
  }

  const type = (node.data as any)?.type || (node.data as any)?.blockId || 'message';

  if (type === 'message') {
    const msg = buildMessageFromNode(node);
    return {
      state: {
        ...state,
        history: [...state.history, msg],
      },
      waitingForUser: !!msg.buttons?.length,
    };
  }

  if (type === 'condition') {
    const nextId = resolveNextNodeId(graph, node.id);
    return {
      state: {
        ...state,
        currentNodeId: nextId,
      },
      waitingForUser: false,
    };
  }

  if (type === 'input') {
    const msg = buildMessageFromNode(node);
    return {
      state: {
        ...state,
        history: [...state.history, msg],
      },
      waitingForUser: true,
    };
  }

  if (type === 'action') {
    const msg = buildMessageFromNode(node);
    const nextId = resolveNextNodeId(graph, node.id);
    return {
      state: {
        ...state,
        history: [...state.history, msg],
        currentNodeId: nextId,
      },
      waitingForUser: false,
    };
  }

  const fallbackMsg = buildMessageFromNode(node);
  return {
    state: {
      ...state,
      history: [...state.history, fallbackMsg],
    },
    waitingForUser: false,
  };
}

export function applyUserChoice(
  graph: ScenarioGraph,
  state: SimulatorState,
  payload: { label: string; sourceHandle?: string | null }
): RunStepResult {
  if (!state.currentNodeId) {
    return { state, waitingForUser: false };
  }

  const userMessage: SimulatorMessage = {
    id: `user_${Date.now()}`,
    from: 'user',
    text: payload.label,
  };

  const nextNodeId = resolveNextNodeId(graph, state.currentNodeId, {
    sourceHandle: payload.sourceHandle ?? null,
  });

  return {
    state: {
      currentNodeId: nextNodeId,
      history: [...state.history, userMessage],
    },
    waitingForUser: false,
  };
}
