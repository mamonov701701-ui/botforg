import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import Pricing from '@/pages/Pricing';
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
    code: 'business_pro',
    name: 'Бизнес PRO',
    description_ru: null,
    price_month: 1990,
    currency: 'RUB',
    is_recommended: true,
    sort_order: 30,
    limits: { active_bots: 3, monthly_messages: 10000, export_reports: true },
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

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

import { getPublicTariffs } from '@/api/tariffs';
import { useAuthStore } from '@/stores/authStore';

function LocationProbe() {
  const [params] = useSearchParams();
  return <div data-testid="loc-plan">{params.get('plan') || ''}</div>;
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
        <Route path="/login" element={<div data-testid="login-page">login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Pricing page', () => {
  beforeEach(() => {
    vi.mocked(getPublicTariffs).mockReset();
    vi.mocked(useAuthStore).mockReset();
  });

  it('renders tariffs from API', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-list')).toBeTruthy();
    });
    expect(screen.getByText('Старт')).toBeTruthy();
    expect(screen.getByText('Бизнес PRO')).toBeTruthy();
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText('Pro')).toBeNull();
  });

  it('does not fall back to static tariffs on API error', async () => {
    vi.mocked(getPublicTariffs).mockRejectedValue(new ApiError('fail', 500));
    renderPricing('/pricing', null);
    await waitFor(() => {
      expect(screen.getByTestId('pricing-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('pricing-list')).toBeNull();
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText('Pro')).toBeNull();
    expect(screen.queryByText('Старт')).toBeNull();
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

  it('authenticated select sets ?plan=code without payment calls', async () => {
    vi.mocked(getPublicTariffs).mockResolvedValue(mockTariffs);
    renderPricing('/pricing', { plan_code: 'start' });
    await waitFor(() => {
      expect(screen.getByTestId('pricing-cta-business_pro')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pricing-cta-business_pro'));
    await waitFor(() => {
      expect(screen.getByTestId('loc-plan').textContent).toBe('business_pro');
    });
    expect(screen.getByTestId('pricing-card-business_pro').className).toMatch(
      /pricing-card--selected/
    );
    expect(getPublicTariffs).toHaveBeenCalledTimes(1);
  });
});
