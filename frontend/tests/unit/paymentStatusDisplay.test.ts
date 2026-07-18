import { describe, it, expect } from 'vitest';
import type { PaymentStatus } from '@/api/checkoutPay';
import {
  canShowCancelButton,
  canShowRetryPayButton,
  paymentUiTitle,
  resolvePaymentUiState,
} from '@/features/checkout/paymentStatusDisplay';

function status(over: Partial<PaymentStatus> = {}): PaymentStatus {
  return {
    intent_id: 1,
    intent_status: 'pending',
    amount: '199.00',
    currency: 'RUB',
    normalized_status: 'pending',
    is_final: false,
    can_retry: true,
    message: 'Ожидает оплаты',
    ...over,
  };
}

describe('paymentStatusDisplay', () => {
  it('maps Russian titles for all UI states', () => {
    expect(paymentUiTitle('awaiting_payment')).toBe('Ожидает оплаты');
    expect(paymentUiTitle('processing')).toBe('Подтверждение обрабатывается');
    expect(paymentUiTitle('paid')).toBe('Оплачено и активировано');
    expect(paymentUiTitle('cancelled')).toBe('Платёж отменён');
    expect(paymentUiTitle('failed')).toBe('Ошибка оплаты');
    expect(paymentUiTitle('retryable')).toBe('Можно повторить оплату');
  });

  it('resolves awaiting / processing / paid / cancelled / failed / retryable', () => {
    expect(resolvePaymentUiState(status())).toBe('awaiting_payment');
    expect(
      resolvePaymentUiState(
        status({
          intent_status: 'awaiting_payment',
          attempt_status: 'pending',
          can_retry: false,
          message: 'Ожидаем подтверждение оплаты',
        })
      )
    ).toBe('processing');
    expect(
      resolvePaymentUiState(
        status({
          intent_status: 'fulfilled',
          normalized_status: 'succeeded',
          is_final: true,
          can_retry: false,
        })
      )
    ).toBe('paid');
    expect(
      resolvePaymentUiState(
        status({
          intent_status: 'cancelled',
          normalized_status: 'cancelled',
          is_final: true,
          can_retry: false,
        })
      )
    ).toBe('cancelled');
    expect(
      resolvePaymentUiState(
        status({
          intent_status: 'failed',
          normalized_status: 'failed',
          is_final: true,
          can_retry: false,
        })
      )
    ).toBe('failed');
    expect(
      resolvePaymentUiState(
        status({
          intent_status: 'awaiting_payment',
          attempt_status: 'failed',
          normalized_status: 'failed',
          is_final: true,
          can_retry: true,
        })
      )
    ).toBe('retryable');
  });

  it('shows cancel only for pending/awaiting_payment', () => {
    expect(canShowCancelButton(status({ intent_status: 'pending' }))).toBe(true);
    expect(
      canShowCancelButton(status({ intent_status: 'awaiting_payment', can_retry: false }))
    ).toBe(true);
    expect(
      canShowCancelButton(status({ intent_status: 'fulfilled', is_final: true, can_retry: false }))
    ).toBe(false);
    expect(
      canShowCancelButton(status({ intent_status: 'cancelled', is_final: true, can_retry: false }))
    ).toBe(false);
  });

  it('retry button follows can_retry', () => {
    expect(canShowRetryPayButton(status({ can_retry: true }))).toBe(true);
    expect(canShowRetryPayButton(status({ can_retry: false }))).toBe(false);
  });
});
