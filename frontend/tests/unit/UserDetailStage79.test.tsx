import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getUserDetailedInfo: vi.fn(),
  getUserSuspension: vi.fn(),
  suspendBot: vi.fn(),
  createObjectEnforcement: vi.fn(),
}));
vi.mock('@/api/platformAdmin', () => ({
  getUserDetailedInfo: api.getUserDetailedInfo,
  getUserSuspension: api.getUserSuspension,
  suspendUser: vi.fn(),
  unsuspendUser: vi.fn(),
  suspendBot: api.suspendBot,
  unsuspendBot: vi.fn(),
  suspendAllUserBots: vi.fn(),
  unsuspendAllUserBots: vi.fn(),
  createObjectEnforcement: api.createObjectEnforcement,
  resolveObjectEnforcement: vi.fn(),
}));
import UserDetailPage from '@/features/dashboard/pages/UserDetailPage';

beforeEach(() => {
  api.getUserDetailedInfo.mockReset().mockResolvedValue({
    user: {
      id: 42,
      public_id: 12345678,
      name: 'Анна',
      email: 'anna@example.test',
      role: 'user',
      created_at: '2026-10-01T12:00:00Z',
      is_suspended: false,
      platform_roles: [],
    },
    bots: [
      {
        id: 5,
        title: 'Бот продаж',
        username: 'sales',
        is_active: true,
        is_suspended: false,
        suspension_type: null,
        suspension_reason: null,
        created_at: null,
        users_count: 0,
        messages_count: 0,
      },
    ],
    scenarios: [
      { id: 6, name: 'Продажи', bot_id: 5, is_main: true, is_library: false, created_at: null },
    ],
    templates: [{ id: 7, name: 'Шаблон продаж', is_public: true }],
    custom_block_summary: {
      created_blocks: 1,
      published_versions: 1,
      draft_versions: 0,
      archived_versions: 0,
      marketplace_listings: 1,
      free_listings: 0,
      paid_listings: 1,
      received_marketplace: 1,
      received_direct: 1,
      received_unverified: 0,
      library_installs: 1,
      active_rights: 1,
      revoked_rights: 1,
    },
    received_custom_blocks: [
      {
        grant_id: 21,
        title: 'Полученный блок',
        version: 3,
        original_author_user_id: 88,
        original_author_name: 'Пётр',
        source_channel: 'marketplace',
        grant_status: 'active',
        is_installed: true,
        has_distribution_right: true,
        listing_lifecycle: 'published',
        current_commercial_mode: 'paid',
      },
      {
        grant_id: 22,
        title: 'Прямой блок',
        version: 1,
        original_author_user_id: 89,
        original_author_name: 'Ирина',
        source_channel: 'direct',
        grant_status: 'revoked',
        is_installed: false,
        has_distribution_right: false,
        listing_lifecycle: null,
        current_commercial_mode: null,
      },
    ],
    custom_blocks: [
      {
        id: 8,
        stable_key: 'crm',
        title: 'CRM-блок',
        created_at: '2026-09-30T12:00:00Z',
        versions: [
          {
            id: 9,
            version: 2,
            title: 'CRM-блок',
            status: 'published',
            review_state: 'approved',
            marketplace_lifecycle: 'published',
            commercial_mode: 'paid',
            active_grants_count: 2,
          },
        ],
      },
    ],
    marketplace_listings: [
      {
        id: 10,
        custom_block_version_id: 9,
        title: 'CRM-блок',
        commercial_mode: 'paid',
        price_amount: 120,
        price_currency: 'RUB',
        lifecycle: 'published',
        version: 2,
        created_at: '2026-10-01T12:00:00Z',
        active_grants_count: 2,
      },
    ],
    market_items: [],
    disputes: [{ id: 11, status: 'open', listing_id: 10 }],
    reports: [],
    enforcements: [
      {
        id: 12,
        action: 'warning',
        subject_type: 'user',
        subject_id: 42,
        reason: 'Проверка обращения',
        actor_user_id: 1,
        created_at: '2026-10-02T12:00:00Z',
      },
    ],
    team_memberships: [],
    statistics: {
      total_bots: 1,
      active_bots: 1,
      total_scenarios: 1,
      total_bot_users: 0,
      total_messages: 0,
      team_projects_count: 0,
    },
  });
  api.getUserSuspension.mockReset().mockResolvedValue({ is_suspended: false });
  api.suspendBot.mockReset().mockResolvedValue({ detail: 'Предупреждение вынесено' });
  api.createObjectEnforcement.mockReset().mockResolvedValue({ id: 99 });
});

