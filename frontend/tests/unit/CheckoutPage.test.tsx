import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CheckoutPage from '@/pages/CheckoutPage';
import type { PublicTariff } from '@/api/tariffs';
import { ApiError } from '@/api/client';

const mockTariffs: PublicTariff[] = [
  {
    code: 'start',
    name: 'Старт',
    description_ru: 'Для старта',
    price_month: 0,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 10,
    limits: { active_bots: 1, monthly_messages: 500 },
  },
  {
    code: 'business',
    name: 'Бизнес',
    description_ru: 'Для роста',
    price_month: 990,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 20,
    limits: { active_bots: 1, monthly_messages: 3000, team_members: 0 },
  },
  {
    code: 'corporate',
    name: 'Корпоративный',
    description_ru: null,
    price_month: null,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 50,
    limits: { export_reports: true },
  },
];

vi.mock('@/api/tariffs', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariffs')>('@/api/tariffs');
  return {
    ...actual,
    getPublicTariffs: vi.fn(),
  };
});

vi.mock('@/api/addons', async () => {
  const actual = await vi.importActual<typeof import('@/api/addons')>('@/api/addons');
  return {
    ...actual,
    getPublicAddons: vi.fn(),
  };
});

vi.mock('@/api/tariff', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariff')>('@/api/tariff');
  return {
    ...actual,
    getTariffSummary: vi.fn(),
  };
});

vi.mock('@/api/checkout', () => ({
  createCheckoutIntent: vi.fn(),
  startCheckoutPayment: vi.fn(),
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
    currentTariffAlreadyActive: 'current_tariff_already_active',
    addonNotAvailableForCurrentTariff: 'addon_not_available_for_current_tariff',
  },
}));

import { getPublicTariffs } from '@/api/tariffs';
import { getPublicAddons } from '@/api/addons';
import type { PublicAddon } from '@/api/addons';
import { getTariffSummary } from '@/api/tariff';
import type { TariffSummary } from '@/api/tariff';
import { createCheckoutIntent, startCheckoutPayment } from '@/api/checkout';

function summaryFor(code: string, opts?: { addon_purchase?: boolean }): TariffSummary {
  const addon_purchase =
    opts?.addon_purchase ??
    (code === 'business' || code === 'business_pro' || code === 'team' || code === 'corporate');
  return {
    current_plan: {
      code,
      slug: code,
      name: code,
      billing_period: null,
      subscription_status: 'active',
      source: 'subscription',
    },
    messages: { limit: 1000, used: 0, remaining: 1000 },
    active_bots: { limit: 1, used: 0, remaining: 1 },
    team_members: { limit: 0, used: 0, remaining: 0 },
    active_addons: [],
    active_gifts: [],
    warnings: [],
    flags: {
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
      export_reports: false,
      priority_support: false,
      addon_purchase,
    },
  };
}

const mockAddons: PublicAddon[] = [
  {
    code: 'msg_1k',
    name_ru: 'Пакет 1000 сообщений',
    description_ru: 'Дополнительный объём',
    type: 'messages',
    amount: 1000,
    price: '299.00',
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: 30,
    available_from_plan: null,
    max_per_period: null,
    sort_order: 10,
  },
  {
    code: 'free_pack',
    name_ru: 'Бесплатный пакет',
    description_ru: null,
    type: 'messages',
    amount: 10,
    price: 0,
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: 30,
    available_from_plan: null,
    max_per_period: null,
    sort_order: 20,
  },
];

