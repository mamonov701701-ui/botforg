import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/blocks', () => ({
  fetchBlocksLearnCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/market', async () => {
  const actual = await vi.importActual<typeof import('@/api/market')>('@/api/market');
  return {
    ...actual,
    getMarketItems: vi.fn().mockResolvedValue([]),
    installMarketBot: vi.fn(),
    installMarketScenario: vi.fn(),
    createMarketItem: vi.fn(),
    createMarketOrder: vi.fn(),
    createFreelancerProfile: vi.fn(),
    createMarketAccessRequest: vi.fn(),
    getMarketItemAccessStatus: vi.fn(),
  };
});

vi.mock('@/api/bot', () => ({ getBots: vi.fn().mockResolvedValue([]) }));
vi.mock('@/api/scenarios', () => ({ getMyScenarios: vi.fn().mockResolvedValue([]) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: null }),
}));
vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ openAuth: vi.fn() }),
}));

import FeaturesPage from '@/pages/features/FeaturesPage';
import MarketplacePage from '@/pages/MarketplacePage';

describe('FeaturesPage PageShell', () => {
  it('puts brand, title, tabs and content in one shell', async () => {
    render(
      <MemoryRouter>
        <FeaturesPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('features-page-shell').className).toContain('bf-page-shell');
    expect(screen.getByTestId('bf-page-shell-eyebrow').textContent).toBe('БОТФОРГ');
    expect(screen.getByTestId('bf-page-shell-title').textContent).toBe('Возможности платформы');
    expect(screen.getByTestId('features-tablist')).toBeTruthy();
    fireEvent.click(screen.getByTestId('features-tab-learning'));
    await waitFor(() => {
      expect(screen.getByText(/Как собрать первый сценарий/i)).toBeTruthy();
    });
  });
});

describe('MarketplacePage PageShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts title, tabs, search and list area in one shell without outer duplicate header', async () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('market-page-shell').className).toContain('bf-page-shell');
    expect(screen.getByTestId('bf-page-shell-title').textContent).toBe('Маркет');
    expect(screen.getByTestId('market-tablist')).toBeTruthy();
    expect(screen.getByPlaceholderText('Поиск...')).toBeTruthy();
    // Single shell: title lives inside shell, not as a second framed block sibling
    expect(screen.getAllByTestId('bf-page-shell-title')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByText(/Товары не найдены|Загрузка товаров/i)).toBeTruthy();
    });
  });
});
