import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getMyCustomBlockMarketplaceListings: vi.fn(),
  getMyEligibleCustomBlockVersions: vi.fn(),
  getMyCustomBlockMarketplaceRequests: vi.fn(),
  getCustomBlockMarketplaceGrants: vi.fn(),
  getCustomBlockMarketplaceReviews: vi.fn(),
  updateCustomBlockMarketplaceListing: vi.fn(),
  publishCustomBlockMarketplaceListing: vi.fn(),
  archiveCustomBlockMarketplaceListing: vi.fn(),
  restoreCustomBlockMarketplaceListing: vi.fn(),
  createCustomBlockMarketplaceListing: vi.fn(),
  approveCustomBlockMarketplaceRequest: vi.fn(),
  rejectCustomBlockMarketplaceRequest: vi.fn(),
  revokeCustomBlockMarketplaceGrant: vi.fn(),
  grantCustomBlockMarketplaceAccess: vi.fn(),
  grantCustomBlockDistribution: vi.fn(),
}));
vi.mock('@/api/customBlockMarketplace', () => api);
import CustomBlockMarketplaceManagementPage from '@/pages/CustomBlockMarketplaceManagementPage';

const listing = {
  id: 7,
  custom_block_version_id: 41,
  stable_block_id: 'cb',
  version: 2,
  title: 'CRM routing',
  block_title: 'Исходный CRM-блок',
  description: 'Routes leads',
  category: 'automation',
  tags: [],
  visibility: 'public' as const,
  access_policy: 'explicit_grant' as const,
  commercial_mode: 'paid' as const,
  price_amount: 1200,
  price_currency: 'RUB',
  lifecycle: 'draft' as const,
  created_at: '2026-10-05T12:00:00Z',
  user_guide: {},
  rating_average: null,
  rating_count: 0,
  author: { id: 1, name: 'Анна' },
  access: {
    is_owner: true,
    can_self_install: false,
    can_request_access: false,
    can_add_new_node: true,
    has_active_grant: false,
    has_grant_history: false,
    is_installed: false,
    listing_available: false,
    request_state: null,
    chat_room_id: null,
  },
};
const renderPage = (path = '/market/my-listings/custom-blocks') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CustomBlockMarketplaceManagementPage />
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(api).forEach(fn => fn.mockReset().mockResolvedValue({}));
  api.getMyCustomBlockMarketplaceListings.mockResolvedValue([listing]);
  api.getMyEligibleCustomBlockVersions.mockResolvedValue([
    { id: 42, title: 'Версия для Маркета', version: 3 },
  ]);
  api.getMyCustomBlockMarketplaceRequests.mockResolvedValue([
    {
      id: 3,
      custom_block_version_id: 41,
      listing_id: 7,
      version: 2,
      block_title: 'CRM routing',
      requester_user_id: 12,
      requester_name: 'Мария',
      state: 'pending',
      message: 'Нужен доступ',
      chat_room_id: 99,
    },
  ]);
  api.getCustomBlockMarketplaceGrants.mockResolvedValue([
    {
      id: 4,
      recipient_user_id: 12,
      recipient_name: 'Мария',
      status: 'active',
      grant_source: 'author_approval',
    },
  ]);
  api.getCustomBlockMarketplaceReviews.mockResolvedValue([
    { id: 5, author_name: 'Мария', rating: 5, text: 'Полезный блок' },
  ]);
});

