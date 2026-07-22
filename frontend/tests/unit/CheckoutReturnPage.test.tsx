import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PaymentStatus } from '@/api/checkoutPay';

const {
  getCheckoutPaymentStatus,
  cancelCheckoutPayment,
  startCheckoutPayment,
  createCheckoutIntent,
  toast,
} = vi.hoisted(() => ({
  getCheckoutPaymentStatus: vi.fn(),
  cancelCheckoutPayment: vi.fn(),
  startCheckoutPayment: vi.fn(),
  createCheckoutIntent: vi.fn(),
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

vi.mock('@/api/checkout', () => ({
  startCheckoutPayment,
  createCheckoutIntent,
  CHECKOUT_ERROR_CODES: {
    productUnavailable: 'product_unavailable',
    productUnpriced: 'product_unpriced',
    legalLaunchNotReady: 'legal_launch_not_ready',
    intentNotFound: 'intent_not_found',
    intentNotPayable: 'intent_not_payable',
    intentAlreadyFulfilled: 'intent_already_fulfilled',
    intentAlreadyPaid: 'intent_already_paid',
    noDefaultConnection: 'no_default_connection',
    defaultConnectionNotReady: 'default_connection_not_ready',
    providerUnavailable: 'provider_unavailable',
    providerTimeout: 'provider_timeout',
    providerError: 'provider_error',
    providerMisconfigured: 'provider_misconfigured',
    idempotencyRequired: 'idempotency_required',
    invalidProductType: 'invalid_product_type',
  },
}));

import CheckoutReturnPage from '@/pages/CheckoutReturnPage';

function pendingStatus(overrides: Partial<PaymentStatus> = {}): PaymentStatus {
  return {
    intent_id: 42,
    intent_status: 'awaiting_payment',
    amount: '990.00',
    currency: 'RUB',
    attempt_status: 'pending',
    normalized_status: 'pending',
    is_final: false,
    can_retry: false,
    message: 'Ожидаем подтверждение оплаты',
    ...overrides,
  };
}

function paidStatus(): PaymentStatus {
  return {
    intent_id: 42,
    intent_status: 'fulfilled',
    amount: '990.00',
    currency: 'RUB',
    attempt_status: 'succeeded',
    normalized_status: 'succeeded',
    is_final: true,
    can_retry: false,
    message: 'Оплата прошла успешно',
  };
}

function cancelledFinal(): PaymentStatus {
  return {
    intent_id: 42,
    intent_status: 'cancelled',
    amount: '990.00',
    currency: 'RUB',
    attempt_status: 'cancelled',
    normalized_status: 'cancelled',
    is_final: true,
    can_retry: false,
    message: 'Оплата отменена',
  };
}

function retryableFailed(): PaymentStatus {
  return {
    intent_id: 42,
    intent_status: 'awaiting_payment',
    amount: '990.00',
    currency: 'RUB',
    attempt_status: 'failed',
    normalized_status: 'failed',
    is_final: true,
    can_retry: true,
    message: 'Не удалось завершить оплату. Можно начать оплату заново.',
  };
}

function renderReturn(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/checkout/return" element={<CheckoutReturnPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CheckoutReturnPage', () => {
  const assignSpy = vi.fn();

  beforeEach(() => {
    getCheckoutPaymentStatus.mockReset();
    cancelCheckoutPayment.mockReset();
    startCheckoutPayment.mockReset();
    createCheckoutIntent.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    assignSpy.mockReset();
    vi.stubGlobal('location', {
      ...window.location,
      origin: 'http://localhost:5173',
      assign: assignSpy,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('missing intent shows error and does not start polling', async () => {
    renderReturn('/checkout/return');
    expect(screen.getByTestId('checkout-return-missing-intent')).toBeTruthy();
    expect(screen.queryByTestId('payment-status-card')).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getCheckoutPaymentStatus).not.toHaveBeenCalled();
  });

  it('invalid intent does not start polling', async () => {
    renderReturn('/checkout/return?intent=abc');
    expect(screen.getByTestId('checkout-return-missing-intent')).toBeTruthy();
    expect(getCheckoutPaymentStatus).not.toHaveBeenCalled();
  });

  it('pending shows waiting state and keeps polling until final', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(pendingStatus());
    renderReturn('/checkout/return?intent=42');

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title').textContent).toMatch(
        /обрабатывается|Ожидает/i
      );
    });
    expect(screen.getByText(/обновлять вручную не нужно/i)).toBeTruthy();
    expect(getCheckoutPaymentStatus).toHaveBeenCalledWith(42);
    expect(screen.queryByText(/yookassa/i)).toBeNull();
  });

  it('success shows paid state and finance/pricing actions', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(paidStatus());
    renderReturn('/checkout/return?intent=42');

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title').textContent).toMatch(
        /Оплачено|активировано/i
      );
    });
    expect(screen.getByRole('heading', { name: /Оплата прошла успешно/i })).toBeTruthy();
    expect(screen.getByTestId('checkout-return-to-finance')).toBeTruthy();
    expect(screen.getByTestId('checkout-return-to-pricing').textContent).toBe('Тарифы');
    expect(screen.getByTestId('checkout-return-to-finance').getAttribute('href')).toBe(
      '/dashboard/finance'
    );
    expect(screen.getByTestId('checkout-return-to-pricing').getAttribute('href')).toBe('/pricing');
  });

  it('terminal cancelled stops further polling fetches after final', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getCheckoutPaymentStatus.mockResolvedValue(cancelledFinal());
    renderReturn('/checkout/return?intent=42');

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title').textContent).toMatch(/отменён/i);
    });
    const callsAfterFinal = getCheckoutPaymentStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(getCheckoutPaymentStatus.mock.calls.length).toBe(callsAfterFinal);
    expect(screen.getByTestId('checkout-return-to-pricing')).toBeTruthy();
    vi.useRealTimers();
  });

  it('cancel button only when backend allows and cancel updates status', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(pendingStatus({ intent_status: 'pending' }));
    cancelCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      intent_status: 'cancelled',
      already_cancelled: false,
      message: 'Оплата отменена',
    });

    renderReturn('/checkout/return?intent=42');
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeTruthy();
    });

    getCheckoutPaymentStatus.mockResolvedValue(cancelledFinal());
    fireEvent.click(screen.getByTestId('payment-status-cancel'));

    await waitFor(() => {
      expect(cancelCheckoutPayment).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title').textContent).toMatch(/отменён/i);
    });
    expect(screen.queryByTestId('payment-status-cancel')).toBeNull();
  });

  it('hides cancel when not allowed (final failed without pending intent)', async () => {
    getCheckoutPaymentStatus.mockResolvedValue({
      intent_id: 42,
      intent_status: 'failed',
      amount: '990.00',
      currency: 'RUB',
      attempt_status: 'failed',
      normalized_status: 'failed',
      is_final: true,
      can_retry: false,
      message: 'Платёж не прошёл',
    });
    renderReturn('/checkout/return?intent=42');
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title')).toBeTruthy();
    });
    expect(screen.queryByTestId('payment-status-cancel')).toBeNull();
  });

  it('can_retry shows retry; retry pays same intent with new return_url and redirects', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(retryableFailed());
    startCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      attempt_id: 9,
      provider: 'yookassa',
      provider_payment_id: 'pay-9',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=retry',
      already_started: false,
    });

    renderReturn('/checkout/return?intent=42');
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-retry')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('payment-status-retry'));
    fireEvent.click(screen.getByTestId('payment-status-retry'));

    await waitFor(() => {
      expect(startCheckoutPayment).toHaveBeenCalledTimes(1);
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();

    const [payId, payload] = startCheckoutPayment.mock.calls[0];
    expect(payId).toBe(42);
    expect(payload.idempotency_key).toBeTruthy();
    expect(payload.return_url).toBe('http://localhost:5173/checkout/return?intent=42');
    expect(assignSpy).toHaveBeenCalledWith(
      'https://yoomoney.ru/checkout/payments/v2/contract?orderId=retry'
    );
  });

  it('retry without confirmation_url shows controlled error and does not create intent', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(retryableFailed());
    startCheckoutPayment.mockResolvedValue({
      intent_id: 42,
      attempt_id: 10,
      provider: 'yookassa',
      provider_payment_id: 'pay-10',
      confirmation_url: null,
      already_started: false,
    });

    renderReturn('/checkout/return?intent=42');
    await waitFor(() => expect(screen.getByTestId('payment-status-retry')).toBeTruthy());
    fireEvent.click(screen.getByTestId('payment-status-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-return-retry-error').textContent).toMatch(/ссылк/i);
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
