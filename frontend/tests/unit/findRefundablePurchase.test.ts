import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findRefundablePurchaseByIntent,
  parseRefundIntentParam,
} from '@/features/dashboard/refunds/findRefundablePurchase';

const listMyRefundablePurchases = vi.fn();

vi.mock('@/api/refunds', async () => {
  const actual = await vi.importActual<typeof import('@/api/refunds')>('@/api/refunds');
  return {
    ...actual,
    listMyRefundablePurchases: (...args: unknown[]) => listMyRefundablePurchases(...args),
  };
});

describe('findRefundablePurchase', () => {
  beforeEach(() => {
    listMyRefundablePurchases.mockReset();
  });

  it('parses intent query param', () => {
    expect(parseRefundIntentParam('12')).toBe(12);
    expect(parseRefundIntentParam('0')).toBeNull();
    expect(parseRefundIntentParam('abc')).toBeNull();
  });

  it('finds purchase on later page without loading all rows at once', async () => {
    listMyRefundablePurchases
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, i) => ({
          checkout_intent_id: i + 1,
          payment_attempt_id: i + 1,
          product_type: 'addon',
          product_code: 'x',
          product_name: `P${i + 1}`,
          amount: '1.00',
          currency: 'RUB',
          paid_at: null,
          current_refund_status: null,
          current_refund_request_id: null,
          can_request_refund: true,
          unavailable_reason: null,
        })),
        total: 21,
        limit: 20,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            checkout_intent_id: 21,
            payment_attempt_id: 21,
            product_type: 'addon',
            product_code: 'x',
            product_name: 'Target',
            amount: '1.00',
            currency: 'RUB',
            paid_at: null,
            current_refund_status: null,
            current_refund_request_id: null,
            can_request_refund: true,
            unavailable_reason: null,
          },
        ],
        total: 21,
        limit: 20,
        offset: 20,
      });

    const found = await findRefundablePurchaseByIntent(21);
    expect(found?.product_name).toBe('Target');
    expect(listMyRefundablePurchases).toHaveBeenCalledTimes(2);
    expect(listMyRefundablePurchases.mock.calls[0][0]).toEqual({ limit: 20, offset: 0 });
    expect(listMyRefundablePurchases.mock.calls[1][0]).toEqual({ limit: 20, offset: 20 });
  });
});
