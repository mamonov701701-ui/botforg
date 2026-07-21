import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCheckoutIntent,
  getCheckoutIntent,
  normalizeCheckoutIntent,
  startCheckoutPayment,
} from '@/api/checkout';

vi.mock('@/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { get, post } from '@/api/client';

const sampleIntent = {
  id: 42,
  product_type: 'tariff',
  product_code: 'business',
  product_name: 'Бизнес',
  description: null,
  amount: '990.00',
  currency: 'RUB',
  status: 'pending',
  idempotency_key: 'idem-1',
  payment_provider: null,
  provider_payment_id: null,
  paid_at: null,
  fulfilled_at: null,
  failed_at: null,
  cancelled_at: null,
  refunded_at: null,
  fulfilled_subscription_id: null,
  fulfilled_addon_id: null,
  created_at: '2026-07-21T10:00:00Z',
  updated_at: '2026-07-21T10:00:00Z',
};

describe('checkout API client', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(post).mockReset();
  });

  it('createCheckoutIntent POSTs /me/checkout-intents for tariff', async () => {
    vi.mocked(post).mockResolvedValue(sampleIntent);
    const result = await createCheckoutIntent({
      product_type: 'tariff',
      code: 'business',
      idempotency_key: 'idem-tariff-1',
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/me/checkout-intents', {
      product_type: 'tariff',
      code: 'business',
      idempotency_key: 'idem-tariff-1',
    });
    const body = vi.mocked(post).mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('price');
    expect(body).not.toHaveProperty('price_month');
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('provider');
    expect(result.id).toBe(42);
    expect(result.product_code).toBe('business');
  });

  it('createCheckoutIntent supports addon product_type', async () => {
    vi.mocked(post).mockResolvedValue({
      ...sampleIntent,
      product_type: 'addon',
      product_code: 'msg_1000',
      product_name: '+1 000 сообщений',
      amount: '190.00',
    });
    await createCheckoutIntent({
      product_type: 'addon',
      code: 'msg_1000',
      idempotency_key: 'idem-addon-1',
    });
    expect(post).toHaveBeenCalledWith('/me/checkout-intents', {
      product_type: 'addon',
      code: 'msg_1000',
      idempotency_key: 'idem-addon-1',
    });
  });

  it('getCheckoutIntent GETs /me/checkout-intents/{id}', async () => {
    vi.mocked(get).mockResolvedValue(sampleIntent);
    const result = await getCheckoutIntent(42);
    expect(get).toHaveBeenCalledWith('/me/checkout-intents/42');
    expect(result.id).toBe(42);
    expect(result.amount).toBe('990.00');
  });

  it('startCheckoutPayment POSTs pay without inventing return_url', async () => {
    vi.mocked(post).mockResolvedValue({
      intent_id: 42,
      attempt_id: 7,
      provider: 'yookassa',
      provider_payment_id: '31ed63…',
      confirmation_url: 'https://yoomoney.ru/checkout/example',
      already_started: false,
    });
    const result = await startCheckoutPayment(42, {
      idempotency_key: 'pay-key-1',
    });
    expect(post).toHaveBeenCalledWith('/me/checkout-intents/42/pay', {
      idempotency_key: 'pay-key-1',
    });
    const body = vi.mocked(post).mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('return_url');
    expect(result.confirmation_url).toContain('yoomoney.ru');
    expect(result.already_started).toBe(false);
  });

  it('startCheckoutPayment passes return_url only when provided', async () => {
    vi.mocked(post).mockResolvedValue({
      intent_id: 42,
      attempt_id: 8,
      provider: 'yookassa',
      provider_payment_id: null,
      confirmation_url: null,
      already_started: true,
    });
    await startCheckoutPayment(42, {
      idempotency_key: 'pay-key-2',
      return_url: 'http://localhost:5173/checkout/return?intent=42',
    });
    expect(post).toHaveBeenCalledWith('/me/checkout-intents/42/pay', {
      idempotency_key: 'pay-key-2',
      return_url: 'http://localhost:5173/checkout/return?intent=42',
    });
  });

  it('normalizeCheckoutIntent accepts numeric amount from JSON', () => {
    const n = normalizeCheckoutIntent({
      ...sampleIntent,
      amount: 190,
    });
    expect(n.amount).toBe('190.00');
  });
});
