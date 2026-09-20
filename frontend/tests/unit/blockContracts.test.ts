import { describe, expect, it } from 'vitest';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_CONNECTION_CONTRACT,
  CONDITION_HANDLES,
  classifyScenarioNodes,
  connectionContractViolation,
  discoverStartNode,
  normalizeBlockCode,
} from '@/utils/blockContracts';

describe('blockContracts', () => {
  it('preserves canonical aliases and terminal metadata', () => {
    expect(normalizeBlockCode('variable')).toBe('set_variable');
    expect(normalizeBlockCode('unknown')).toBeUndefined();
    expect(BLOCK_CONNECTION_CONTRACT.end.terminal).toBe(true);
    expect(CONDITION_HANDLES).toEqual(['condition_yes', 'condition_no']);
  });

  it('discovers Start strictly for canonical graphs and preserves legacy fallback', () => {
    const canonical = [{ data: { blockId: 'message' } }, { data: { blockId: 'start' } }];
    expect(discoverStartNode(canonical).node).toBe(canonical[1]);
    expect(discoverStartNode([{ data: { blockId: 'message' } }]).diagnostic).toBe('missing_start');
    expect(
      discoverStartNode([{ data: { blockId: 'start' } }, { data: { blockId: 'start' } }]).diagnostic
    ).toBe('duplicate_start');
    expect(classifyScenarioNodes([{ data: { blockId: 'start' } }, { type: 'message' }])).toBe(
      'mixed_unsafe'
    );
    expect(discoverStartNode([{ type: 'message' }, { type: 'start' }]).node).toEqual({
      type: 'start',
    });
  });

  it('rejects End outgoing and Start incoming or second outgoing connections', () => {
    expect(connectionContractViolation('end', 'message', 0)).toBe('end_outgoing');
    expect(connectionContractViolation('message', 'start', 0)).toBe('start_incoming');
    expect(connectionContractViolation('start', 'message', 1)).toBe('start_outgoing');
  });
});
