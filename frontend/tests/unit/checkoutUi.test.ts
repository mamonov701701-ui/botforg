import { describe, it, expect } from 'vitest';
import {
  buildCheckoutReturnUrl,
  canStartPaidCheckout,
  checkoutErrorMessage,
} from '@/features/checkout/checkoutUi';
import { ApiError } from '@/api/client';

describe('checkoutUi helpers', () => {
  it('builds return url with intent id', () => {
    expect(buildCheckoutReturnUrl(15)).toMatch(/\/checkout\/return\?intent=15$/);
  });

  it('gates free and null prices', () => {
    expect(canStartPaidCheckout(0).ok).toBe(false);
    expect(canStartPaidCheckout(0).reason).toMatch(/бесплатн/i);
    expect(canStartPaidCheckout(null).ok).toBe(false);
    expect(canStartPaidCheckout(null).reason).toMatch(/По запросу|онлайн-покупка/i);
    expect(canStartPaidCheckout(990).ok).toBe(true);
  });

  it('maps legal_launch_not_ready to documents message', () => {
    expect(checkoutErrorMessage(new ApiError('x', 409, 'legal_launch_not_ready'))).toMatch(
      /документы|условия/i
    );
  });

  it('maps missing provider to temporary unavailable', () => {
    expect(checkoutErrorMessage(new ApiError('x', 409, 'no_default_connection'))).toBe(
      'Оплата временно недоступна. Попробуйте позже.'
    );
  });

  it('maps current_tariff_already_active to RU message', () => {
    expect(
      checkoutErrorMessage(new ApiError('raw 409', 409, 'current_tariff_already_active'))
    ).toBe('Этот тариф уже активен');
  });

  it('maps addon_not_available_for_current_tariff to RU message', () => {
    expect(
      checkoutErrorMessage(new ApiError('x', 403, 'addon_not_available_for_current_tariff'))
    ).toMatch(/Бизнес/);
  });

  it('hides raw 502/503/504 from users', () => {
    expect(checkoutErrorMessage(new ApiError('502 Bad Gateway', 502))).not.toMatch(/502/);
    expect(checkoutErrorMessage(new ApiError('Service Unavailable', 503))).toMatch(
      /временно недоступна|попробуйте позже/i
    );
    expect(checkoutErrorMessage(new ApiError('Gateway Timeout', 504))).not.toMatch(/504/);
  });
});
