import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'T', role: 'owner', public_id: 1 } }),
}));
vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ openAuth: vi.fn() }),
}));
vi.mock('@/api/chat', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ unread_count: 0 }),
}));

import Header from '@/components/Header';

describe('Header mobile menu', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: String(query).includes('768'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes mobile menu toggle with all nav routes', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByTestId('site-header-menu-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('site-header-menu-toggle'));
    const panel = screen.getByTestId('site-header-mobile-panel');
    expect(panel.getAttribute('hidden')).toBeNull();
    expect(panel.textContent).toContain('BF агент');
    expect(panel.textContent).toContain('Маркет');
    expect(panel.textContent).toContain('Возможности');
    expect(panel.textContent).toContain('Тарифы');
    expect(panel.textContent).toContain('Личный кабинет');
    expect(panel.textContent).toContain('Редактор');
  });
});
