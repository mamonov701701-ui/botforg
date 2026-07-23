import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CheckoutIntent } from '@/api/checkout';
import type { PaymentStatus } from '@/api/checkoutPay';
import { ApiError } from '@/api/client';
import PurchaseDetailPage from '@/features/dashboard/pages/PurchaseDetailPage';

const {
  getCheckoutIntent,
  startCheckoutPayment,
  createCheckoutIntent,
  getCheckoutPaymentStatus,
  cancelCheckoutPayment,
  listMyRefundablePurchases,
  toast,
} = vi.hoisted(() => ({
  getCheckoutIntent: vi.fn(),
  startCheckoutPayment: vi.fn(),
  createCheckoutIntent: vi.fn(),
  getCheckoutPaymentStatus: vi.fn(),
  cancelCheckoutPayment: vi.fn(),
  listMyRefundablePurchases: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/utils/toast', () => ({ toast }));

vi.mock('@/api/checkoutPay', async () => {
  const actual = await vi.importActual<typeof import('@/api/checkoutPay')>('@/api/checkoutPay');
  return {
    ...actual,
    getCheckoutPaymentStatus,
    cancelCheckoutPayment,
  };
});

vi.mock('@/api/checkout', async () => {
  const actual = await vi.importActual<typeof import('@/api/checkout')>('@/api/checkout');
  return {
    ...actual,
    getCheckoutIntent,
    startCheckoutPayment,
    createCheckoutIntent,
  };
});

vi.mock('@/api/refunds', async () => {
  const actual = await vi.importActual<typeof import('@/api/refunds')>('@/api/refunds');
  return {
    ...actual,
    listMyRefundablePurchases,
  };
});

function intent(partial: Partial<CheckoutIntent> & Pick<CheckoutIntent, 'id'>): CheckoutIntent {
  return {
    product_type: 'addon',
    product_code: 'msg_1000',
    product_name: 'Пакет 1000',
    description: null,
    amount: '190.00',
    currency: 'RUB',
    status: 'pending',
    idempotency_key: 'key',
    payment_provider: 'yookassa',
    provider_payment_id: 'secret-should-not-show',
    paid_at: null,
    fulfilled_at: null,
    failed_at: null,
    cancelled_at: null,
    refunded_at: null,
    fulfilled_subscription_id: null,
    fulfilled_addon_id: null,
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:00:00Z',
    ...partial,
  };
}

function payment(partial: Partial<PaymentStatus> = {}): PaymentStatus {
  return {
    intent_id: 42,
    intent_status: 'awaiting_payment',
    amount: '190.00',
    currency: 'RUB',
    attempt_status: 'pending',
    normalized_status: 'pending',
    is_final: false,
    can_retry: false,
    message: 'Ожидаем подтверждение оплаты',
    ...partial,
  };
}

function renderDetail(path = '/dashboard/finance/purchases/42') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/finance/purchases/:purchaseId" element={<PurchaseDetailPage />} />
        <Route
          path="/dashboard/finance/purchases"
          element={<div data-testid="purchases-list-route">list</div>}
        />
        <Route path="/dashboard/finance" element={<div data-testid="finance-route">finance</div>} />
        <Route
          path="/dashboard/finance/refunds"
          element={<div data-testid="refunds-route">refunds</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PurchaseDetailPage', () => {
  const assignSpy = vi.fn();

  beforeEach(() => {
    getCheckoutIntent.mockReset();
    startCheckoutPayment.mockReset();
    createCheckoutIntent.mockReset();
    getCheckoutPaymentStatus.mockReset();
    cancelCheckoutPayment.mockReset();
    listMyRefundablePurchases.mockReset();
    listMyRefundablePurchases.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    toast.success.mockReset();
    toast.error.mockReset();
    assignSpy.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'http://localhost:5173',
        assign: assignSpy,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads getCheckoutIntent for detail', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'fulfilled' }));
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    renderDetail();
    await waitFor(() => {
      expect(getCheckoutIntent).toHaveBeenCalledWith(42);
      expect(screen.getByTestId('purchase-detail-name').textContent).toBe('Пакет 1000');
    });
  });

  it('pending purchase mounts PaymentStatusCard', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'pending' }));
    getCheckoutPaymentStatus.mockResolvedValue(payment());
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-card')).toBeTruthy();
      expect(getCheckoutPaymentStatus).toHaveBeenCalledWith(42);
    });
  });

  it('final succeeded shows Оплачено и активировано', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'fulfilled',
        paid_at: '2026-07-22T11:00:00Z',
        fulfilled_at: '2026-07-22T11:01:00Z',
        fulfilled_addon_id: 7,
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({
        intent_status: 'fulfilled',
        normalized_status: 'succeeded',
        is_final: true,
        can_retry: false,
        message: 'Оплата подтверждена',
      })
    );
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-status').textContent).toBe(
        'Оплачено и активировано'
      );
    });
    expect(screen.queryByTestId('payment-status-card')).toBeNull();
    expect(screen.getByTestId('purchase-detail-payment-final')).toBeTruthy();
  });

  it('canceled shows Отменено', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'cancelled',
        cancelled_at: '2026-07-22T12:00:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({
        intent_status: 'cancelled',
        normalized_status: 'cancelled',
        is_final: true,
        can_retry: false,
        message: 'Оплата отменена',
      })
    );
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-status').textContent).toBe('Отменено');
    });
  });

  it('fulfilled tariff shows Тариф активирован', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        product_type: 'tariff',
        product_name: 'Бизнес',
        status: 'fulfilled',
        fulfilled_subscription_id: 9,
        fulfilled_at: '2026-07-22T11:01:00Z',
        paid_at: '2026-07-22T11:00:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-fulfillment').textContent).toBe(
        'Тариф активирован'
      );
    });
    expect(screen.getByTestId('purchase-detail-type').textContent).toBe('Тариф');
  });

  it('fulfilled addon shows Доп. пакет активирован', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'fulfilled',
        fulfilled_addon_id: 3,
        paid_at: '2026-07-22T11:00:00Z',
        fulfilled_at: '2026-07-22T11:01:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-fulfillment').textContent).toBe(
        'Доп. пакет активирован'
      );
    });
  });

  it('retry uses same intent id and does not create CheckoutIntent', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'pending' }));
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({
        intent_status: 'pending',
        attempt_status: 'failed',
        normalized_status: 'failed',
        is_final: true,
        can_retry: true,
        message: 'Можно начать оплату заново',
      })
    );
    startCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      attempt_id: 99,
      provider: 'yookassa',
      provider_payment_id: null,
      confirmation_url: 'https://pay.example/confirm',
      already_started: false,
    });

    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-retry')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('payment-status-retry'));

    await waitFor(() => {
      expect(startCheckoutPayment).toHaveBeenCalledTimes(1);
    });
    expect(startCheckoutPayment.mock.calls[0][0]).toBe(42);
    expect(startCheckoutPayment.mock.calls[0][1].return_url).toContain(
      '/dashboard/finance/purchases/42'
    );
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('https://pay.example/confirm');
  });

  it('cancel refreshes detail/status', async () => {
    const awaitingIntent = intent({ id: 42, status: 'awaiting_payment' });
    const cancelledIntent = intent({
      id: 42,
      status: 'cancelled',
      cancelled_at: '2026-07-22T12:00:00Z',
    });
    getCheckoutIntent.mockImplementation(async () => {
      const calls = getCheckoutIntent.mock.calls.length;
      return calls <= 1 ? awaitingIntent : cancelledIntent;
    });
    getCheckoutPaymentStatus.mockResolvedValueOnce(payment()).mockResolvedValue(
      payment({
        intent_status: 'cancelled',
        normalized_status: 'cancelled',
        is_final: true,
        can_retry: false,
        message: 'Оплата отменена',
      })
    );
    cancelCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      intent_status: 'cancelled',
      already_cancelled: false,
      payment_already_succeeded: false,
      message: 'Оплата отменена',
    });

    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('payment-status-cancel'));

    await waitFor(() => {
      expect(cancelCheckoutPayment).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(getCheckoutIntent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-status').textContent).toBe('Отменено');
    });
  });

  it('provider-succeeded reconcile does not show raw 502', async () => {
    const awaitingIntent = intent({ id: 42, status: 'awaiting_payment' });
    const fulfilledIntent = intent({
      id: 42,
      status: 'fulfilled',
      paid_at: '2026-07-22T11:00:00Z',
      fulfilled_at: '2026-07-22T11:01:00Z',
      fulfilled_addon_id: 1,
    });
    getCheckoutIntent.mockImplementation(async () => {
      const calls = getCheckoutIntent.mock.calls.length;
      return calls <= 1 ? awaitingIntent : fulfilledIntent;
    });
    getCheckoutPaymentStatus.mockResolvedValueOnce(payment()).mockResolvedValue(
      payment({
        intent_status: 'fulfilled',
        normalized_status: 'succeeded',
        is_final: true,
        can_retry: false,
        message: 'Оплата подтверждена',
      })
    );
    cancelCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      intent_status: 'fulfilled',
      already_cancelled: false,
      payment_already_succeeded: true,
      message: 'Оплата уже подтверждена',
    });
    listMyRefundablePurchases.mockResolvedValue({
      items: [
        {
          checkout_intent_id: 42,
          payment_attempt_id: 7,
          product_type: 'addon',
          product_code: 'msg_1000',
          product_name: 'Пакет 1000',
          amount: '190.00',
          currency: 'RUB',
          paid_at: '2026-07-22T11:00:00Z',
          current_refund_status: null,
          current_refund_request_id: null,
          can_request_refund: true,
          unavailable_reason: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderDetail();
    await waitFor(() => expect(screen.getByTestId('payment-status-cancel')).toBeTruthy());
    fireEvent.click(screen.getByTestId('payment-status-cancel'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(screen.queryByText(/502/)).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-status').textContent).toBe(
        'Оплачено и активировано'
      );
    });
  });

  it('fulfilled shows refund CTA to refunds?intent=', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'fulfilled',
        fulfilled_addon_id: 1,
        paid_at: '2026-07-22T11:00:00Z',
        fulfilled_at: '2026-07-22T11:01:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    listMyRefundablePurchases.mockResolvedValue({
      items: [
        {
          checkout_intent_id: 42,
          payment_attempt_id: 7,
          product_type: 'addon',
          product_code: 'msg_1000',
          product_name: 'Пакет 1000',
          amount: '190.00',
          currency: 'RUB',
          paid_at: '2026-07-22T11:00:00Z',
          current_refund_status: null,
          current_refund_request_id: null,
          can_request_refund: true,
          unavailable_reason: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-refund-link')).toBeTruthy();
    });
    expect(screen.getByTestId('purchase-detail-refund-link').getAttribute('href')).toBe(
      '/dashboard/finance/refunds?intent=42'
    );
  });

  it('hides refund CTA when open refund already exists', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'fulfilled',
        fulfilled_addon_id: 1,
        paid_at: '2026-07-22T11:00:00Z',
        fulfilled_at: '2026-07-22T11:01:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    listMyRefundablePurchases.mockResolvedValue({
      items: [
        {
          checkout_intent_id: 42,
          payment_attempt_id: 7,
          product_type: 'addon',
          product_code: 'msg_1000',
          product_name: 'Пакет 1000',
          amount: '190.00',
          currency: 'RUB',
          paid_at: '2026-07-22T11:00:00Z',
          current_refund_status: 'submitted',
          current_refund_request_id: 88,
          can_request_refund: false,
          unavailable_reason: 'active_refund_request',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-refund-unavailable')).toBeTruthy();
    });
    expect(screen.queryByTestId('purchase-detail-refund-cta')).toBeNull();
    expect(screen.getByTestId('purchase-detail-existing-refund').getAttribute('href')).toBe(
      '/dashboard/finance/refunds/88'
    );
  });

  it('hides refund CTA when purchase is fully refunded', async () => {
    getCheckoutIntent.mockResolvedValue(
      intent({
        id: 42,
        status: 'fulfilled',
        fulfilled_addon_id: 1,
        paid_at: '2026-07-22T11:00:00Z',
        fulfilled_at: '2026-07-22T11:01:00Z',
      })
    );
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    listMyRefundablePurchases.mockResolvedValue({
      items: [
        {
          checkout_intent_id: 42,
          payment_attempt_id: 7,
          product_type: 'addon',
          product_code: 'msg_1000',
          product_name: 'Пакет 1000',
          amount: '490.00',
          currency: 'RUB',
          paid_at: '2026-07-22T11:00:00Z',
          current_refund_status: 'completed',
          current_refund_request_id: 4,
          can_request_refund: false,
          unavailable_reason: 'purchase_fully_refunded',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-refund-unavailable')).toBeTruthy();
    });
    expect(screen.queryByTestId('purchase-detail-refund-cta')).toBeNull();
    expect(screen.queryByTestId('purchase-detail-refund-link')).toBeNull();
  });

  it('pending/failed/canceled do not show refund CTA', async () => {
    for (const status of ['pending', 'failed', 'cancelled'] as const) {
      getCheckoutIntent.mockResolvedValue(intent({ id: 42, status }));
      getCheckoutPaymentStatus.mockResolvedValue(
        payment({
          intent_status: status,
          normalized_status: status === 'pending' ? 'pending' : status,
          is_final: status !== 'pending',
          can_retry: false,
        })
      );
      const { unmount } = renderDetail();
      await waitFor(() => {
        expect(screen.getByTestId('purchase-detail-basic')).toBeTruthy();
      });
      expect(screen.queryByTestId('purchase-detail-refund-cta')).toBeNull();
      unmount();
    }
  });

  it('Назад к моим покупкам works', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'fulfilled' }));
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({ intent_status: 'fulfilled', normalized_status: 'succeeded', is_final: true })
    );
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('purchase-detail-back')).toBeTruthy());
    fireEvent.click(screen.getByTestId('purchase-detail-back'));
    expect(screen.getByTestId('purchases-list-route')).toBeTruthy();
  });

  it('404/foreign purchase shows safe error', async () => {
    getCheckoutIntent.mockRejectedValue(new ApiError('not found', 404));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-error').textContent).toMatch(/Покупка не найдена/);
    });
    expect(screen.queryByText(/404/)).toBeNull();
    expect(screen.queryByTestId('payment-status-card')).toBeNull();
  });

  it('invalid purchase id shows safe error without polling', async () => {
    renderDetail('/dashboard/finance/purchases/abc');
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-error')).toBeTruthy();
    });
    expect(getCheckoutIntent).not.toHaveBeenCalled();
    expect(getCheckoutPaymentStatus).not.toHaveBeenCalled();
  });

  it('does not expose provider_payment_id', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'pending' }));
    getCheckoutPaymentStatus.mockResolvedValue(payment());
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('purchase-detail-basic')).toBeTruthy());
    expect(screen.queryByText(/secret-should-not-show/)).toBeNull();
    expect(screen.getByTestId('purchase-detail-provider').textContent).toBe('ЮKassa');
  });

  it('retry 502 shows safe message without raw status', async () => {
    getCheckoutIntent.mockResolvedValue(intent({ id: 42, status: 'pending' }));
    getCheckoutPaymentStatus.mockResolvedValue(
      payment({
        can_retry: true,
        is_final: true,
        normalized_status: 'failed',
        attempt_status: 'failed',
        intent_status: 'pending',
      })
    );
    startCheckoutPayment.mockRejectedValue(new ApiError('Bad Gateway 502', 502, 'provider_error'));

    renderDetail();
    await waitFor(() => expect(screen.getByTestId('payment-status-retry')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('payment-status-retry'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('purchase-detail-retry-error').textContent).not.toMatch(/502/);
    });
  });
});
