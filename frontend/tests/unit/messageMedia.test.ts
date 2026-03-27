import { describe, it, expect } from 'vitest';
import {
  inferMessageMediaKindFromUrl,
  messageMediaItemMatchesDeclared,
  fileMatchesDeclaredMessageMedia,
  messageMediaListRowCompatibleWithDeclared,
} from '../../src/utils/messageMedia';

describe('messageMedia', () => {
  it('inferMessageMediaKindFromUrl: image vs gif vs video', () => {
    expect(inferMessageMediaKindFromUrl('https://x.com/p.jpg')).toBe('image');
    expect(inferMessageMediaKindFromUrl('https://x.com/p.jpeg?w=1')).toBe('image');
    expect(inferMessageMediaKindFromUrl('https://x.com/a.gif')).toBe('gif');
    expect(inferMessageMediaKindFromUrl('https://cdn/x.MP4')).toBe('video');
    expect(inferMessageMediaKindFromUrl('https://v.com/m.webm')).toBe('video');
  });

  it('messageMediaItemMatchesDeclared', () => {
    expect(messageMediaItemMatchesDeclared('image', 'image')).toBe(true);
    expect(messageMediaItemMatchesDeclared('image', 'gif')).toBe(false);
    expect(messageMediaItemMatchesDeclared('gif', 'gif')).toBe(true);
    expect(messageMediaItemMatchesDeclared('video', 'image')).toBe(false);
  });

  it('messageMediaListRowCompatibleWithDeclared', () => {
    expect(
      messageMediaListRowCompatibleWithDeclared(
        { url: 'https://x.com/a.jpg', type: 'image' },
        'image'
      )
    ).toBe(true);
    expect(
      messageMediaListRowCompatibleWithDeclared(
        { url: 'https://x.com/a.gif', type: 'gif' },
        'image'
      )
    ).toBe(false);
    expect(
      messageMediaListRowCompatibleWithDeclared(
        { url: 'https://x.com/v.mp4', type: 'video' },
        'video'
      )
    ).toBe(true);
  });

  it('fileMatchesDeclaredMessageMedia uses MIME allowlist', () => {
    const img = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const gif = new File(['x'], 'x.gif', { type: 'image/gif' });
    const mp4 = new File(['x'], 'x.mp4', { type: 'video/mp4' });
    expect(fileMatchesDeclaredMessageMedia('image', img)).toBe(true);
    expect(fileMatchesDeclaredMessageMedia('image', gif)).toBe(false);
    expect(fileMatchesDeclaredMessageMedia('gif', gif)).toBe(true);
    expect(fileMatchesDeclaredMessageMedia('video', mp4)).toBe(true);
    expect(fileMatchesDeclaredMessageMedia('video', img)).toBe(false);
  });
});
