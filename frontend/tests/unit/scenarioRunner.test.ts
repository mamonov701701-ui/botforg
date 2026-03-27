import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from 'reactflow';
import {
  createInitialRuntimeContext,
  createInitialSimulatorState,
  stepFromCurrentNode,
  applyUserChoice,
  completeWaitStep,
  runUntilUserPauseOrEnd,
  valuesEqualForConditionRoute,
  type ScenarioGraph,
  type SimulatorState,
  type RuntimeContext,
} from '../../src/features/simulator/scenarioRunner';

function node(id: string, kind: string, settings: any = {}): Node {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: {
      type: kind,
      blockId: kind,
      title: id,
      settings,
    },
  } as any;
}

function edge(id: string, source: string, target: string, extra: Partial<Edge> = {}): Edge {
  return {
    id,
    source,
    target,
    ...extra,
  } as any;
}

function S(graph: ScenarioGraph, partial: Partial<SimulatorState> = {}): SimulatorState {
  return {
    graph,
    graphsByScenarioId: {},
    scenarioTitlesById: {},
    activeScenarioId: null,
    currentNodeId: null,
    history: [],
    variables: {},
    lastUserInput: null,
    ...partial,
  };
}

describe('scenarioRunner execution model', () => {
  it('detects start node explicitly', () => {
    const graph: ScenarioGraph = {
      nodes: [node('n1', 'message'), node('n0', 'start')],
      edges: [],
    };
    const ctx = createInitialRuntimeContext(graph);
    expect(ctx.currentNodeId).toBe('n0');
  });

  it('message node with buttons waits for user', () => {
    const graph: ScenarioGraph = {
      nodes: [node('m1', 'message', { text: 'Hello', buttons: [{ label: 'Yes' }] })],
      edges: [],
    };
    const { context, waitingForUser } = stepFromCurrentNode(
      S(graph, {
        currentNodeId: 'm1',
      })
    );
    expect(waitingForUser).toBe(true);
    expect(context.history).toHaveLength(1);
    expect(context.history[0].buttons?.length).toBe(1);
  });

  it('message node carries media and parseMode into preview payload', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('m1', 'message', {
          text: 'Hi',
          parseMode: 'Markdown',
          mediaList: [{ url: 'https://example.com/a.jpg', type: 'image' }],
        }),
      ],
      edges: [],
    };
    const { context } = stepFromCurrentNode(S(graph, { currentNodeId: 'm1' }));
    const msg = context.history[0];
    expect(msg.media?.length).toBe(1);
    expect(msg.media?.[0].url).toContain('a.jpg');
    expect(msg.parseMode).toBe('Markdown');
  });

  it('applyUserChoice selects edge by buttonId', () => {
    const graph: ScenarioGraph = {
      nodes: [node('m1', 'message'), node('a', 'action'), node('b', 'action')],
      edges: [
        edge('e1', 'm1', 'a', { data: { buttonId: 'first' } }),
        edge('e2', 'm1', 'b', { data: { buttonId: 'second' } }),
      ],
    };
    const { context } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Go B',
      buttonId: 'second',
    });
    expect(context.currentNodeId).toBe('b');
  });

  it('applyUserChoice falls back to sourceHandle when buttonId missing', () => {
    const graph: ScenarioGraph = {
      nodes: [node('m1', 'message'), node('x', 'action')],
      edges: [edge('e1', 'm1', 'x', { sourceHandle: 'button_0' })],
    };
    const { context } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Click',
      sourceHandle: 'button_0',
    });
    expect(context.currentNodeId).toBe('x');
  });

  it('applyUserChoice message url: opens window and stays on same node', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const graph: ScenarioGraph = {
      nodes: [
        node('m1', 'message', {
          text: 'Go',
          buttons: [{ id: 'u1', label: 'Site', action: 'url', url: 'https://example.com/path' }],
        }),
        node('x', 'action'),
      ],
      edges: [edge('e1', 'm1', 'x', { sourceHandle: 'button_0' })],
    };
    const { context, waitingForUser } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Site',
      buttonId: 'u1',
      sourceHandle: 'button_0',
    });
    expect(open).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noopener,noreferrer');
    expect(context.currentNodeId).toBe('m1');
    expect(waitingForUser).toBe(true);
    open.mockRestore();
  });

  it('applyUserChoice message url empty: error, stay on node', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('m1', 'message', {
          text: 'Go',
          buttons: [{ id: 'u1', label: 'Site', action: 'url', url: '  ' }],
        }),
      ],
      edges: [],
    };
    const { context, waitingForUser } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Site',
      buttonId: 'u1',
    });
    expect(context.currentNodeId).toBe('m1');
    expect(waitingForUser).toBe(true);
    expect(context.history.some(h => h.meta?.variant === 'error')).toBe(true);
  });

  it('applyUserChoice message next: no matching edge for button → error', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('m1', 'message', {
          text: 'x',
          buttons: [{ id: 'k', label: 'Y', action: 'next' }],
        }),
        node('other', 'message'),
      ],
      edges: [edge('e0', 'm1', 'other')],
    };
    const { context, waitingForUser } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Y',
      buttonId: 'k',
    });
    expect(context.currentNodeId).toBeNull();
    expect(waitingForUser).toBe(false);
    expect(context.history.some(h => h.meta?.variant === 'error')).toBe(true);
  });

  it('applyUserChoice legacy branch action behaves like next', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('m1', 'message', {
          text: 'x',
          buttons: [{ id: 'k', label: 'Y', action: 'branch' }],
        }),
        node('z', 'action'),
      ],
      edges: [edge('e0', 'm1', 'z', { data: { buttonId: 'k' } })],
    };
    const { context } = applyUserChoice(S(graph, { currentNodeId: 'm1' }), {
      label: 'Y',
      buttonId: 'k',
    });
    expect(context.currentNodeId).toBe('z');
  });

  it('condition node selects edge by conditionValue (conditionKey)', () => {
    const cond = node('c1', 'condition', { conditionKey: 'route' });
    const graph: ScenarioGraph = {
      nodes: [cond, node('A', 'message'), node('B', 'message')],
      edges: [
        edge('e1', 'c1', 'A', { data: { conditionValue: 'A' } as any }),
        edge('e2', 'c1', 'B', { data: { conditionValue: 'B' } as any }),
      ],
    };
    const { context } = stepFromCurrentNode(
      S(graph, {
        currentNodeId: 'c1',
        variables: { route: 'B' },
      })
    );
    expect(context.currentNodeId).toBe('B');
  });

  it('condition node uses settings.variable as catalog field', () => {
    const cond = node('c1', 'condition', { variable: 'flag', operator: 'equals', value: '1' });
    const graph: ScenarioGraph = {
      nodes: [cond, node('A', 'message'), node('B', 'message')],
      edges: [
        edge('e1', 'c1', 'A', { data: { conditionValue: 'yes' } as any }),
        edge('e2', 'c1', 'B', { data: { conditionValue: 'no' } as any }),
      ],
    };
    const { context } = stepFromCurrentNode(
      S(graph, {
        currentNodeId: 'c1',
        variables: { flag: 'yes' },
      })
    );
    expect(context.currentNodeId).toBe('A');
  });

  it('action node auto-continues to next node', () => {
    const graph: ScenarioGraph = {
      nodes: [node('a1', 'action'), node('next', 'message')],
      edges: [edge('e1', 'a1', 'next')],
    };
    const { context, waitingForUser } = stepFromCurrentNode(S(graph, { currentNodeId: 'a1' }));
    expect(waitingForUser).toBe(false);
    expect(context.currentNodeId).toBe('next');
    // без текста в блоке «Действие» в чат ничего не пишем (как в мессенджере)
    expect(
      context.history.filter(h => h.meta?.variant !== 'system' && h.meta?.variant !== 'error')
    ).toHaveLength(0);
  });

  it('unknown node produces fallback message and does not wait for user', () => {
    const graph: ScenarioGraph = {
      nodes: [node('u1', 'weirdType')],
      edges: [],
    };
    const { context, waitingForUser } = stepFromCurrentNode(S(graph, { currentNodeId: 'u1' }));
    expect(waitingForUser).toBe(false);
    expect(context.history.length).toBeGreaterThanOrEqual(1);
    expect(context.history.some(h => h.meta?.variant === 'error')).toBe(true);
    expect(context.currentNodeId).toBeNull();
  });

  it('start without buttons advances currentNodeId to first outgoing target', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start', { text: 'Начало' }), node('m', 'message', { text: 'Привет' })],
      edges: [edge('e1', 's', 'm', { sourceHandle: 'bottom' })],
    };
    const { context, waitingForUser, deadEndFromStart } = stepFromCurrentNode(
      S(graph, { currentNodeId: 's' })
    );
    expect(waitingForUser).toBe(false);
    expect(context.history).toHaveLength(1);
    expect(context.currentNodeId).toBe('m');
    expect(deadEndFromStart).toBeFalsy();
  });

  it('start with no outgoing edges sets deadEndFromStart', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start')],
      edges: [],
    };
    const { context, deadEndFromStart } = stepFromCurrentNode(S(graph, { currentNodeId: 's' }));
    expect(context.currentNodeId).toBeNull();
    expect(deadEndFromStart).toBe(true);
  });

  it('second step from message shows message text', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start'), node('m', 'message', { text: 'Текст сообщения' })],
      edges: [
        edge('e1', 's', 'm', { sourceHandle: 'bottom', targetHandle: 'top' }),
        edge('e2', 'm', 's', { sourceHandle: 'right', targetHandle: 'top' }),
      ],
    };
    const afterStart = stepFromCurrentNode(S(graph, { currentNodeId: 's' }));
    expect(afterStart.context.currentNodeId).toBe('m');
    const afterMsg = stepFromCurrentNode(
      S(graph, {
        currentNodeId: afterStart.context.currentNodeId,
        history: afterStart.context.history,
        variables: afterStart.context.variables,
        lastUserInput: afterStart.context.lastUserInput,
        graphsByScenarioId: afterStart.context.graphsByScenarioId,
        scenarioTitlesById: afterStart.context.scenarioTitlesById,
        activeScenarioId: afterStart.context.activeScenarioId,
      })
    );
    // старт без текста не попадает в историю; затем сообщение
    expect(afterMsg.context.history.some(h => h.text === 'Текст сообщения')).toBe(true);
  });

  it('chain: start → message+button → choice → go_to_scenario → message in target', () => {
    const graphA: ScenarioGraph = {
      nodes: [
        node('s', 'start', { text: 'Старт' }),
        node('m1', 'message', { text: 'Нажми', buttons: [{ id: 'go', label: 'Далее' }] }),
        node('hop', 'go_to_scenario', { targetScenarioId: 2 }),
      ],
      edges: [edge('e0', 's', 'm1'), edge('e1', 'm1', 'hop', { data: { buttonId: 'go' } })],
    };
    const graphB: ScenarioGraph = {
      nodes: [node('sb', 'start'), node('mb', 'message', { text: 'Во втором сценарии' })],
      edges: [edge('eb', 'sb', 'mb')],
    };
    let sim = createInitialSimulatorState(graphA, {
      graphsByScenarioId: { 2: graphB },
      scenarioTitlesById: { 2: 'Цель' },
      rootScenarioId: 1,
    });
    let r = stepFromCurrentNode(sim);
    sim = contextToSim(r.context);
    r = stepFromCurrentNode(sim);
    expect(r.waitingForUser).toBe(true);
    sim = contextToSim(r.context);
    r = applyUserChoice(sim, { label: 'Далее', buttonId: 'go' });
    sim = contextToSim(r.context);
    r = stepFromCurrentNode(sim);
    expect(r.context.activeScenarioId).toBe(2);
    expect(r.context.currentNodeId).toBe('sb');
    sim = contextToSim(r.context);
    r = stepFromCurrentNode(sim);
    expect(r.context.currentNodeId).toBe('mb');
    sim = contextToSim(r.context);
    r = stepFromCurrentNode(sim);
    expect(r.waitingForUser).toBe(false);
    expect(r.context.history.some(m => m.text === 'Во втором сценарии')).toBe(true);
  });

  it('go_to_scenario swaps graph and points to start of target scenario', () => {
    const graphA: ScenarioGraph = {
      nodes: [node('hop', 'go_to_scenario', { targetScenarioId: 2 }), node('x', 'message')],
      edges: [edge('e0', 'hop', 'x')],
    };
    const graphB: ScenarioGraph = {
      nodes: [node('sb', 'start', { text: 'B-start' }), node('mb', 'message', { text: 'Второй' })],
      edges: [edge('eb', 'sb', 'mb')],
    };
    const state = S(graphA, {
      currentNodeId: 'hop',
      graphsByScenarioId: { 2: graphB },
      scenarioTitlesById: { 2: 'Сценарий B' },
    });
    const { context, waitingForUser } = stepFromCurrentNode(state);
    expect(waitingForUser).toBe(false);
    expect(context.graph.nodes.map(n => n.id)).toContain('sb');
    expect(context.currentNodeId).toBe('sb');
    expect(context.activeScenarioId).toBe(2);
    expect(context.history.some(m => m.text.includes('Переход в сценарий'))).toBe(true);
    const step2 = stepFromCurrentNode(contextToSim(context));
    expect(step2.context.history.length).toBeGreaterThan(context.history.length);
    expect(step2.context.currentNodeId).toBe('mb');
  });
});

