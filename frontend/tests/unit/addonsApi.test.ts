import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicAddons, formatAddonPrice, formatAddonAmountLine } from '@/api/addons';

vi.mock('@/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

import { get } from '@/api/client';

describe('addons API', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it('loads and normalizes GET /addons', async () => {
    vi.mocked(get).mockResolvedValue([
      {
        code: 'msg_1k',
        name_ru: 'Пакет 1000 сообщений',
        description_ru: 'Дополнительный пакет',
        type: 'messages',
        amount: 1000,
        price: '299.00',
        currency: 'RUB',
        duration_type: 'current_period',
        validity_days: 30,
        available_from_plan: ['start'],
        max_per_period: 2,
        sort_order: 10,
      },
    ]);

    const items = await getPublicAddons();
    expect(get).toHaveBeenCalledWith('/addons');
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('msg_1k');
    expect(items[0].validity_days).toBe(30);
    expect(items[0].name_ru).toBe('Пакет 1000 сообщений');
    expect(items[0].price).toBe('299.00');
    expect(formatAddonPrice(items[0].price, items[0].currency)).toMatch(/299/);
    expect(formatAddonAmountLine(items[0])).toMatch(/Сообщения/);
  });

  it('returns empty list for non-array', async () => {
    vi.mocked(get).mockResolvedValue({ bad: true });
    expect(await getPublicAddons()).toEqual([]);
  });
});
