import { describe, it, expect } from 'vitest';
import type { Node, Edge } from 'reactflow';
import {
  getNodeHandleSets,
  normalizeScenarioEdges,
  listInvalidFlowEdges,
} from '@/utils/flowHandleCompatibility';

function n(id: string, blockId: string, extra: { buttons?: { label: string }[] } = {}): Node {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: {
      blockId,
      type: blockId,
      title: id,
      settings: extra.buttons ? { buttons: extra.buttons } : {},
    },
  } as Node;
}

describe('flowHandleCompatibility', () => {
  it('renders End as terminal and Start without an incoming handle', () => {
    expect(getNodeHandleSets(n('end', 'end')).sourceHandles.size).toBe(0);
    expect(getNodeHandleSets(n('end', 'end')).targetHandles.has('top')).toBe(true);
    expect(getNodeHandleSets(n('start', 'start')).targetHandles.size).toBe(0);
  });
  it('start node only exposes bottom source', () => {
    const sets = getNodeHandleSets(n('s', 'start'));
    expect([...sets.targetHandles]).toEqual([]);
    expect([...sets.sourceHandles]).toEqual(['bottom']);
  });

  it('message with buttons: target top only, sources are button_*', () => {
    const sets = getNodeHandleSets(
      n('m', 'message', { buttons: [{ label: 'A' }, { label: 'B' }] })
    );
    expect([...sets.targetHandles]).toEqual(['top']);
    expect(sets.sourceHandles.has('button_0')).toBe(true);
    expect(sets.sourceHandles.has('button_1')).toBe(true);
    expect(sets.sourceHandles.has('bottom')).toBe(false);
  });

  it('flags targetHandle left on message+buttons as invalid before normalize', () => {
    const nodes = [n('m', 'message', { buttons: [{ label: 'x' }] })];
    const edges: Edge[] = [{ id: 'e1', source: 'x', target: 'm', targetHandle: 'left' } as Edge];
    const issues = listInvalidFlowEdges(nodes, edges);
    expect(issues.some(x => x.includes('targetHandle'))).toBe(true);
  });

  it('normalizes targetHandle left -> top for message with buttons', () => {
    const nodes = [n('m', 'message', { buttons: [{ label: 'x' }] })];
    const edges: Edge[] = [{ id: 'e1', source: 'x', target: 'm', targetHandle: 'left' } as Edge];
    const out = normalizeScenarioEdges(nodes, edges);
    expect(out[0].targetHandle).toBe('top');
  });

  it('reports persisted invalid connections involving Start and End', () => {
    const nodes = [n('s', 'start')];
    const startIssues = listInvalidFlowEdges(nodes, [
      { id: 'e1', source: 'a', target: 's' } as Edge,
    ]);
    expect(startIssues.some(issue => issue.includes('входящая связь'))).toBe(true);
    const end = n('e', 'end');
    const endIssues = listInvalidFlowEdges([end], [{ id: 'e2', source: 'e', target: 'x' } as Edge]);
    expect(endIssues.some(issue => issue.includes('терминального'))).toBe(true);
  });

  it('maps invalid source bottom on message+buttons to button_0', () => {
    const nodes = [n('m', 'message', { buttons: [{ label: 'Go' }] })];
    const edges: Edge[] = [{ id: 'e1', source: 'm', target: 't', sourceHandle: 'bottom' } as Edge];
    const out = normalizeScenarioEdges(nodes, edges);
    expect(out[0].sourceHandle).toBe('button_0');
  });

  it('input node exposes success and error sources', () => {
    const sets = getNodeHandleSets(n('i', 'input'));
    expect(sets.sourceHandles.has('success')).toBe(true);
    expect(sets.sourceHandles.has('error')).toBe(true);
  });

  it('normalizes legacy right exit from input to success', () => {
    const nodes = [n('i', 'input')];
    const edges: Edge[] = [{ id: 'e1', source: 'i', target: 't', sourceHandle: 'right' } as Edge];
    const out = normalizeScenarioEdges(nodes, edges);
    expect(out[0].sourceHandle).toBe('success');
  });

  it('condition node: top target only, yes/no sources', () => {
    const sets = getNodeHandleSets(n('c', 'condition'));
    expect([...sets.targetHandles]).toEqual(['top']);
    expect([...sets.sourceHandles].sort()).toEqual(['condition_no', 'condition_yes']);
  });

  it('normalizes condition exit using conditionBranch when handles are legacy', () => {
    const nodes = [n('c', 'condition')];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'c',
        target: 'a',
        sourceHandle: 'bottom',
        data: { conditionBranch: 'true' },
      } as Edge,
    ];
    const out = normalizeScenarioEdges(nodes, edges);
    expect(out[0].sourceHandle).toBe('condition_yes');
  });

  it('normalizes incoming targetHandle left on condition to top', () => {
    const nodes = [n('c', 'condition')];
    const edges: Edge[] = [{ id: 'e1', source: 'x', target: 'c', targetHandle: 'left' } as Edge];
    const out = normalizeScenarioEdges(nodes, edges);
    expect(out[0].targetHandle).toBe('top');
  });
});
