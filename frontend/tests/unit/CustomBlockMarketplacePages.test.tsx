import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getListings: vi.fn(),
  getListing: vi.fn(),
  getGranted: vi.fn(),
  install: vi.fn(),
  installGranted: vi.fn(),
  request: vi.fn(),
  contact: vi.fn(),
}));
vi.mock('@/api/customBlockMarketplace', () => ({
  getCustomBlockMarketplaceListings: api.getListings,
  getCustomBlockMarketplaceListing: api.getListing,
  installCustomBlockMarketplaceListing: api.install,
  requestCustomBlockMarketplaceAccess: api.request,
  contactCustomBlockMarketplaceAuthor: api.contact,
  getMyGrantedCustomBlockVersions: api.getGranted,
  installGrantedCustomBlockVersion: api.installGranted,
}));
import CustomBlockMarketplacePage from '@/features/dashboard/pages/CustomBlockMarketplacePage';
import CustomBlockMarketplaceDetailPage from '@/features/dashboard/pages/CustomBlockMarketplaceDetailPage';

const listing = {
  id: 17,
  custom_block_version_id: 41,
  stable_block_id: 'custom_test',
  version: 1,
  title: 'Маршрутизация заявки',
  block_title: 'Исходный маршрутизатор',
  description: 'Направляет заявку по правилам.',
  category: 'automation',
  tags: ['crm'],
  author: { id: 7, name: 'Анна' },
  visibility: 'public' as const,
  access_policy: 'self_install' as const,
  commercial_mode: 'free' as const,
  lifecycle: 'published' as const,
  created_at: '2026-10-05T12:00:00Z',
  user_guide: { content: 'Как использовать блок' },
  rating_average: 4.5,
  rating_count: 2,
  reviews: [],
  access: {
    is_owner: false,
    can_self_install: true,
    can_request_access: false,
    can_add_new_node: false,
    has_active_grant: false,
    has_grant_history: false,
    is_installed: false,
    listing_available: true,
    request_state: null,
    chat_room_id: null,
  },
};
const detail = (value = listing) =>
  render(
    <MemoryRouter initialEntries={[`/market/custom-blocks/${value.id}`]}>
      <Routes>
        <Route
          path="/market/custom-blocks/:listingId"
          element={<CustomBlockMarketplaceDetailPage />}
        />
        <Route path="/dashboard/messages" element={<div>Внутренний чат</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  api.getListings.mockReset().mockResolvedValue({ items: [listing] });
  api.getListing.mockReset().mockResolvedValue(listing);
  api.install.mockReset().mockResolvedValue({ grant_id: 1, installed: true });
  api.request.mockReset().mockResolvedValue({ id: 2, chat_room_id: 99 });
  api.contact.mockReset().mockResolvedValue({ chat_room_id: 99 });
  api.getGranted.mockReset().mockResolvedValue([]);
  api.installGranted.mockReset().mockResolvedValue({ installed: true });
});

