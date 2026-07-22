import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 12, name: 'Test User', role: 'owner', public_id: 55088527 },
    loading: false,
    clearUser: vi.fn(),
  }),
}));
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/api/tariff', () => ({
  getTariffSummary: vi.fn().mockResolvedValue({
    current_plan: {
      code: 'business',
      slug: 'business',
      name: 'Бизнес',
      billing_period: null,
      subscription_status: 'active',
      source: 'subscription',
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
      export_reports: true,
      priority_support: false,
      addon_purchase: true,
    },
  }),
}));

import DashboardLayout from '@/features/dashboard/DashboardLayout';

describe('DashboardLayout mobile drawer', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: String(query).includes('max-width: 768'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    localStorage.setItem('dashboard_mode', 'platform');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows mobile menu toggle and opens drawer without occupying main flow width', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/finance']}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard/platform/finance" element={<div>Finance content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('dashboard-mobile-nav-toggle')).toBeTruthy();
    expect(screen.getByTestId('dashboard-main').textContent).toContain('Finance content');
    const aside = screen.getByTestId('dashboard-sidebar');
    expect(aside.className).not.toContain('is-open');

    fireEvent.click(screen.getByTestId('dashboard-mobile-nav-toggle'));
    expect(aside.className).toContain('is-open');
    expect(screen.getByTestId('dashboard-mobile-nav-backdrop')).toBeTruthy();
  });

  it('shows effective tariff badge linking to finance', async () => {
    localStorage.setItem('dashboard_mode', 'projects');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-user-tariff')).toBeTruthy();
    });
    const tariff = screen.getByTestId('dashboard-user-tariff');
    expect(tariff.textContent).toMatch(/Тариф:\s*Бизнес/);
    expect(tariff.getAttribute('href')).toBe('/dashboard/finance');
    expect(screen.getByTestId('dashboard-user-role').textContent).not.toMatch(/Бизнес/);
  });
});