function contextToSim(c: RuntimeContext): SimulatorState {
  return {
    graph: c.graph,
    graphsByScenarioId: c.graphsByScenarioId,
    scenarioTitlesById: c.scenarioTitlesById,
    activeScenarioId: c.activeScenarioId,
    currentNodeId: c.currentNodeId,
    history: c.history,
    variables: c.variables,
    lastUserInput: c.lastUserInput,
  };
}

describe('valuesEqualForConditionRoute', () => {
  it('equates number and numeric string', () => {
    expect(valuesEqualForConditionRoute(5, '5')).toBe(true);
    expect(valuesEqualForConditionRoute('42', 42)).toBe(true);
  });
  it('trims strings', () => {
    expect(valuesEqualForConditionRoute('  a  ', 'a')).toBe(true);
  });
});

describe('preview scenarios (runUntilUserPauseOrEnd)', () => {
  it('A: Start → Message → конец', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start'), node('m', 'message', { text: 'Привет' })],
      edges: [edge('e1', 's', 'm')],
    };
    const r = runUntilUserPauseOrEnd(createInitialSimulatorState(graph));
    expect(r.waitingForUser).toBe(false);
    expect(r.context.currentNodeId).toBeNull();
    expect(r.context.history.some(h => h.text === 'Привет')).toBe(true);
  });

  it('B: Start → Message с кнопкой → выбор → Message', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('s', 'start'),
        node('m1', 'message', { text: 'Выбери', buttons: [{ id: 'ok', label: 'Да' }] }),
        node('m2', 'message', { text: 'После' }),
      ],
      edges: [edge('e0', 's', 'm1'), edge('e1', 'm1', 'm2', { data: { buttonId: 'ok' } })],
    };
    let sim = createInitialSimulatorState(graph);
    let r = runUntilUserPauseOrEnd(sim);
    expect(r.waitingForUser).toBe(true);
    sim = contextToSim(r.context);
    const afterBtn = applyUserChoice(sim, { label: 'Да', buttonId: 'ok' });
    expect(afterBtn.context.history.every(h => h.from !== 'user')).toBe(true);
    r = runUntilUserPauseOrEnd(contextToSim(afterBtn.context));
    expect(r.context.history.some(h => h.text === 'После')).toBe(true);
    expect(r.waitingForUser).toBe(false);
    expect(r.context.currentNodeId).toBeNull();
  });

  it('C: Start → Input → ввод → Message', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('s', 'start'),
        node('in', 'input', { text: 'Имя?', variableName: 'u' }),
        node('m', 'message', { text: 'Ок' }),
      ],
      edges: [edge('e1', 's', 'in'), edge('e2', 'in', 'm')],
    };
    let sim = createInitialSimulatorState(graph);
    let r = runUntilUserPauseOrEnd(sim);
    expect(r.waitingForUser).toBe(true);
    sim = contextToSim(r.context);
    const afterInput = applyUserChoice(sim, { label: 'Иван' });
    expect(afterInput.context.variables.u).toBe('Иван');
    expect(afterInput.context.history.some(h => h.from === 'user' && h.text === 'Иван')).toBe(true);
    r = runUntilUserPauseOrEnd(contextToSim(afterInput.context));
    expect(r.context.history.some(h => h.text === 'Ок')).toBe(true);
    expect(r.context.variables.u).toBe('Иван');
  });

  it('D: Start → Condition → ветвление по значению', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('s', 'start'),
        node('c', 'condition', { variable: 'route' }),
        node('A', 'message', { text: 'Ветка A' }),
        node('B', 'message', { text: 'Ветка B' }),
      ],
      edges: [
        edge('e0', 's', 'c'),
        edge('e1', 'c', 'A', { data: { conditionValue: 'yes' } }),
        edge('e2', 'c', 'B', { data: { conditionValue: 'no' } }),
      ],
    };
    const r = runUntilUserPauseOrEnd(createInitialSimulatorState(graph));
    // переменная не задана: value null — ни одно ребро не совпало, fallback первое исходящее → A
    expect(r.context.currentNodeId).toBeNull();
    expect(r.context.history.some(h => h.text === 'Ветка A')).toBe(true);
  });

  it('D: число в переменной совпадает со строкой на ребре', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('c', 'condition', { variable: 'n' }),
        node('A', 'message', { text: 'A' }),
        node('B', 'message', { text: 'B' }),
      ],
      edges: [
        edge('e1', 'c', 'A', { data: { conditionValue: '5' } }),
        edge('e2', 'c', 'B', { data: { conditionValue: '6' } }),
      ],
    };
    const r = stepFromCurrentNode(S(graph, { currentNodeId: 'c', variables: { n: 5 } }));
    expect(r.context.currentNodeId).toBe('A');
  });

  it('F: Start → wait → Message', () => {
    const graph: ScenarioGraph = {
      nodes: [
        node('s', 'start'),
        node('w', 'wait', { duration: { amount: 1, unit: 'seconds' } }),
        node('m', 'message', { text: 'после' }),
      ],
      edges: [edge('e1', 's', 'w'), edge('e2', 'w', 'm')],
    };
    let sim = createInitialSimulatorState(graph);
    let r = runUntilUserPauseOrEnd(sim);
    expect(r.pendingWaitMs).toBeTruthy();
    expect(r.context.currentNodeId).toBe('w');
    const w = completeWaitStep(contextToSim(r.context));
    r = runUntilUserPauseOrEnd(contextToSim(w.context));
    expect(r.waitingForUser).toBe(false);
    expect(r.context.currentNodeId).toBeNull();
    expect(r.context.history.some(h => h.meta?.kind === 'wait')).toBe(true);
    expect(r.context.history.some(h => h.text === 'после')).toBe(true);
  });

  it('runUntil сохраняет deadEndFromStart', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start')],
      edges: [],
    };
    const r = runUntilUserPauseOrEnd(createInitialSimulatorState(graph));
    expect(r.deadEndFromStart).toBe(true);
    expect(r.context.currentNodeId).toBeNull();
  });

  it('зацикливание без пользователя — stalledMaxSteps', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start'), node('v', 'variable', { name: 'x', value: '1' })],
      edges: [edge('e1', 's', 'v'), edge('e2', 'v', 's')],
    };
    const r = runUntilUserPauseOrEnd(createInitialSimulatorState(graph), { maxSteps: 12 });
    expect(r.stalledMaxSteps).toBe(true);
  });

  it('битый currentNodeId: не зацикливаем раннер', () => {
    const graph: ScenarioGraph = {
      nodes: [node('s', 'start')],
      edges: [],
    };
    const base = createInitialSimulatorState(graph);
    const broken: SimulatorState = { ...base, currentNodeId: 'ghost', history: [] };
    const r = runUntilUserPauseOrEnd(broken, { maxSteps: 8 });
    expect(r.stalledMaxSteps).toBeFalsy();
    expect(r.context.currentNodeId).toBeNull();
    expect(r.context.history.some(m => m.text.includes('нет блока'))).toBe(true);
  });
});