describe('Custom Block Marketplace pages', () => {
  it('renders empty/error discovery distinctly and uses the shared Market shell', async () => {
    api.getListings.mockResolvedValue({ items: [] });
    const view = render(
      <MemoryRouter>
        <CustomBlockMarketplacePage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Подходящих блоков пока нет.')).toBeTruthy();
    expect(view.container.querySelector('.bf-page-shell')).toBeTruthy();
    view.unmount();
    api.getListings.mockRejectedValue(new Error('Ошибка запроса'));
    render(
      <MemoryRouter>
        <CustomBlockMarketplacePage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Подходящих блоков пока нет.')).toBeNull();
  });

  it('renders Free/Paid product cards and hides incompatible legacy offers', async () => {
    const paid = {
      ...listing,
      id: 18,
      title: 'Платный блок',
      commercial_mode: 'paid' as const,
      access_policy: 'explicit_grant' as const,
      price_amount: 120,
      price_currency: 'RUB',
      access: { ...listing.access, can_self_install: false },
    };
    const legacy = {
      ...listing,
      id: 19,
      title: 'Старая карточка',
      access_policy: 'author_approval' as const,
    };
    api.getListings.mockResolvedValue({ items: [listing, paid, legacy] });
    render(
      <MemoryRouter>
        <CustomBlockMarketplacePage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: /Маршрутизация заявки/ })).toHaveAttribute(
      'href',
      '/market/custom-blocks/17'
    );
    expect(screen.getByRole('link', { name: /Платный блок/ })).toHaveAttribute(
      'href',
      '/market/custom-blocks/18'
    );
    expect(screen.queryByText('Старая карточка')).toBeNull();
    expect(screen.getAllByText('Автор: Анна')).toHaveLength(2);
    expect(screen.getByText('БЕСПЛАТНО')).toBeTruthy();
    expect(screen.getByText(/120\s*₽/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Добавить в мои блоки' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Связаться с автором' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Добавить в мои блоки' })).toHaveClass(
      'bf-primary-cta'
    );
    expect(screen.getByRole('button', { name: 'Связаться с автором' })).toHaveClass(
      'bf-primary-cta'
    );
    expect(screen.getAllByTestId('custom-block-product-card')).toHaveLength(2);
    expect(
      screen
        .getAllByTestId('custom-block-product-card')
        .every(card => card.classList.contains('bf-market-card'))
    ).toBe(true);
    expect(
      screen.getByTestId('market-custom-block-grid').querySelector('.bf-market-grid')
    ).toBeTruthy();
    expect(screen.getByTestId('market-sticky-toolbar')).toBeTruthy();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Шаблоны',
      'Сценарии',
      'Кастомные блоки',
      'Заказчики',
      'Исполнители',
    ]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), {
      target: { value: 'automation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    await waitFor(() =>
      expect(api.getListings).toHaveBeenLastCalledWith({ search: '', category: 'automation' })
    );
  });

  it('uses the same branded primary CTA for owner and installed catalog cards', async () => {
    const owned = {
      ...listing,
      id: 20,
      title: 'Моё размещение',
      access: { ...listing.access, is_owner: true },
    };
    const installed = {
      ...listing,
      id: 21,
      title: 'Установленный блок',
      access: {
        ...listing.access,
        is_installed: true,
        has_active_grant: true,
      },
    };
    api.getListings.mockResolvedValue({ items: [owned, installed] });
    render(
      <MemoryRouter>
        <CustomBlockMarketplacePage />
      </MemoryRouter>
    );
    const manage = await screen.findByRole('link', { name: 'Управлять' });
    const library = screen.getByRole('link', { name: 'Открыть в библиотеке' });
    expect(manage).toHaveClass('bf-primary-cta');
    expect(manage).toHaveAttribute('href', '/market/my-listings/custom-blocks');
    expect(library).toHaveClass('bf-primary-cta');
    expect(library).toHaveAttribute('href', '/dashboard/block-library');
  });

  it('self-install uses one CTA, then shows installed state and library link', async () => {
    api.getListing
      .mockResolvedValueOnce(listing)
      .mockResolvedValue({
        ...listing,
        access: {
          ...listing.access,
          can_self_install: false,
          has_active_grant: true,
          has_grant_history: true,
          is_installed: true,
          can_add_new_node: true,
        },
      });
    detail();
    expect(
      await screen.findByText('Связанный блок: Исходный маршрутизатор · Точная версия: v1')
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить в мои блоки' }));
    expect(api.install).toHaveBeenCalledWith(17);
    expect(await screen.findByText('Добавлено в мои блоки.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Открыть в библиотеке' })).toHaveAttribute(
      'href',
      '/dashboard/block-library'
    );
    expect(screen.getByRole('link', { name: 'Открыть в библиотеке' })).toHaveClass(
      'bf-primary-cta'
    );
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
  });

  it('does not expose legacy access policy actions on consumer detail', async () => {
    const approval = {
      ...listing,
      access_policy: 'author_approval' as const,
      access: { ...listing.access, can_self_install: false, can_request_access: true },
    };
    api.getListing.mockResolvedValue(approval);
    detail(approval);
    expect(await screen.findByText('Карточка недоступна в каталоге.')).toBeTruthy();
    expect(screen.queryByText(/Старая модель/)).toBeNull();
  });

  it('approved or explicit grant still requires a separate library installation', async () => {
    const granted = {
      ...listing,
      commercial_mode: 'paid' as const,
      price_amount: 120,
      price_currency: 'RUB',
      access_policy: 'explicit_grant' as const,
      access: {
        ...listing.access,
        can_self_install: false,
        has_active_grant: true,
        has_grant_history: true,
      },
    };
    api.getListing.mockResolvedValue(granted);
    detail(granted);
    expect(await screen.findByText(/Доступ получен. Блок ещё не добавлен/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Добавить в мои блоки' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Открыть в библиотеке' })).toBeNull();
  });

  it('explicit grant without rights opens the existing chat without self-install', async () => {
    const explicit = {
      ...listing,
      commercial_mode: 'paid' as const,
      price_amount: 120,
      price_currency: 'RUB',
      access_policy: 'explicit_grant' as const,
      access: { ...listing.access, can_self_install: false },
    };
    api.getListing.mockResolvedValue(explicit);
    detail(explicit);
    fireEvent.click(await screen.findByRole('button', { name: 'Связаться с автором' }));
    expect(api.contact).toHaveBeenCalledWith(17, '');
    expect(await screen.findByText('Внутренний чат')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
  });

  it('paid offer shows fixed price and contact, never an automatic install CTA', async () => {
    const paid = {
      ...listing,
      commercial_mode: 'paid' as const,
      access_policy: 'explicit_grant' as const,
      price_amount: 950,
      price_currency: 'USD',
      access: { ...listing.access, can_self_install: false },
    };
    api.getListing.mockResolvedValue(paid);
    detail(paid);
    expect(await screen.findByText(/950\s*\$/)).toBeTruthy();
    expect(
      screen.getByText('Оплата напрямую автору. BotForg не участвует в расчётах.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Связаться с автором' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
  });

  it('hides external-terms legacy detail without technical commercial labels', async () => {
    const external = {
      ...listing,
      access_policy: 'author_approval' as const,
      commercial_mode: 'external_terms' as const,
      access: { ...listing.access, can_self_install: false, can_request_access: true },
    };
    api.getListing.mockResolvedValue(external);
    detail(external);
    expect(await screen.findByText('Карточка недоступна в каталоге.')).toBeTruthy();
    expect(screen.queryByText(/Старая модель|Условия у автора/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
  });

  it('revoked and archived versions cannot be newly added', async () => {
    const revoked = {
      ...listing,
      access: {
        ...listing.access,
        can_self_install: false,
        has_grant_history: true,
        is_installed: true,
      },
    };
    api.getListing.mockResolvedValue(revoked);
    const first = detail(revoked);
    expect(await screen.findByText(/Доступ отозван/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
    first.unmount();
    const archived = {
      ...listing,
      lifecycle: 'archived' as const,
      access: {
        ...listing.access,
        can_self_install: false,
        listing_available: false,
        has_active_grant: true,
        is_installed: true,
      },
    };
    api.getListing.mockResolvedValue(archived);
    detail(archived);
    expect(await screen.findByText('Добавлено в мои блоки.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Добавить в мои блоки' })).toBeNull();
  });

  it('retains the shared Market navigation on a 390px viewport', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    const view = render(
      <MemoryRouter>
        <CustomBlockMarketplacePage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Маршрутизация заявки')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(view.container.firstElementChild?.className).toContain('bf-market-container');
    view.unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    window.dispatchEvent(new Event('resize'));
  });
});
