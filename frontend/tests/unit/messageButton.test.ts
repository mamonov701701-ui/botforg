import { describe, it, expect } from 'vitest';
import {
  normalizeMessageButtonAction,
  findMessageButtonByPayload,
} from '../../src/utils/messageButton';
import type { Node } from 'reactflow';

function msgNode(buttons: any[]): Node {
  return {
    id: 'm1',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { blockId: 'message', settings: { buttons } },
  } as any;
}

describe('messageButton utils', () => {
  it('normalize: branch and legacy → next', () => {
    expect(normalizeMessageButtonAction('branch')).toBe('next');
    expect(normalizeMessageButtonAction('next')).toBe('next');
    expect(normalizeMessageButtonAction(undefined)).toBe('next');
    expect(normalizeMessageButtonAction('url')).toBe('url');
  });

  it('findMessageButtonByPayload by buttonId', () => {
    const n = msgNode([{ id: 'a', label: 'A', action: 'url', url: 'https://x.test' }]);
    const b = findMessageButtonByPayload(n, { buttonId: 'a', sourceHandle: null });
    expect(b?.url).toBe('https://x.test');
  });

  it('findMessageButtonByPayload by sourceHandle index', () => {
    const n = msgNode([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    const b = findMessageButtonByPayload(n, { sourceHandle: 'button_1', buttonId: null });
    expect((b as any)?.id).toBe('b');
  });
});