describe('Stage 7.9 Admin User Detail', () => {
  it('identifies the user and shows real linked entities without a profile editor', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/users/42']}>
        <Routes>
          <Route path="/dashboard/platform/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Основная информация')).toBeTruthy();
    expect(screen.getByText('Имя:')).toBeTruthy();
    expect(screen.getByText('User ID:')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('anna@example.test')).toBeTruthy();
    expect(screen.getByText('Кастомные блоки — сводка')).toBeTruthy();
    expect(screen.getByText('Создано блоков: 1')).toBeTruthy();
    expect(screen.getByText('Опубликованных версий: 1')).toBeTruthy();
    expect(screen.getByText('Получено из Маркета: 1')).toBeTruthy();
    expect(screen.getByText('Получено напрямую: 1')).toBeTruthy();
    expect(screen.getByText('Созданные пользователем (1)')).toBeTruthy();
    expect(screen.getByText('Полученные пользователем (2)')).toBeTruthy();
    expect(screen.getByText(/Полученный блок · v3/)).toBeTruthy();
    expect(screen.getByText(/Прямой блок · v1/)).toBeTruthy();
    expect(screen.getByText(/CRM-блок · ID 8/)).toBeTruthy();
    expect(screen.getByText(/Платно · 120 RUB/)).toBeTruthy();
    expect(screen.getByText(/Спор #11/)).toBeTruthy();
    expect(screen.getByText(/Проверка обращения/)).toBeTruthy();
    expect(screen.queryByText(/Дата рождения|2FA|Активные сессии/)).toBeNull();
  });

  it('opens the selected bot in admin inspection and labels each action correctly', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/users/42']}>
        <Routes>
          <Route path="/dashboard/platform/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Основная информация');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть', exact: true }));
    expect(screen.getByRole('region', { name: 'Информация о боте Бот продаж' })).toBeTruthy();
    expect(screen.getByText('Бот #5 · владелец #42')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Заблокировать', exact: true }));
    const dialog = within(screen.getByRole('dialog', { name: 'Административная мера' }));
    expect(dialog.getByRole('button', { name: 'Вынести предупреждение' })).toBeTruthy();
    expect(screen.getByRole('dialog').style.background).toBe('var(--bf-shell-bg-solid)');
    fireEvent.click(dialog.getByRole('button', { name: 'Временная блокировка' }));
    expect(dialog.getByRole('button', { name: 'Заблокировать временно' })).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Постоянная блокировка' }));
    expect(dialog.getByRole('button', { name: 'Заблокировать', exact: true })).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Предупреждение' }));
    fireEvent.change(dialog.getByPlaceholderText('Опишите причину меры...'), {
      target: { value: 'Проверьте описание' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Вынести предупреждение' }));
    await waitFor(() =>
      expect(api.suspendBot).toHaveBeenCalledWith(5, {
        suspension_type: 'warning',
        reason: 'Проверьте описание',
      })
    );
  });

  it('offers a real audited enforcement path for a scenario, not a fake direct edit', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/users/42']}>
        <Routes>
          <Route path="/dashboard/platform/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Основная информация');
    const scenario = screen.getByText(/Продажи · ID 6/);
    fireEvent.click(within(scenario).getByRole('button', { name: 'Вынести предупреждение' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByRole('button', { name: 'Временная блокировка' })).toBeNull();
    fireEvent.change(dialog.getByPlaceholderText('Опишите причину меры...'), {
      target: { value: 'Проверьте содержание' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Вынести предупреждение' }));
    await waitFor(() =>
      expect(api.createObjectEnforcement).toHaveBeenCalledWith({
        subject_type: 'scenario',
        subject_id: 6,
        action: 'warning',
        reason: 'Проверьте содержание',
      })
    );
  });

  it('offers a user-scoped Marketplace restriction through the audited Trust & Safety API', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/users/42']}>
        <Routes>
          <Route path="/dashboard/platform/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Маркет: без ограничения');
    const apply = screen.getByRole('button', { name: 'Ограничить Маркет' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Причина ограничения Маркета' }), {
      target: { value: 'Нарушение правил Маркета' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Срок ограничения Маркета' }), {
      target: { value: '14' },
    });
    fireEvent.click(apply);
    await waitFor(() =>
      expect(api.createObjectEnforcement).toHaveBeenCalledWith({
        subject_type: 'user',
        subject_id: 42,
        action: 'temporary_market_restriction',
        reason: 'Нарушение правил Маркета',
        duration_days: 14,
      })
    );
  });

  it('shows an existing broad Marketplace restriction without offering a duplicate action', async () => {
    const detail = await api.getUserDetailedInfo();
    api.getUserDetailedInfo.mockResolvedValue({
      ...detail,
      enforcements: [
        {
          id: 30,
          subject_type: 'user',
          subject_id: 42,
          action: 'prohibit_commercial_market_activity',
          reason: 'Нарушение правил',
          actor_user_id: 1,
          created_at: '2026-10-02T12:00:00Z',
          expires_at: null,
          revoked_at: null,
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/users/42']}>
        <Routes>
          <Route path="/dashboard/platform/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Маркет: ограничен')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ограничить Маркет' })).toBeNull();
    expect(screen.getByText(/Запрет коммерческой деятельности в Маркете/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Снять меру' })).toBeTruthy();
  });
});
