import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const fetchBlocksCatalog = vi.fn();
const fetchAdminBlocksCatalog = vi.fn();
const fetchMyCustomBlocks = vi.fn();
const fetchAllCustomBlocksAdmin = vi.fn();
let currentUser = { id: 7, name: 'Тест', role: 'owner', public_id: 101 };

vi.mock('@/api/blocks', () => ({
  fetchBlocksCatalog: (...args: unknown[]) => fetchBlocksCatalog(...args),
  fetchAdminBlocksCatalog: (...args: unknown[]) => fetchAdminBlocksCatalog(...args),
  fetchMyCustomBlocks: (...args: unknown[]) => fetchMyCustomBlocks(...args),
  fetchAllCustomBlocksAdmin: (...args: unknown[]) => fetchAllCustomBlocksAdmin(...args),
  archiveCustomBlock: vi.fn(),
  restoreCustomBlock: vi.fn(),
  createCustomBlockVersion: vi.fn(),
  deleteCustomBlockDraft: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: currentUser, loading: false, clearUser: vi.fn() }),
}));
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/api/tariff', () => ({
  getTariffSummary: vi.fn().mockResolvedValue({ current_plan: null }),
}));

import BlockLibraryPage from '@/features/dashboard/pages/BlockLibraryPage';
import BlockLibraryDetailPage from '@/features/dashboard/pages/BlockLibraryDetailPage';
import PlatformBlocksPage from '@/features/dashboard/pages/PlatformBlocksPage';
import DashboardLayout from '@/features/dashboard/DashboardLayout';

const messageBlock = {
  id: 'message',
  title: 'Сообщение',
  category: 'basic' as const,
  description: 'Отправляет сообщение пользователю',
  icon: '💬',
  color: '#3b82f6',
  planAccess: ['free'] as const,
  permissions: ['viewer'] as const,
  disabled: false,
  configSchema: [
    { name: 'text', type: 'text' as const, label: 'Текст сообщения', required: true },
    { name: 'buttons', type: 'button_list' as const, label: 'Кнопки', required: false },
  ],
};

const legacyAction = {
  ...messageBlock,
  id: 'action',
  title: 'Action',
  description: 'Legacy action',
  configSchema: [],
};

beforeEach(() => {
  fetchBlocksCatalog.mockReset();
  fetchAdminBlocksCatalog.mockReset();
  fetchMyCustomBlocks.mockReset();
  fetchAllCustomBlocksAdmin.mockReset();
  fetchBlocksCatalog.mockResolvedValue([messageBlock, legacyAction]);
  fetchAdminBlocksCatalog.mockResolvedValue([messageBlock, legacyAction]);
  fetchMyCustomBlocks.mockResolvedValue([]);
  fetchAllCustomBlocksAdmin.mockResolvedValue([]);
  currentUser = { id: 7, name: 'Тест', role: 'owner', public_id: 101 };
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

describe('Пользовательская библиотека блоков', () => {
  it('показывает русские подписи, скрывает legacy и открывает редактор', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library']}>
        <Routes>
          <Route path="/dashboard/block-library" element={<BlockLibraryPage />} />
          <Route path="/editor" element={<div>Редактор открыт</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Сообщение')).toBeTruthy();
    expect(screen.getByText('Мои блоки')).toBeTruthy();
    expect(screen.getByTestId('create-custom-block')).toBeTruthy();
    expect(screen.getByText(/Основные параметры: Текст сообщения · Кнопки/)).toBeTruthy();
    expect(screen.queryByText('Action')).toBeNull();
    expect(document.body.textContent).not.toContain('button_list');
    expect(document.body.textContent).not.toContain('Идентификатор: message');

    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: 'несуществующий' } });
    expect(screen.getByText('Подходящие блоки не найдены')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('blocks-open-editor'));
    expect(screen.getByText('Редактор открыт')).toBeTruthy();
  });

  it('использует русскую инструкцию и понятные типы параметров', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/message']}>
        <Routes>
          <Route path="/dashboard/block-library/:blockId" element={<BlockLibraryDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Основные параметры')).toBeTruthy();
    expect(screen.getByText(/Текст сообщения · обязательный параметр/)).toBeTruthy();
    expect(screen.getByText(/Кнопки · необязательный параметр/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('button_list');
  });
});

describe('Административное управление блоками', () => {
  it('показывает системный код только вместе с русским названием и contract details', async () => {
    render(
      <MemoryRouter>
        <PlatformBlocksPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Сообщение')).toBeTruthy();
    expect(screen.getByText('message')).toBeTruthy();
    expect(screen.getByText('Канонический')).toBeTruthy();
    fireEvent.click(screen.getByTestId('admin-block-details-message'));
    expect(screen.getByTestId('admin-block-expanded-message')).toBeTruthy();
    expect(screen.getByText(/Исходящие связи/)).toBeTruthy();
  });

  it('не допускает обычного пользователя к платформенному маршруту', async () => {
    currentUser = { id: 8, name: 'Обычный пользователь', role: 'user', public_id: 102 };
    localStorage.setItem('dashboard_mode', 'platform');

    render(
      <MemoryRouter initialEntries={['/dashboard/platform/blocks']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<div>Личный кабинет</div>} />
            <Route path="platform/blocks" element={<PlatformBlocksPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Личный кабинет')).toBeTruthy());
    expect(screen.queryByText('Управление блоками')).toBeNull();
  });
});
