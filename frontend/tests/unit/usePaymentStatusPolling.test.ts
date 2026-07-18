import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PaymentStatus } from '@/api/checkoutPay';

const { getCheckoutPaymentStatus } = vi.hoisted(() => ({
  getCheckoutPaymentStatus: vi.fn(),
}));

vi.mock('@/api/checkoutPay', async () => {
  const actual = await vi.importActual<typeof import('@/api/checkoutPay')>('@/api/checkoutPay');
  return {
    ...actual,
    getCheckoutPaymentStatus,
  };
});

import { usePaymentStatusPolling } from '@/features/checkout/usePaymentStatusPolling';

function pending(): PaymentStatus {
  return {
    intent_id: 7,
    intent_status: 'awaiting_payment',
    amount: '199.00',
    currency: 'RUB',
    attempt_status: 'pending',
    normalized_status: 'pending',
    is_final: false,
    can_retry: false,
    message: 'Ожидаем подтверждение оплаты',
  };
}

function finalPaid(): PaymentStatus {
  return {
    intent_id: 7,
    intent_status: 'fulfilled',
    amount: '199.00',
    currency: 'RUB',
    attempt_status: 'succeeded',
    normalized_status: 'succeeded',
    is_final: true,
    can_retry: false,
    message: 'Оплата подтверждена',
  };
}

describe('usePaymentStatusPolling', () => {
  beforeEach(() => {
    getCheckoutPaymentStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until final status then stops', async () => {
    getCheckoutPaymentStatus
      .mockResolvedValueOnce(pending())
      .mockResolvedValueOnce(pending())
      .mockResolvedValueOnce(finalPaid());

    const { result } = renderHook(() => usePaymentStatusPolling({ intentId: 7, intervalMs: 200 }));

    await waitFor(
      () => {
        expect(result.current.status?.is_final).toBe(true);
      },
      { timeout: 3000 }
    );

    const callsAfterFinal = getCheckoutPaymentStatus.mock.calls.length;
    await act(async () => {
      await new Promise(r => setTimeout(r, 500));
    });
    expect(getCheckoutPaymentStatus.mock.calls.length).toBe(callsAfterFinal);
    expect(result.current.isPolling).toBe(false);
  });

  it('stops polling on unmount', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(pending());
    const { unmount } = renderHook(() => usePaymentStatusPolling({ intentId: 7, intervalMs: 200 }));
    await waitFor(() => {
      expect(getCheckoutPaymentStatus).toHaveBeenCalled();
    });
    const before = getCheckoutPaymentStatus.mock.calls.length;
    unmount();
    await act(async () => {
      await new Promise(r => setTimeout(r, 500));
    });
    expect(getCheckoutPaymentStatus.mock.calls.length).toBe(before);
  });

  it('does not start parallel requests while in flight', async () => {
    let resolveFirst!: (v: PaymentStatus) => void;
    getCheckoutPaymentStatus.mockImplementation(
      () =>
        new Promise<PaymentStatus>(resolve => {
          resolveFirst = resolve;
        })
    );

    const { result } = renderHook(() => usePaymentStatusPolling({ intentId: 7, intervalMs: 5000 }));

    await waitFor(() => {
      expect(getCheckoutPaymentStatus).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      void result.current.refresh();
      void result.current.refresh();
    });
    expect(getCheckoutPaymentStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(pending());
    });
    await waitFor(() => {
      expect(result.current.status?.intent_status).toBe('awaiting_payment');
    });
  });

  it('surfaces network error and allows manual retry', async () => {
    getCheckoutPaymentStatus
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(pending());

    const { result } = renderHook(() =>
      usePaymentStatusPolling({ intentId: 7, intervalMs: 10000 })
    );

    await waitFor(() => {
      expect(result.current.error).toMatch(/связи|сервер|интернет/i);
    });

    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.status?.intent_status).toBe('awaiting_payment');
    });
  });
});
