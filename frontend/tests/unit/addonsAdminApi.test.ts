import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from '@/api/client';
import { listAdminAddons, normalizeAdminAddon } from '@/api/addonsAdmin';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() };
});

describe('addonsAdmin API', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it('normalizes list payload', async () => {
    vi.mocked(get).mockResolvedValue({
      items: [
        {
          id: 7,
          code: 'msg_1000',
          name_ru: '1000 сообщений',
          type: 'messages',
          amount: 1000,
          price: 199,
          currency: 'RUB',
          duration_type: 'current_period',
          validity_days: 30,
          is_active: true,
          is_public: true,
          sort_order: 10,
          user_addon_count: 2,
          checkout_count: 1,
          gift_count: 0,
          refund_count: 0,
          has_references: true,
          can_delete: false,
        },
      ],
      total: 1,
    });
    const data = await listAdminAddons();
    expect(get).toHaveBeenCalledWith('/api/admin/tariffs/addons');
    expect(data.total).toBe(1);
    expect(data.items[0].price).toBe('199.00');
    expect(data.items[0].has_references).toBe(true);
    expect(data.items[0].can_delete).toBe(false);
  });

  it('fills defaults for missing fields', () => {
    const row = normalizeAdminAddon({ id: 1, code: 'x', name_ru: 'X', type: 'ai_credits' });
    expect(row.currency).toBe('RUB');
    expect(row.validity_days).toBe(30);
    expect(row.is_active).toBe(true);
    expect(row.can_delete).toBe(false);
  });
});
