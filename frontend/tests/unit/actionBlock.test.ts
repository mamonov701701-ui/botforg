import { describe, expect, it } from 'vitest';
import { canonicalizeActionSettings, normalizeActionSettings } from '@/utils/actionBlock';

describe('actionBlock compatibility', () => {
  it('canonicalize keeps legacy actionType for tag runtime', () => {
    const out = canonicalizeActionSettings({
      mode: 'tag',
      tagAction: 'add',
      tag: 'vip',
      message: 'ok',
    });
    expect(out.mode).toBe('tag');
    expect(out.tagAction).toBe('add');
    expect(out.tag).toBe('vip');
    expect(out.actionType).toBe('add_tag');
    expect(out.text).toBe('ok');
  });

  it('normalize reads legacy actionType', () => {
    const s = normalizeActionSettings({ actionType: 'remove_tag', tag: 'cold' });
    expect(s.mode).toBe('tag');
    expect(s.tagAction).toBe('remove');
    expect(s.tag).toBe('cold');
  });
});