describe('Custom Block Marketplace management', () => {
  it('explains an empty version selector and links back to the library/listings', async () => {
    api.getMyEligibleCustomBlockVersions.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Разместить блок' }));
    const blocker = await screen.findByRole('alert');
    expect(
      within(blocker).getByText('Нет доступных версий для размещения').parentElement?.className
    ).toContain('text-[var(--error)]');
    expect(blocker.className).toContain('border-[var(--error-border)]');
    expect(
      within(blocker).getByText(/Все ваши опубликованные версии уже размещены в Маркете/)
    ).toBeTruthy();
    const version = screen.getByRole('combobox', { name: 'Блок и версия' });
    expect(version).toBeDisabled();
    expect(within(version).getByRole('option', { name: 'Нет доступных версий' })).toBeTruthy();
    expect(within(version).queryByRole('option', { name: 'Выберите версию' })).toBeNull();
    const create = screen.getByRole('button', { name: 'Создать черновик карточки' });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(api.createCustomBlockMarketplaceListing).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Перейти в Библиотеку блоков' })).toHaveAttribute(
      'href',
      '/dashboard/block-library'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Мои размещения' }));
    expect(await screen.findByRole('article')).toBeTruthy();
  });

  it('opens with a listing-first author view and no always-open creation or selection panel', async () => {
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'Мои блоки' })).toBeTruthy();
    const card = await screen.findByRole('article');
    expect(within(card).getByText('CRM routing')).toBeTruthy();
    expect(card.textContent).toContain('v2');
    expect(card.textContent).toContain('Связанный блок: Исходный CRM-блок');
    expect(card.textContent).toContain('Точная версия: v2');
    expect(card.className).toContain('bf-market-card--management');
    expect(card.querySelector('.bf-market-card__visual')).toHaveAttribute(
      'aria-label',
      'Кастомный блок'
    );
    expect(card.querySelector('.bf-market-card__body')).toBeTruthy();
    expect(card.querySelector('.bf-market-card__footer')).toBeTruthy();
    expect(card.textContent).toContain('Автоматизация');
    expect(card.textContent).toContain('Черновик');
    expect(card.textContent).toContain('Платно');
    expect(card.textContent).toContain('1200');
    expect(card.textContent).toMatch(/5 октября 2026/);
    expect(within(card).getByRole('button', { name: 'Управлять' })).toHaveClass('bf-primary-cta');
    expect(screen.queryByRole('heading', { name: 'Выберите карточку' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Блок и версия' })).toBeNull();
    expect(container.querySelector('.bf-page-shell')).toBeTruthy();
    expect(container.querySelector('main')?.className).toContain('pb-32');
  });

  it('opens creation on CTA with only eligible versions and a separate default category', async () => {
    api.getMyEligibleCustomBlockVersions.mockResolvedValue([
      { id: 42, title: 'Версия для Маркета', version: 3 },
    ]);
    let created: any = null;
    api.getMyCustomBlockMarketplaceListings.mockImplementation(async () =>
      created ? [listing, created] : [listing]
    );
    api.createCustomBlockMarketplaceListing.mockImplementation(async () => {
      created = {
        ...listing,
        id: 9,
        custom_block_version_id: 42,
        title: 'Версия для Маркета',
        commercial_mode: 'free',
        price_amount: null,
        price_currency: null,
      };
      return created;
    });
    api.publishCustomBlockMarketplaceListing.mockImplementation(async () => {
      created = { ...created!, lifecycle: 'published' };
      return created;
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Разместить блок' }));
    expect(screen.getByText(/Сначала создайте черновик карточки/)).toBeTruthy();
    const version = screen.getByRole('combobox', { name: 'Блок и версия' });
    expect(version).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Создать черновик карточки' })).toBeDisabled();
    expect(within(version).getByRole('option', { name: 'Версия для Маркета · v3' })).toHaveValue(
      '42'
    );
    expect(within(version).queryByRole('option', { name: 'Автоматизация' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Категория нового размещения' })).toHaveValue(
      'other'
    );
    fireEvent.change(version, { target: { value: '42' } });
    expect(screen.getByRole('button', { name: 'Создать черновик карточки' })).toBeEnabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория нового размещения' }), {
      target: { value: 'marketing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик карточки' }));
    await waitFor(() =>
      expect(api.createCustomBlockMarketplaceListing).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ category: 'marketing', commercial_mode: 'free' })
      )
    );
    expect(
      await screen.findByText(/Карточка создана как черновик и пока не видна в каталоге/)
    ).toBeTruthy();
    expect(screen.getByText(/Карточка пока не видна в каталоге/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(api.publishCustomBlockMarketplaceListing).toHaveBeenCalledWith(9));
    expect(await screen.findByRole('button', { name: 'Архивировать' })).toBeTruthy();
    expect(screen.queryByText(/Карточка пока не видна в каталоге/)).toBeNull();
  });

  it('manages a concrete draft: save, publish, grants and reviews', async () => {
    let persisted = { ...listing };
    api.getMyCustomBlockMarketplaceListings.mockImplementation(async () => [{ ...persisted }]);
    api.updateCustomBlockMarketplaceListing.mockImplementation(async (_id, payload) => {
      persisted = { ...persisted, ...payload };
      return persisted;
    });
    api.publishCustomBlockMarketplaceListing.mockImplementation(async () => {
      persisted = { ...persisted, lifecycle: 'published' };
      return persisted;
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Управлять' }));
    expect(screen.getByText('Связанный блок: Исходный CRM-блок · Точная версия: v2')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Отозвать' })).toBeTruthy();
    expect(screen.getByText(/Полезный блок/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория размещения' }), {
      target: { value: 'support' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(api.updateCustomBlockMarketplaceListing).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ category: 'support' })
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(api.publishCustomBlockMarketplaceListing).toHaveBeenCalledWith(7));
    expect(await screen.findByRole('button', { name: 'Архивировать' })).toBeTruthy();
  });

  it('keeps legacy request actions visually distinct without changing the request flow', async () => {
    api.getMyCustomBlockMarketplaceListings.mockResolvedValue([
      { ...listing, commercial_mode: 'external_terms' },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Управлять' }));
    expect(await screen.findByRole('link', { name: 'Открыть чат' })).toHaveClass(
      'bf-secondary-cta'
    );
    expect(screen.getByRole('button', { name: 'Отклонить' })).toHaveClass('bf-danger-cta');
  });

  it('allows published metadata changes and explicit grant, then archive and restore', async () => {
    let persisted = {
      ...listing,
      lifecycle: 'published' as const,
      access_policy: 'explicit_grant' as const,
    };
    api.getMyCustomBlockMarketplaceListings.mockImplementation(async () => [{ ...persisted }]);
    api.updateCustomBlockMarketplaceListing.mockImplementation(async (_id, payload) => {
      persisted = { ...persisted, ...payload };
      return persisted;
    });
    api.archiveCustomBlockMarketplaceListing.mockImplementation(async () => {
      persisted = { ...persisted, lifecycle: 'archived' };
      return persisted;
    });
    api.restoreCustomBlockMarketplaceListing.mockImplementation(async () => {
      persisted = { ...persisted, lifecycle: 'published' };
      return persisted;
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Управлять' }));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveClass('bf-primary-cta');
    fireEvent.change(screen.getByRole('textbox', { name: 'Публичный ID пользователя' }), {
      target: { value: '12345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Выдать право использования' }));
    await waitFor(() =>
      expect(api.grantCustomBlockMarketplaceAccess).toHaveBeenCalledWith(41, 12345678)
    );
    expect(screen.getByRole('button', { name: 'Архивировать' })).toHaveClass('bf-danger-cta');
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать' }));
    await waitFor(() => expect(api.archiveCustomBlockMarketplaceListing).toHaveBeenCalledWith(7));
    expect(await screen.findByRole('button', { name: 'Восстановить' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }));
    await waitFor(() => expect(api.restoreCustomBlockMarketplaceListing).toHaveBeenCalledWith(7));
  });

  it('handles successful empty listings separately from API failures', async () => {
    api.getMyCustomBlockMarketplaceListings.mockResolvedValue([]);
    api.getMyCustomBlockMarketplaceRequests.mockResolvedValue([]);
    const view = renderPage();
    expect(await screen.findByText('Размещений пока нет.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
    api.getMyCustomBlockMarketplaceListings.mockRejectedValue(new Error('Ошибка запроса'));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Не удалось загрузить данные размещений'
    );
    expect(screen.queryByText('Размещений пока нет.')).toBeNull();
  });
});
