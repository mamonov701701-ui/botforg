import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '@/features/dashboard/pages/HomePage';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 1, email: 't@example.com' },
    authStatus: 'authenticated',
    loading: false,
  })),
}));

vi.mock('@/api/analytics', () => ({
  getDashboardData: vi.fn(),
  getRecentEvents: vi.fn(),
  getGlobalStats: vi.fn(),
  getScenarioStats: vi.fn(),
}));

vi.mock('@/api/bot', () => ({
  getBots: vi.fn(),
}));

vi.mock('@/features/dashboard/components/DashboardPage', () => ({
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="dashboard-page">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('@/features/editorV2/NewBotModal', () => ({
  default: () => null,
}));

import { getDashboardData, getRecentEvents, getGlobalStats } from '@/api/analytics';
import { getBots } from '@/api/bot';

describe('HomePage', () => {
  beforeEach(() => {
    vi.mocked(getDashboardData).mockResolvedValue({
      summary: {
        active_bots: 1,
        total_bots: 1,
        total_users: 2,
        total_messages: 10,
        bonus_balance: 500,
        total_scenarios: 3,
        total_executions: 4,
      },
    } as Awaited<ReturnType<typeof getDashboardData>>);
    vi.mocked(getRecentEvents).mockResolvedValue({ items: [] } as Awaited<
      ReturnType<typeof getRecentEvents>
    >);
    vi.mocked(getGlobalStats).mockResolvedValue({
      newUsers: 0,
      activeUsers: 0,
      topScenarios: [],
    } as Awaited<ReturnType<typeof getGlobalStats>>);
    vi.mocked(getBots).mockResolvedValue([]);
  });

  it('does not show legacy marketplace bonus balance KPI', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Активные боты')).toBeTruthy();
    });
    expect(screen.queryByText('Бонусный баланс')).toBeNull();
    expect(screen.queryByText('Доступно для покупок')).toBeNull();
  });
});
