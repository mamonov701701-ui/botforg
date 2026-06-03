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
  },
};

vi.mock('@/api/tariff', () => ({
  getTariffSummary: vi.fn(),
}));

import { getTariffSummary } from '@/api/tariff';

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
  });

  it('shows loading state', () => {
    vi.mocked(getTariffSummary).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Загрузка данных о тарифе/i)).toBeTruthy();
  });

  it('renders summary on success', async () => {
    vi.mocked(getTariffSummary).mockResolvedValue(mockSummary);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Старт')).toBeTruthy();
    });
    expect(screen.queryByText(/Лимиты в норме/i)).toBeNull();
    expect(screen.getByText(/Использовано 70% лимита сообщений/i)).toBeTruthy();
    expect(screen.getByText('Активных пакетов нет')).toBeTruthy();
    expect(screen.getByText('Активных подарков нет')).toBeTruthy();
    expect(screen.getByText('Маркетплейс')).toBeTruthy();
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
});