function renderCheckout(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/pricing" element={<div data-testid="pricing-route">pricing</div>} />
        <Route path="/dashboard/finance" element={<div data-testid="finance-route">finance</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const intentFixture = {
  id: 77,
  product_type: 'tariff' as const,
  product_code: 'business',
  product_name: 'Бизнес',
  description: null,
  amount: '990.00',
  currency: 'RUB',
  status: 'pending',
  idempotency_key: 'x',
  payment_provider: null,
  provider_payment_id: null,
  paid_at: null,
  fulfilled_at: null,
  failed_at: null,
  cancelled_at: null,
  refunded_at: null,
  fulfilled_subscription_id: null,
  fulfilled_addon_id: null,
  created_at: '',
  updated_at: '',
};

describe('CheckoutPage', () => {
  const assignSpy = vi.fn();

  beforeEach(() => {
    vi.mocked(getPublicTariffs).mockReset();
    vi.mocked(getPublicAddons).mockReset();
    vi.mocked(getTariffSummary).mockReset();
    vi.mocked(createCheckoutIntent).mockReset();
    vi.mocked(startCheckoutPayment).mockReset();
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
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

  it('refresh / load alone does not create CheckoutIntent', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderCheckout('/checkout?plan=business');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-summary')).toBeTruthy();
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(startCheckoutPayment).not.toHaveBeenCalled();
  });

  it('current tariff from summary: no create/pay, shows Ваш тариф and dashboard CTA', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderCheckout('/checkout?plan=business');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-already-current')).toBeTruthy();
    });
    expect(screen.getByTestId('checkout-current-badge').textContent).toMatch(/Ваш тариф/i);
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(screen.getByTestId('checkout-to-dashboard')).toBeTruthy();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(startCheckoutPayment).not.toHaveBeenCalled();
  });

  it('stale plan_code=pro does not block business when summary is business', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderCheckout('/checkout?plan=business');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-already-current')).toBeTruthy();
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('does not use missing summary as current plan (fail-closed: no pay)', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockRejectedValue(new ApiError('fail', 500));
    renderCheckout('/checkout?plan=business');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-summary-error')).toBeTruthy();
    });
    expect(screen.getByTestId('checkout-summary-error').textContent).toMatch(
      /Не удалось проверить текущий тариф/i
    );
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(screen.queryByTestId('checkout-already-current')).toBeNull();
    expect(screen.queryByTestId('checkout-current-badge')).toBeNull();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('current_tariff_already_active shows RU message without raw 409', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(createCheckoutIntent).mockRejectedValue(
      new ApiError('conflict', 409, 'current_tariff_already_active')
    );
    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-action-error').textContent).toBe(
        'Этот тариф уже активен'
      );
    });
    expect(screen.getByTestId('checkout-action-error').textContent).not.toMatch(/409/);
  });

  it('addon checkout fail-closes when tariff summary fails', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockRejectedValue(new ApiError('fail', 500));
    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-summary-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('addon checkout shows 30-day validity and allows pay for business', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-addon-validity').textContent).toMatch(/30 дней/);
    });
    expect(screen.getByTestId('checkout-addon-validity-note').textContent).toMatch(
      /успешной активации/
    );
    expect(screen.getByTestId('checkout-continue')).toBeTruthy();
  });

  it('addon checkout blocked for start with choose-tariff CTA', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-addon-plan-gate')).toBeTruthy();
    });
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(screen.getByTestId('checkout-addon-choose-tariff').getAttribute('href')).toBe(
      '/pricing?tab=tariffs'
    );
  });

  it('addon_not_available_for_current_tariff shows RU message without raw code', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    vi.mocked(createCheckoutIntent).mockRejectedValue(
      new ApiError('x', 403, 'addon_not_available_for_current_tariff')
    );
    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-action-error').textContent).toMatch(/Бизнес/);
    });
    expect(screen.getByTestId('checkout-action-error').textContent).not.toMatch(
      /addon_not_available|403/
    );
  });

  it('while summary loads: no current badge and no pay CTA', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockReturnValue(new Promise(() => {}));
    renderCheckout('/checkout?plan=business');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-summary')).toBeTruthy();
    });
    expect(screen.queryByTestId('checkout-current-badge')).toBeNull();
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('free tariff: no create/pay', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderCheckout('/checkout?plan=start');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-not-payable').textContent).toMatch(/бесплатн/i);
    });
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(startCheckoutPayment).not.toHaveBeenCalled();
  });

  it('price_month=null: no create/pay, shows on-request message', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderCheckout('/checkout?plan=corporate');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-plan-price').textContent).toBe('По запросу');
    });
    expect(screen.getByTestId('checkout-not-payable').textContent).toMatch(
      /онлайн-покупка недоступна/i
    );
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('missing tariff code: no checkout create, back to pricing', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderCheckout('/checkout?plan=deleted_plan');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-plan-not-found').textContent).toMatch(/недоступен/i);
    });
    expect(screen.queryByTestId('checkout-continue')).toBeNull();
    expect(screen.getByTestId('checkout-back-to-pricing')).toBeTruthy();
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('back CTA links to /pricing without creating intent', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-back-to-pricing')).toBeTruthy());
    const back = screen.getByTestId('checkout-back-to-pricing') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/pricing');
    fireEvent.click(back);
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('double click does not create second intent/pay', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    let resolveCreate!: (v: unknown) => void;
    vi.mocked(createCheckoutIntent).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        }) as Promise<typeof intentFixture>
    );
    vi.mocked(startCheckoutPayment).mockResolvedValue({
      intent_id: 77,
      attempt_id: 9,
      provider: 'yookassa',
      provider_payment_id: 'pay-1',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc',
      already_started: false,
    });

    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    const btn = screen.getByTestId('checkout-continue');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(createCheckoutIntent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(intentFixture);
    });
    await waitFor(() => expect(startCheckoutPayment).toHaveBeenCalledTimes(1));
  });

  it('legal_launch_not_ready shows RU message without revision ids', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(createCheckoutIntent).mockRejectedValue(
      new ApiError('legal rev=99', 409, 'legal_launch_not_ready')
    );
    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-action-error').textContent).toMatch(/документы|условия/i);
    });
    expect(screen.getByTestId('checkout-action-error').textContent).not.toMatch(/rev=99|revision/i);
  });

  it('missing provider connection shows temporary unavailable message', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(createCheckoutIntent).mockRejectedValue(
      new ApiError('no_default_connection', 409, 'no_default_connection')
    );
    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-action-error').textContent).toBe(
        'Оплата временно недоступна. Попробуйте позже.'
      );
    });
    expect(screen.getByTestId('checkout-action-error').textContent).not.toMatch(
      /yookassa|connection|admin/i
    );
  });

  it('provider 502/503/504 are not shown as raw codes', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(createCheckoutIntent).mockRejectedValue(new ApiError('502 Bad Gateway', 502));
    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-action-error').textContent).toMatch(
        /временно недоступна|попробуйте позже/i
      );
    });
    expect(screen.getByTestId('checkout-action-error').textContent).not.toMatch(/502|Bad Gateway/i);
  });

  it('on continue creates intent, starts pay, redirects to confirmation_url', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(createCheckoutIntent).mockResolvedValue(intentFixture);
    vi.mocked(startCheckoutPayment).mockResolvedValue({
      intent_id: 77,
      attempt_id: 9,
      provider: 'yookassa',
      provider_payment_id: 'pay-1',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc',
      already_started: false,
    });

    renderCheckout('/checkout?plan=business');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    fireEvent.click(screen.getByTestId('checkout-continue'));

    await waitFor(() => expect(createCheckoutIntent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(startCheckoutPayment).toHaveBeenCalledTimes(1));
    expect(assignSpy).toHaveBeenCalledWith(
      'https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc'
    );
  });

  it('addon checkout reads URL and creates addon intent without price', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    vi.mocked(createCheckoutIntent).mockResolvedValue({
      ...intentFixture,
      id: 91,
      product_type: 'addon',
      product_code: 'msg_1k',
      product_name: 'Пакет 1000 сообщений',
      amount: '299.00',
    });
    vi.mocked(startCheckoutPayment).mockResolvedValue({
      intent_id: 91,
      attempt_id: 3,
      provider: 'yookassa',
      provider_payment_id: 'pay-a',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=addon',
      already_started: false,
    });

    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-addon-summary')).toBeTruthy();
    });
    expect(screen.getByTestId('checkout-addon-name').textContent).toMatch(/1000/);
    expect(createCheckoutIntent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('checkout-continue'));
    await waitFor(() => expect(createCheckoutIntent).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createCheckoutIntent).mock.calls[0][0];
    expect(body.product_type).toBe('addon');
    expect(body.code).toBe('msg_1k');
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('price');
    await waitFor(() => expect(startCheckoutPayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startCheckoutPayment).mock.calls[0][0]).toBe(91);
    expect(assignSpy).toHaveBeenCalledWith(
      'https://yoomoney.ru/checkout/payments/v2/contract?orderId=addon'
    );
  });

  it('addon not found does not create intent', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    renderCheckout('/checkout?addon=missing_pack');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-addon-not-found').textContent).toMatch(/недоступно/i);
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(screen.getByTestId('checkout-back-to-finance')).toBeTruthy();
  });

  it('plan+addon conflict does not create intent', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    renderCheckout('/checkout?plan=business&addon=msg_1k');
    await waitFor(() => {
      expect(screen.getByTestId('checkout-param-conflict')).toBeTruthy();
    });
    expect(createCheckoutIntent).not.toHaveBeenCalled();
    expect(getPublicTariffs).not.toHaveBeenCalled();
    expect(getPublicAddons).not.toHaveBeenCalled();
  });

  it('addon refresh does not create intent; double click is locked', async () => {
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    let resolveCreate!: (v: unknown) => void;
    vi.mocked(createCheckoutIntent).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        }) as ReturnType<typeof createCheckoutIntent>
    );
    vi.mocked(startCheckoutPayment).mockResolvedValue({
      intent_id: 91,
      attempt_id: 3,
      provider: 'yookassa',
      provider_payment_id: 'pay-a',
      confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=addon',
      already_started: false,
    });

    renderCheckout('/checkout?addon=msg_1k');
    await waitFor(() => expect(screen.getByTestId('checkout-continue')).toBeTruthy());
    expect(createCheckoutIntent).not.toHaveBeenCalled();

    const btn = screen.getByTestId('checkout-continue');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(createCheckoutIntent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({
        ...intentFixture,
        id: 91,
        product_type: 'addon',
        product_code: 'msg_1k',
      });
    });
    await waitFor(() => expect(startCheckoutPayment).toHaveBeenCalledTimes(1));
  });
});
