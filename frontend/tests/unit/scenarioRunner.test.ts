import { describe, it, expect } from 'vitest';
import type { Node, Edge } from 'reactflow';
import {
  createInitialRuntimeContext,
  stepFromCurrentNode,
  applyUserChoice,
  type ScenarioGraph,
} from '@/features/simulator/scenarioRunner';

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
    const initial = {
      currentNodeId: 'm1',
      history: [],
      variables: {},
      lastUserInput: null,
    };
    const { context, waitingForUser } = stepFromCurrentNode(graph, initial);
    expect(waitingForUser).toBe(true);
    expect(context.history).toHaveLength(1);
    expect(context.history[0].buttons?.length).toBe(1);
  });

  it('applyUserChoice selects edge by buttonId', () => {
    const graph: ScenarioGraph = {
      nodes: [node('m1', 'message'), node('a', 'action'), node('b', 'action')],
      edges: [
        edge('e1', 'm1', 'a', { data: { buttonId: 'first' } }),
        edge('e2', 'm1', 'b', { data: { buttonId: 'second' } }),
      ],
    };
    const state = {
      currentNodeId: 'm1',
      history: [],
      variables: {},
      lastUserInput: null,
    };
    const { context } = applyUserChoice(graph, state, {
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
    const state = {
      currentNodeId: 'm1',
      history: [],
      variables: {},
      lastUserInput: null,
    };
    const { context } = applyUserChoice(graph, state, {
      label: 'Click',
      sourceHandle: 'button_0',
    });
    expect(context.currentNodeId).toBe('x');
  });

  it('condition node selects edge by conditionValue', () => {
    const cond = node('c1', 'condition', { conditionKey: 'route' });
    const graph: ScenarioGraph = {
      nodes: [cond, node('A', 'message'), node('B', 'message')],
      edges: [
        edge('e1', 'c1', 'A', { data: { conditionValue: 'A' } as any }),
        edge('e2', 'c1', 'B', { data: { conditionValue: 'B' } as any }),
      ],
    };
    const state = {
      currentNodeId: 'c1',
      history: [],
      variables: { route: 'B' },
      lastUserInput: null,
    };
    const { context } = stepFromCurrentNode(graph, state);
    expect(context.currentNodeId).toBe('B');
  });

  it('action node auto-continues to next node', () => {
    const graph: ScenarioGraph = {
      nodes: [node('a1', 'action'), node('next', 'message')],
      edges: [edge('e1', 'a1', 'next')],
    };
    const state = {
      currentNodeId: 'a1',
      history: [],
      variables: {},
      lastUserInput: null,
    };
    const { context, waitingForUser } = stepFromCurrentNode(graph, state);
    expect(waitingForUser).toBe(false);
    expect(context.currentNodeId).toBe('next');
    expect(context.history[0].from).toBe('bot');
  });

  it('unknown node produces fallback message and does not wait for user', () => {
    const graph: ScenarioGraph = {
      nodes: [node('u1', 'weirdType')],
      edges: [],
    };
    const state = {
      currentNodeId: 'u1',
      history: [],
      variables: {},
      lastUserInput: null,
    };
    const { context, waitingForUser } = stepFromCurrentNode(graph, state);
    expect(waitingForUser).toBe(false);
    expect(context.history).toHaveLength(1);
  });
});
