import { describe, it, expect } from 'vitest';
import {
  evaluateConditionSettings,
  orderConditionOutgoingEdges,
  resolveConditionYesNoEdges,
  ensureConditionEdgeBranches,
} from '@/utils/conditionBlock';
import type { Edge, Node } from 'reactflow';

describe('conditionBlock', () => {
  it('orderConditionOutgoingEdges sorts by edge id', () => {
    const edges = [
      { id: 'z', source: 'a', target: 'b' },
      { id: 'm', source: 'a', target: 'c' },
    ] as Edge[];
    const o = orderConditionOutgoingEdges(edges);
    expect(o.map(e => e.id)).toEqual(['m', 'z']);
  });

  it('evaluateConditionSettings equals / notEquals', () => {
    expect(evaluateConditionSettings({ operator: 'equals', value: 'x' }, 'x')).toBe(true);
    expect(evaluateConditionSettings({ operator: 'equals', value: 'x' }, 'y')).toBe(false);
    expect(evaluateConditionSettings({ operator: 'notEquals', value: 'x' }, 'y')).toBe(true);
  });

  it('evaluateConditionSettings isEmpty / isNotEmpty', () => {
    expect(evaluateConditionSettings({ operator: 'isEmpty' }, '')).toBe(true);
    expect(evaluateConditionSettings({ operator: 'isEmpty' }, 'a')).toBe(false);
    expect(evaluateConditionSettings({ operator: 'isNotEmpty' }, 'a')).toBe(true);
  });

  it('evaluateConditionSettings greaterThan', () => {
    expect(evaluateConditionSettings({ operator: 'greaterThan', value: '3' }, 5)).toBe(true);
    expect(evaluateConditionSettings({ operator: 'greaterThan', value: '3' }, 2)).toBe(false);
  });

  it('resolveConditionYesNoEdges uses explicit conditionBranch when both present', () => {
    const edges = [
      { id: 'a', source: 'c', target: 'X', data: { conditionBranch: 'false' as const } },
      { id: 'b', source: 'c', target: 'Y', data: { conditionBranch: 'true' as const } },
    ] as Edge[];
    const { yes, no } = resolveConditionYesNoEdges(edges);
    expect(yes?.target).toBe('Y');
    expect(no?.target).toBe('X');
  });

  it('resolveConditionYesNoEdges falls back to id order when branches missing', () => {
    const edges = [
      { id: 'e1', source: 'c', target: 'First' },
      { id: 'e2', source: 'c', target: 'Second' },
    ] as Edge[];
    const { yes, no } = resolveConditionYesNoEdges(edges);
    expect(yes?.target).toBe('First');
    expect(no?.target).toBe('Second');
  });

  it('ensureConditionEdgeBranches assigns true/false to first two edges by id', () => {
    const nodes = [{ id: 'c1', data: { blockId: 'condition' } }] as Node[];
    const edges = [
      { id: 'z', source: 'c1', target: 'A', data: {} },
      { id: 'm', source: 'c1', target: 'B', data: {} },
    ] as Edge[];
    const next = ensureConditionEdgeBranches(edges, nodes);
    const byId = Object.fromEntries(next.map(e => [e.id, e]));
    expect((byId.m.data as { conditionBranch?: string }).conditionBranch).toBe('true');
    expect((byId.z.data as { conditionBranch?: string }).conditionBranch).toBe('false');
    expect(byId.m.sourceHandle).toBe('condition_yes');
    expect(byId.z.sourceHandle).toBe('condition_no');
  });

  it('ensureConditionEdgeBranches leaves existing branches unchanged', () => {
    const nodes = [{ id: 'c1', data: { blockId: 'condition' } }] as Node[];
    const edges = [
      { id: 'a', source: 'c1', target: 'X', data: { conditionBranch: 'true' as const } },
      { id: 'b', source: 'c1', target: 'Y', data: { conditionBranch: 'false' as const } },
    ] as Edge[];
    expect(ensureConditionEdgeBranches(edges, nodes)).toBe(edges);
  });

  it('ensureConditionEdgeBranches derives branch from sourceHandle before id fallback', () => {
    const nodes = [{ id: 'c1', data: { blockId: 'condition' } }] as Node[];
    const edges = [
      { id: 'z', source: 'c1', target: 'A', sourceHandle: 'condition_no', data: {} },
      { id: 'a', source: 'c1', target: 'B', sourceHandle: 'condition_yes', data: {} },
    ] as Edge[];
    const next = ensureConditionEdgeBranches(edges, nodes);
    const byId = Object.fromEntries(next.map(e => [e.id, e]));
    expect((byId.z.data as { conditionBranch?: string }).conditionBranch).toBe('false');
    expect((byId.a.data as { conditionBranch?: string }).conditionBranch).toBe('true');
  });
});
