import { describe, it, expect } from 'vitest';
import { ApiError } from '@/api/client';
import { normalizePaymentStatus, safePaymentErrorMessage } from '@/api/checkoutPay';

describe('checkoutPay helpers', () => {
  it('normalizes payment status fields', () => {
    const s = normalizePaymentStatus({
      intent_id: 3,
      intent_status: 'awaiting_payment',
      amount: '99.00',
      currency: 'RUB',
      normalized_status: 'pending',
      is_final: false,
      can_retry: false,
      message: 'Ожидаем подтверждение оплаты',
      provider: 'yookassa',
    });
    expect(s.intent_id).toBe(3);
    expect(s.is_final).toBe(false);
    expect(s.message).toContain('подтверждение');
  });

  it('maps ApiError and network errors to safe Russian messages', () => {
    expect(
      safePaymentErrorMessage(
        new ApiError(
          'Платёжная система не ответила вовремя. Попробуйте позже.',
          504,
          'provider_timeout'
        )
      )
    ).toContain('вовремя');
    expect(safePaymentErrorMessage(new Error('Failed to fetch'))).toMatch(/связи|сервер|интернет/i);
    expect(safePaymentErrorMessage({})).toMatch(/попробуйте позже/i);
  });
});
