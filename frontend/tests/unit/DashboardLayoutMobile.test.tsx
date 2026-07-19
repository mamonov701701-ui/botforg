import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
