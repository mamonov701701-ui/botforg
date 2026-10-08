import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ getBots: vi.fn() }));
vi.mock('@/api/bot', () => ({
  getBots: mocks.getBots,
  toggleBotStatus: vi.fn(),
  deleteBot: vi.fn(),
  updateBot: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 42, role: 'user' } }) }));
vi.mock('@/features/editorV2/NewBotModal', () => ({ default: () => null }));
import BotsPage from '@/features/dashboard/pages/BotsPage';

const bot = {
  id: 5,
  owner_id: 42,
  title: 'Бот продаж',
  username: 'sales',
  webhook_url: null,
  owner_name: 'Анна',
  owner_email: 'anna@example.test',
  owner_public_id: 123,
  team_role: null,
  is_active: true,
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
  suspension_reason: 'Проверьте описание',
  suspended_until: null,
};

beforeEach(() => mocks.getBots.mockReset());

describe('owner-visible enforcement state', () => {
  it('shows warning without describing the bot as blocked', async () => {
    mocks.getBots.mockResolvedValue({
      total: 1,
      items: [{ ...bot, is_suspended: false, suspension_type: 'warning' }],
    });
    render(
      <MemoryRouter>
        <BotsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Предупреждение вынесено')).toBeTruthy();
    expect(screen.getByText('Причина: Проверьте описание')).toBeTruthy();
    expect(screen.queryByText(/Постоянно заблокирован|Временно заблокирован/)).toBeNull();
  });

  it('shows temporary expiry and permanent restriction', async () => {
    mocks.getBots.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          ...bot,
          is_active: false,
          is_suspended: true,
          suspension_type: 'temporary',
          suspended_until: '2026-10-13T12:00:00Z',
        },
      ],
    });
    const first = render(
      <MemoryRouter>
        <BotsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Временно заблокирован до/)).toBeTruthy();
    first.unmount();
    mocks.getBots.mockResolvedValueOnce({
      total: 1,
      items: [{ ...bot, is_active: false, is_suspended: true, suspension_type: 'permanent' }],
    });
    render(
      <MemoryRouter>
        <BotsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Постоянно заблокирован')).toBeTruthy();
  });
});
