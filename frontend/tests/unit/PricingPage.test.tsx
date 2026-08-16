import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import Pricing from '@/pages/Pricing';
import type { PublicTariff } from '@/api/tariffs';
import type { PublicAddon } from '@/api/addons';
import type { TariffSummary } from '@/api/tariff';
import { ApiError } from '@/api/client';

const mockTariffs: PublicTariff[] = [
  {
    code: 'free',
    name: 'Free',
    description_ru: null,
    price_month: 0,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 0,
    limits: { max_bots: 1, can_publish: false },
  },
  {
    code: 'pro',
    name: 'Pro',
    description_ru: null,
    price_month: 490,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 5,
    limits: { max_bots: 5, can_publish: true },
  },
  {
    code: 'developer',
    name: 'Developer',
    description_ru: null,
    price_month: null,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 6,
    limits: { max_bots: 10, can_publish_templates: true },
  },
  {
    code: 'start',
    name: 'Старт',
    description_ru: 'Для старта',
    price_month: 0,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 10,
    limits: {
      active_bots: 1,
      monthly_messages: 500,
      team_members: 0,
      analytics_history_days: 7,
      export_reports: false,
      priority_support: false,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
  },
  {
    code: 'business',
    name: 'Бизнес',
    description_ru: null,
    price_month: 990,
    currency: 'RUB',
    is_recommended: false,
    sort_order: 20,
    limits: {
      active_bots: 1,
      monthly_messages: 3000,
      team_members: 0,
      analytics_history_days: 30,
      export_reports: false,
      priority_support: false,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
  },
  {
    code: 'business_pro',
    name: 'Бизнес PRO',
    description_ru: null,
    price_month: 1990,
    currency: 'RUB',
    is_recommended: true,
    sort_order: 30,
    limits: {
      active_bots: 3,
      monthly_messages: 10000,
      team_members: 3,
      analytics_history_days: 90,
      export_reports: true,
      priority_support: true,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
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

const mockAddons: PublicAddon[] = [
  {
    code: 'msg_1000',
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
    code: 'bot_extra',
    name_ru: '+1 активный бот',
    description_ru: null,
    type: 'active_bot',
    amount: 1,
    price: '199.00',
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: 30,
    available_from_plan: null,
    max_per_period: null,
    sort_order: 20,
  },
  {
    code: 'team_extra',
    name_ru: '+1 участник команды',
    description_ru: null,
    type: 'team_member',
    amount: 1,
    price: '149.00',
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: 30,
    available_from_plan: null,
    max_per_period: null,
    sort_order: 30,
  },
];

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
    quoteCustomAddon: vi.fn(),
    getCustomMessagesConfig: vi.fn(),
  };
});

vi.mock('@/api/tariff', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariff')>('@/api/tariff');
  return {
    ...actual,
    getTariffSummary: vi.fn(),
  };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

import { getPublicTariffs } from '@/api/tariffs';
import { getPublicAddons, quoteCustomAddon, getCustomMessagesConfig } from '@/api/addons';
import { getTariffSummary } from '@/api/tariff';
import { useAuthStore } from '@/stores/authStore';

function LocationProbe() {
  const [params] = useSearchParams();
  return (
    <div>
      <div data-testid="loc-plan">{params.get('plan') || ''}</div>
      <div data-testid="loc-addon">{params.get('addon') || ''}</div>
      <div data-testid="loc-tab">{params.get('tab') || ''}</div>
      <div data-testid="loc-next">{params.get('next') || ''}</div>
    </div>
  );
}

function renderPricing(initial = '/pricing', user: { plan_code?: string } | null = null) {
  vi.mocked(useAuthStore).mockReturnValue({
    user,
    authStatus: user ? 'authenticated' : 'guest',
    loading: false,
  } as ReturnType<typeof useAuthStore>);

  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/pricing"
          element={
            <>
              <Pricing />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/checkout"
          element={
            <div data-testid="checkout-route">
              checkout
              <LocationProbe />
            </div>
          }
        />
        <Route
          path="/login"
          element={
            <div data-testid="login-page">
              login
              <LocationProbe />
            </div>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Pricing page', () => {
  beforeEach(() => {
    vi.mocked(getPublicTariffs).mockReset();
    vi.mocked(getPublicAddons).mockReset();
    vi.mocked(quoteCustomAddon).mockReset();
    vi.mocked(getCustomMessagesConfig).mockReset();
    vi.mocked(getTariffSummary).mockReset();
    vi.mocked(useAuthStore).mockReset();
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getCustomMessagesConfig).mockResolvedValue({
      min_quantity: 1,
      max_quantity: 1_000_000,
      validity_days: 30,
      sales_enabled: true,
      currency: 'RUB',
    });
    vi.mocked(quoteCustomAddon).mockResolvedValue({
      resource_type: 'messages',
      quantity: 1000,
      currency: 'RUB',
      total: '220.00',
      average_unit_price: '0.22',
      validity_days: 30,
      checkout_code: 'custom_messages',
      product_name: 'Настроить пакет',
      bands: [],
      min_quantity: 1,
      max_quantity: 1_000_000,
    });
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
  });

  it('renders tariffs from API including legacy free/pro/developer', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-list')).toBeTruthy();
    });
    expect(screen.getByText('Старт')).toBeTruthy();
    expect(screen.getByText('Бизнес PRO')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Developer')).toBeTruthy();
  });

  it('does not fall back to static tariffs on API error', async () => {
    vi.mocked(getPublicTariffs).mockRejectedValue(new ApiError('fail', 500));
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('pricing-list')).toBeNull();
  });

  it('shows compact pricing features, not full long feature list', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-features-business_pro')).toBeTruthy();
    });
    const features = screen.getByTestId('pricing-features-business_pro');
    expect(features.textContent).toMatch(/Активные боты/);
    expect(features.textContent).toMatch(/Сообщений в месяц/);
    expect(features.textContent).toMatch(/Участников команды/);
    expect(features.textContent).toMatch(/Участников команды:\s*3/);
    expect(features.textContent).toMatch(/История аналитики/);
    // extras capped; full publish flags must not all dump as long list
    const liCount = features.querySelectorAll('li').length;
    expect(liCount).toBeLessThanOrEqual(7);
    expect(features.textContent).not.toMatch(/Публикация шаблонов: Да/);
  });

  it('shows Бесплатно and По запросу for price edge cases', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-price-start').textContent).toBe('Бесплатно');
    });
    expect(screen.getByTestId('pricing-price-corporate').textContent).toBe('По запросу');
  });

  it('shows recommended badge when is_recommended=true', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-recommended-business_pro')).toBeTruthy();
    });
    expect(screen.getByTestId('pricing-recommended-business_pro').textContent).toBe('Рекомендуем');
  });

  it('authenticated select navigates to /checkout?plan=', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
    renderPricing('/pricing', { plan_code: 'start' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-cta-business_pro')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pricing-cta-business_pro'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-route')).toBeTruthy();
    });
    expect(screen.getByTestId('loc-plan').textContent).toBe('business_pro');
  });

  it('guest next URL preserves selected plan for checkout', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-cta-business_pro')).toBeTruthy();
    });
    const cta = screen.getByTestId('pricing-cta-business_pro') as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe(
      `/login?next=${encodeURIComponent('/checkout?plan=business_pro')}`
    );
  });

  it('uses summary current_plan over stale users.plan_code', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderPricing('/pricing', { plan_code: 'pro' });

    await waitFor(() => {
      expect(screen.getByTestId('pricing-cta-business').textContent).toMatch(/Ваш тариф/i);
    });
    expect(screen.getByTestId('pricing-card-business').className).toMatch(/current/);
    expect(screen.getByTestId('pricing-cta-pro').textContent).toMatch(/Выбрать/i);
  });

  it('summary load error disables tariff pay and shows RU message', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getTariffSummary).mockRejectedValue(new ApiError('fail', 500));
    renderPricing('/pricing', { plan_code: 'start' });

    await waitFor(() => {
      expect(screen.getByTestId('pricing-summary-error')).toBeTruthy();
    });
    expect(screen.getByTestId('pricing-summary-error').textContent).toMatch(
      /Не удалось проверить текущий тариф/i
    );
    expect(screen.getByTestId('pricing-cta-business').textContent).toMatch(/Недоступно/i);
    expect(screen.getByTestId('pricing-cta-business').tagName).not.toBe('BUTTON');
  });

  it('addons tab label is Доп. пакеты', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => expect(screen.getByTestId('pricing-tab-addons')).toBeTruthy());
    expect(screen.getByTestId('pricing-tab-addons').textContent).toBe('Доп. пакеты');
  });

  it('tab=addons opens packages panel', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    renderPricing('/pricing?tab=addons', null);
    await waitFor(() => expect(screen.getByTestId('pricing-panel-addons')).toBeTruthy());
    expect(screen.queryByTestId('pricing-panel-tariffs')).toBeNull();
  });

  it('tab switch updates URL', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    renderPricing('/pricing', null);
    await waitFor(() => expect(screen.getByTestId('pricing-tab-addons')).toBeTruthy());
    fireEvent.click(screen.getByTestId('pricing-tab-addons'));
    await waitFor(() => {
      expect(screen.getByTestId('loc-tab').textContent).toBe('addons');
    });
  });

  it('unknown tab opens tariffs', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing?tab=unknown', null);
    await waitFor(() => expect(screen.getByTestId('pricing-panel-tariffs')).toBeTruthy());
    expect(screen.getByTestId('loc-tab').textContent).toBe('tariffs');
  });

  it('renders addons shop and buy navigates to checkout for auth business user', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderPricing('/pricing?tab=addons', { plan_code: 'business' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-addon-card-msg_1000')).toBeTruthy();
    });
    expect(screen.getByText('Дополнительные пакеты')).toBeTruthy();
    expect(screen.getByTestId('pricing-addon-amount-msg_1000').textContent).toMatch(/Сообщения/);
    expect(screen.getByTestId('pricing-addon-duration-msg_1000').textContent).toMatch(/30 дней/);
    expect(screen.getByTestId('pricing-addon-duration-bot_extra').textContent).toMatch(
      /тарифного периода/i
    );
    expect(screen.getByTestId('pricing-addon-duration-team_extra').textContent).toMatch(
      /тарифного периода/i
    );
    fireEvent.click(screen.getByTestId('pricing-addon-buy-msg_1000'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-route')).toBeTruthy();
    });
    expect(screen.getByTestId('loc-addon').textContent).toBe('msg_1000');
  });

  it('guest addon buy preserves next=/checkout?addon=', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    renderPricing('/pricing?tab=addons', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-addon-buy-msg_1000')).toBeTruthy();
    });
    const buy = screen.getByTestId('pricing-addon-buy-msg_1000') as HTMLAnchorElement;
    expect(buy.getAttribute('href')).toBe(
      `/login?next=${encodeURIComponent('/checkout?addon=msg_1000')}`
    );
  });

  it('effective start disables addon buy and shows Business gate', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
    renderPricing('/pricing?tab=addons', { plan_code: 'start' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-addons-gate-message')).toBeTruthy();
    });
    expect(screen.getByTestId('pricing-addons-gate-message').textContent).toMatch(/платный тариф/i);
    expect(screen.getByTestId('pricing-addons-choose-tariff')).toBeTruthy();
    expect(screen.getByTestId('pricing-addon-buy-msg_1000').tagName).not.toBe('BUTTON');
    fireEvent.click(screen.getByTestId('pricing-addons-choose-tariff'));
    await waitFor(() => {
      expect(screen.getByTestId('loc-tab').textContent).toBe('tariffs');
    });
  });

  it('summary error fail-closes addon purchase', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockRejectedValue(new ApiError('fail', 500));
    renderPricing('/pricing?tab=addons', { plan_code: 'start' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-addons-summary-error')).toBeTruthy();
    });
    expect(screen.getByTestId('pricing-addon-buy-msg_1000').tagName).not.toBe('BUTTON');
  });

  it('shows Настроить пакет card and quotes price for paid user', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    renderPricing('/pricing?tab=addons', { plan_code: 'business' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-custom-pack-card')).toBeTruthy();
    });
    expect(screen.getByText('Настроить пакет')).toBeTruthy();
    fireEvent.change(screen.getByTestId('pricing-custom-qty'), { target: { value: '3450' } });
    await waitFor(() => {
      expect(quoteCustomAddon).toHaveBeenCalledWith({ quantity: 3450, resource_type: 'messages' });
      expect(screen.getByTestId('pricing-custom-price').textContent).toMatch(/220/);
    });
    expect(screen.queryByTestId('pricing-custom-breakdown')).toBeNull();
    fireEvent.click(screen.getByTestId('pricing-custom-how-toggle'));
    // empty bands → only итог line when opened with empty list is ok; with empty bands no crash
  });

  it('shows custom pack quote error from backend', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('business'));
    vi.mocked(quoteCustomAddon).mockRejectedValue(
      new ApiError(
        'Сейчас нельзя рассчитать стоимость этого количества.',
        422,
        'pricing_incomplete'
      )
    );
    renderPricing('/pricing?tab=addons', { plan_code: 'business' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-custom-quote-error').textContent).toMatch(
        /нельзя рассчитать/
      );
    });
  });

  it('free user custom pack offers paid tariff upgrade', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    vi.mocked(getPublicAddons).mockResolvedValue(mockAddons);
    vi.mocked(getTariffSummary).mockResolvedValue(summaryFor('start'));
    renderPricing('/pricing?tab=addons', { plan_code: 'start' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-custom-upgrade')).toBeTruthy();
    });
    expect(screen.queryByTestId('pricing-custom-buy')).toBeNull();
  });
});
