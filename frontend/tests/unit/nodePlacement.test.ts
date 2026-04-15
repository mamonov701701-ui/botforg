import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import { resolveNewNodePosition } from '@/features/editorV2/utils/nodePlacement';

function n(id: string, x: number, y: number, blockId = 'message'): Node {
  return {
    id,
    type: 'default',
    position: { x, y },
    data: { blockId, title: id },
  } as Node;
}

describe('nodePlacement', () => {
  it('uses auto-chain anchor from selected node', () => {
    const selected = n('s', 100, 200, 'message');
    const position = resolveNewNodePosition({
      selectedNode: selected,
      nodes: [selected],
      fallbackCenter: { x: 0, y: 0 },
    });
    expect(position).toEqual({ x: 440, y: 200 });
  });

  it('falls back to viewport center when no selected node', () => {
    const position = resolveNewNodePosition({
      nodes: [],
      fallbackCenter: { x: 151, y: 89 },
    });
    expect(position).toEqual({ x: 160, y: 80 });
  });

  it('avoids collisions by finding nearest free grid slot', () => {
    const existing = [n('a', 420, 200), n('b', 460, 200), n('c', 420, 240)];
    const selected = n('s', 100, 200, 'message');
    const position = resolveNewNodePosition({
      selectedNode: selected,
      nodes: [...existing, selected],
      fallbackCenter: { x: 0, y: 0 },
    });
    expect(position).not.toEqual({ x: 420, y: 200 });
    expect(position.x % 40).toBe(0);
    expect(position.y % 40).toBe(0);
  });
});
