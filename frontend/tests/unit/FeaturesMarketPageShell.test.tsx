import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
import { getMarketItems } from '@/api/market';

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
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Шаблоны',
      'Сценарии',
      'Кастомные блоки',
      'Заказчики',
      'Исполнители',
    ]);
    expect(screen.queryByRole('link', { name: 'Кастомные блоки' })).toBeNull();
    expect(screen.getByPlaceholderText('Поиск...')).toBeTruthy();
    // Single shell: title lives inside shell, not as a second framed block sibling
    expect(screen.getAllByTestId('bf-page-shell-title')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByText(/Товары не найдены|Загрузка товаров/i)).toBeTruthy();
    });
  });

  it('opens Custom Blocks discovery from the top-level Market tab', async () => {
    render(
      <MemoryRouter initialEntries={['/market']}>
        <Routes>
          <Route path="/market" element={<MarketplacePage />} />
          <Route path="/market/custom-blocks" element={<div>Custom Blocks discovery</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('market-tab-custom-blocks'));
    expect(await screen.findByText('Custom Blocks discovery')).toBeTruthy();
  });

  it.each([
    ['templates', 'template', 'market-template-grid', 'Шаблон'],
    ['scenarios', 'scenario', 'market-scenario-grid', 'Сценарий'],
  ])('renders %s with the shared catalog card', async (section, itemType, gridId, visualLabel) => {
    vi.mocked(getMarketItems).mockResolvedValueOnce({
      items: [
        {
          id: 71,
          item_type: itemType,
          title: 'Карточка Маркета',
          description: 'Описание',
          price: 0,
          category: 'Другое',
          seller: { id: 1, name: 'Автор' },
        },
      ],
      total: 1,
    } as never);
    render(
      <MemoryRouter initialEntries={[`/market?section=${section}`]}>
        <MarketplacePage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Карточка Маркета' })).toBeTruthy();
    expect(screen.getByTestId(gridId).querySelector('.bf-market-card')).toBeTruthy();
    expect(screen.getByLabelText(visualLabel)).toBeTruthy();
    expect(screen.getByTestId('market-sticky-toolbar')).toBeTruthy();
  });
});
