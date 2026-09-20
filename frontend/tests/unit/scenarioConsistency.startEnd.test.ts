import { describe, expect, it } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { validateScenarioConsistency } from '@/utils/scenarioConsistency';

function node(id: string, blockId: string): Node {
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { blockId, title: id } } as Node;
}

describe('Start and End connection diagnostics', () => {
  it('diagnoses persisted End outgoing, Start incoming, and a second Start outgoing edge', () => {
    const nodes = [node('start', 'start'), node('end', 'end'), node('message', 'message')];
    const edges = [
      { id: 'incoming-start', source: 'message', target: 'start' },
      { id: 'start-one', source: 'start', target: 'end' },
      { id: 'start-two', source: 'start', target: 'message' },
      { id: 'end-outgoing', source: 'end', target: 'message' },
    ] as Edge[];
    const diagnostics = validateScenarioConsistency(nodes, edges, []);
    expect(diagnostics.filter(d => d.code === 'BlockConnectionContractViolation')).toHaveLength(3);
  });
});
