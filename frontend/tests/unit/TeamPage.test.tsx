import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TeamPage from '@/features/dashboard/pages/TeamPage';
import type { TariffSummary } from '@/api/tariff';

const { getTariffSummary, getMyTeam } = vi.hoisted(() => ({
  getTariffSummary: vi.fn(),
  getMyTeam: vi.fn(),
}));

vi.mock('@/api/tariff', () => ({
  getTariffSummary,
}));

vi.mock('@/api/team', () => ({
  getMyTeam,
  deleteTeamMember: vi.fn(),
  updateTeamMemberRole: vi.fn(),
  addTeamMember: vi.fn(),
  findUserByIdentifier: vi.fn(),
}));

vi.mock('@/api/platformAdmin', () => ({
  assignBaseRole: vi.fn(),
  updateBaseRole: vi.fn(),
  deleteBaseRole: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'owner', email: 'owner@example.com' },
  }),
}));

vi.mock('@/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const baseSummary: TariffSummary = {
  current_plan: {
    code: 'business',
    slug: 'business',
    name: 'Бизнес',
    billing_period: { start: '2026-06-01T00:00:00Z', end: '2026-07-01T00:00:00Z' },
    subscription_status: null,
    source: 'legacy_plan_code',
  },
  messages: { limit: 4000, used: 0, remaining: 4000 },
  active_bots: { limit: 2, used: 0, remaining: 2 },
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
    addon_purchase: true,
  },
};

describe('TeamPage entitlement', () => {
  beforeEach(() => {
    getTariffSummary.mockReset();
    getMyTeam.mockReset();
    getMyTeam.mockResolvedValue([]);
  });

  it('shows entitlement message when team_members limit is 0', async () => {
    getTariffSummary.mockResolvedValue(baseSummary);
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('team-entitlement-locked')).toBeTruthy();
    });
    expect(screen.getByTestId('team-entitlement-locked').textContent).toMatch(
      /Команда недоступна на вашем текущем тарифе/
    );
    expect(screen.getByTestId('team-choose-plan-cta').getAttribute('href')).toBe(
      '/pricing?tab=tariffs'
    );
    expect(screen.queryByText('Пригласить')).toBeNull();
  });

  it('allows invite UI when team_members limit > 0', async () => {
    getTariffSummary.mockResolvedValue({
      ...baseSummary,
      current_plan: { ...baseSummary.current_plan, code: 'business_pro', name: 'Бизнес PRO' },
      team_members: { limit: 3, used: 1, remaining: 2 },
    });
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByTestId('team-entitlement-locked')).toBeNull();
    });
    expect(screen.getByText('Пригласить')).toBeTruthy();
  });
});
