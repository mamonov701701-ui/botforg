import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TariffLimitsPage from '@/features/dashboard/pages/TariffLimitsPage';
import type { TariffSummary } from '@/api/tariff';
import { ApiError } from '@/api/client';

const mockSummary: TariffSummary = {
  current_plan: {
    code: 'start',
    slug: 'start',
    name: 'Старт',
    billing_period: { start: '2026-06-01T00:00:00Z', end: '2026-07-01T00:00:00Z' },
    subscription_status: null,
    source: 'legacy_plan_code',
  },
  messages: { limit: 500, used: 350, remaining: 150 },
  active_bots: { limit: 1, used: 0, remaining: 1 },
  team_members: { limit: 0, used: 0, remaining: 0 },
  active_addons: [],
  active_gifts: [],
  warnings: [
    {
      type: 'messages_usage',
      threshold: 70,
      message: 'Использовано 70% лимита сообщений.',
    },
  ],
  flags: {
    marketplace_access: true,
    template_publish: true,
    scenario_publish: true,
    export_reports: false,
    priority_support: false,
    addon_purchase: false,
  },
};

vi.mock('@/api/tariff', () => ({
  getTariffSummary: vi.fn(),
}));

vi.mock('@/api/addons', () => ({
  getPublicAddons: vi.fn(),
}));

import { getTariffSummary } from '@/api/tariff';
import { getPublicAddons } from '@/api/addons';

function renderPage() {
  return render(
    <MemoryRouter>
      <TariffLimitsPage />
    </MemoryRouter>
  );
}

describe('TariffLimitsPage', () => {
  beforeEach(() => {
    vi.mocked(getTariffSummary).mockReset();
    vi.mocked(getPublicAddons).mockReset();
  });

  it('shows loading state', () => {
    vi.mocked(getTariffSummary).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Загрузка данных о тарифе/i)).toBeTruthy();
  });

  it('renders summary on success without purchasable addons catalog', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue(mockSummary);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Старт')).toBeTruthy();
    });
    expect(screen.getByText('Финансы и лимиты')).toBeTruthy();
    expect(screen.getByTestId('tariff-current-plan')).toBeTruthy();
    expect(screen.getByTestId('tariff-usage-messages')).toBeTruthy();
    expect(screen.getByTestId('tariff-active-addons').textContent).toMatch(/Активных пакетов нет/);
    expect(screen.queryByTestId('tariff-addons-catalog')).toBeNull();
    expect(getPublicAddons).not.toHaveBeenCalled();
    expect(screen.getByTestId('tariff-buy-addons-link').getAttribute('href')).toBe(
      '/pricing?tab=addons'
    );
    const refundsLink = screen.getByRole('link', { name: /Открыть возвраты/i });
    expect(refundsLink.getAttribute('href')).toBe('/dashboard/finance/refunds');
  });

  it('shows owned UserAddon from summary (e.g. msg_1000)', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue({
      ...mockSummary,
      active_addons: [
        {
          id: 2,
          code: 'msg_1000',
          name_ru: 'Пакет 1000 сообщений',
          type: 'messages',
          amount: 1000,
          period_start: '2026-07-21T00:00:00Z',
          period_end: '2026-08-20T00:00:00Z',
          expires_at: '2026-08-20T00:00:00Z',
        },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('tariff-owned-addon-msg_1000')).toBeTruthy();
    });
    expect(screen.getByTestId('tariff-owned-addon-msg_1000').textContent).toMatch(
      /Пакет 1000 сообщений/
    );
    expect(screen.getByTestId('tariff-owned-addon-msg_1000').textContent).toMatch(/Сообщения/);
    expect(screen.getByTestId('tariff-owned-addon-until-msg_1000').textContent).toMatch(
      /Активен до/
    );
    expect(screen.queryByTestId('tariff-addon-buy-msg_1000')).toBeNull();
  });

  it('shows multi-threshold warnings from summary', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue({
      ...mockSummary,
      messages: { limit: 100, used: 100, remaining: 0 },
      warnings: [
        { type: 'messages_usage', threshold: 70, message: 'Использовано 70% лимита сообщений.' },
        { type: 'messages_usage', threshold: 85, message: 'Использовано 85% лимита сообщений.' },
        { type: 'messages_usage', threshold: 95, message: 'Использовано 95% лимита сообщений.' },
        { type: 'messages_usage', threshold: 100, message: 'Лимит сообщений исчерпан.' },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('tariff-usage-messages-percent').textContent).toBe('100%');
    });
    expect(screen.getByText(/Сообщения · 70%/)).toBeTruthy();
    expect(screen.getByText(/Сообщения · 100%/)).toBeTruthy();
  });

  it('shows normal state when no warnings', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue({ ...mockSummary, warnings: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Лимиты в норме')).toBeTruthy();
    });
  });

  it('shows error state', async () => {
    vi.mocked(getTariffSummary).mockRejectedValue(new ApiError('fail', 500));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить информацию о тарифе/i)).toBeTruthy();
    });
  });

  it('renders unsupported gift and missing billing period', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue({
      ...mockSummary,
      current_plan: {
        ...mockSummary.current_plan,
        billing_period: null,
        source: 'gift_plan',
      },
      active_gifts: [
        { id: 1, gift_type: 'messages', amount: 100, status: 'unsupported_missing_plan_id' },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Период не указан/i)).toBeTruthy();
    });
    expect(screen.getByText(/Подарок тарифа \(требует настройки\)/i)).toBeTruthy();
  });
});
