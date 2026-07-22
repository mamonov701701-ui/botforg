import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { PaymentStatus } from '@/api/checkoutPay';

const { toast, getCheckoutPaymentStatus, cancelCheckoutPayment } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  getCheckoutPaymentStatus: vi.fn(),
  cancelCheckoutPayment: vi.fn(),
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

import PaymentStatusCard from '@/features/checkout/PaymentStatusCard';

function awaiting(): PaymentStatus {
  return {
    intent_id: 11,
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

function cancelled(): PaymentStatus {
  return {
    intent_id: 11,
    intent_status: 'cancelled',
    amount: '199.00',
    currency: 'RUB',
    attempt_status: 'cancelled',
    normalized_status: 'cancelled',
    is_final: true,
    can_retry: false,
    message: 'Оплата отменена. Для повторной оплаты создайте новый заказ.',
  };
}

function paid(): PaymentStatus {
  return {
    intent_id: 11,
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

describe('PaymentStatusCard', () => {
  beforeEach(() => {
    getCheckoutPaymentStatus.mockReset();
    cancelCheckoutPayment.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('shows Russian processing state and cancel when allowed', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(awaiting());
    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title')).toHaveTextContent(
        'Подтверждение обрабатывается'
      );
    });
    expect(screen.getByTestId('payment-status-description')).toHaveTextContent(
      'Ожидаем подтверждение оплаты'
    );
    expect(screen.getByTestId('payment-status-cancel')).toBeInTheDocument();
    expect(screen.queryByText(/yookassa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/webhook/i)).not.toBeInTheDocument();
  });

  it('cancels once and blocks double click', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(awaiting());
    let resolveCancel!: (v: unknown) => void;
    cancelCheckoutPayment.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveCancel = resolve;
        })
    );

    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeInTheDocument();
    });

    const btn = screen.getByTestId('payment-status-cancel');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(cancelCheckoutPayment).toHaveBeenCalledTimes(1);

    getCheckoutPaymentStatus.mockResolvedValue(cancelled());
    await act(async () => {
      resolveCancel({
        intent_id: 11,
        intent_status: 'cancelled',
        already_cancelled: false,
        payment_already_succeeded: false,
        message: 'Оплата отменена',
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('after cancel always refreshes status', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(awaiting());
    cancelCheckoutPayment.mockResolvedValue({
      intent_id: 11,
      intent_status: 'cancelled',
      already_cancelled: false,
      payment_already_succeeded: false,
      message: 'Оплата отменена',
    });
    getCheckoutPaymentStatus.mockResolvedValueOnce(awaiting()).mockResolvedValueOnce(cancelled());

    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeInTheDocument();
    });
    const callsBefore = getCheckoutPaymentStatus.mock.calls.length;
    fireEvent.click(screen.getByTestId('payment-status-cancel'));
    await waitFor(() => {
      expect(cancelCheckoutPayment).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getCheckoutPaymentStatus.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('after reconcile succeeded: hides cancel and shows paid state', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(awaiting());
    cancelCheckoutPayment.mockResolvedValue({
      intent_id: 11,
      intent_status: 'fulfilled',
      attempt_status: 'succeeded',
      already_cancelled: false,
      payment_already_succeeded: true,
      message: 'Оплата уже подтверждена',
    });

    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeInTheDocument();
    });

    getCheckoutPaymentStatus.mockResolvedValue(paid());
    fireEvent.click(screen.getByTestId('payment-status-cancel'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Оплата уже подтверждена');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('payment-status-cancel')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-status-title').textContent).toMatch(
      /оплач|успеш|подтвержд/i
    );
  });

  it('does not show raw 502/provider text on cancel error', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(awaiting());
    const { ApiError } = await import('@/api/client');
    cancelCheckoutPayment.mockRejectedValue(
      new ApiError('YooKassa 502 Bad Gateway provider_http_error', 502, 'provider_error')
    );

    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-cancel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('payment-status-cancel'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    const msg = String(toast.error.mock.calls[0][0] || '');
    expect(msg).not.toMatch(/yookassa|502|Bad Gateway|provider_http/i);
    expect(msg.toLowerCase()).toMatch(/недоступ|попробуйте|операц/i);
  });

  it('hides cancel for final cancelled status', async () => {
    getCheckoutPaymentStatus.mockResolvedValue(cancelled());
    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title')).toHaveTextContent('Платёж отменён');
    });
    expect(screen.queryByTestId('payment-status-cancel')).not.toBeInTheDocument();
  });

  it('shows retry CTA when can_retry and onRetryPay provided', async () => {
    getCheckoutPaymentStatus.mockResolvedValue({
      intent_id: 11,
      intent_status: 'awaiting_payment',
      amount: '199.00',
      currency: 'RUB',
      attempt_status: 'failed',
      normalized_status: 'failed',
      is_final: true,
      can_retry: true,
      message: 'Не удалось завершить оплату через платёжную систему. Можно начать оплату заново.',
    });
    const onRetryPay = vi.fn();
    render(<PaymentStatusCard intentId={11} pollIntervalMs={60000} onRetryPay={onRetryPay} />);
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-title')).toHaveTextContent(
        'Можно повторить оплату'
      );
    });
    fireEvent.click(screen.getByTestId('payment-status-retry'));
    expect(onRetryPay).toHaveBeenCalledTimes(1);
  });
});
