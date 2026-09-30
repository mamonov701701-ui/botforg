import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const fetchBlocksCatalog = vi.fn();
const fetchAdminBlocksCatalog = vi.fn();
const fetchMyCustomBlocks = vi.fn();
const fetchAllCustomBlocksAdmin = vi.fn();
const fetchCustomBlockReviewQueue = vi.fn();
const publishCustomBlock = vi.fn();
const decideCustomBlockReview = vi.fn();
let currentUser = { id: 7, name: 'Тест', role: 'owner', public_id: 101 };

vi.mock('@/api/blocks', () => ({
  fetchBlocksCatalog: (...args: unknown[]) => fetchBlocksCatalog(...args),
  fetchAdminBlocksCatalog: (...args: unknown[]) => fetchAdminBlocksCatalog(...args),
  fetchMyCustomBlocks: (...args: unknown[]) => fetchMyCustomBlocks(...args),
  fetchAllCustomBlocksAdmin: (...args: unknown[]) => fetchAllCustomBlocksAdmin(...args),
  fetchCustomBlockReviewQueue: (...args: unknown[]) => fetchCustomBlockReviewQueue(...args),
  decideCustomBlockReview: (...args: unknown[]) => decideCustomBlockReview(...args),
  publishCustomBlock: (...args: unknown[]) => publishCustomBlock(...args),
  validateCustomBlock: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
  submitCustomBlockReview: vi.fn(),
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

const customCatalogBlock = {
  ...messageBlock,
  id: 'custom-route',
  title: 'Пользовательский маршрут',
  source: 'custom' as const,
  category: 'basic' as const,
  configSchema: [],
};

const ownedVersion = (
  id: number,
  title: string,
  status: 'draft' | 'published' | 'archived',
  updatedAt: string
) => ({
  id,
  stable_block_id: `custom_${id}`,
  owner_user_id: 7,
  version: 1,
  status,
  status_label: status === 'draft' ? 'Черновик' : status === 'published' ? 'Опубликован' : 'Архив',
  title,
  description: title,
  category: 'custom',
  passport: {},
  user_guide: {},
  runtime_kind: 'javascript',
  runtime_definition: {},
  execution_spec: null,
  validation_result: null,
  usage_count: 0,
  created_at: updatedAt,
  updated_at: updatedAt,
});

beforeEach(() => {
  fetchBlocksCatalog.mockReset();
  fetchAdminBlocksCatalog.mockReset();
  fetchMyCustomBlocks.mockReset();
  fetchAllCustomBlocksAdmin.mockReset();
  fetchCustomBlockReviewQueue.mockReset();
  publishCustomBlock.mockReset().mockResolvedValue({});
  decideCustomBlockReview.mockReset().mockResolvedValue({});
  fetchBlocksCatalog.mockResolvedValue([messageBlock, legacyAction, customCatalogBlock]);
  fetchAdminBlocksCatalog.mockResolvedValue([messageBlock, legacyAction]);
  fetchMyCustomBlocks.mockResolvedValue([]);
  fetchAllCustomBlocksAdmin.mockResolvedValue([]);
  fetchCustomBlockReviewQueue.mockResolvedValue([]);
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
    expect(screen.getByText('Пользовательский')).toBeTruthy();
    expect(screen.getAllByText('Системный').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('Пользовательский · Базовые');
    expect(document.body.textContent).not.toContain('Системный · Базовые');
    expect(screen.queryByTestId('blocks-category')).toBeNull();

    fireEvent.change(screen.getByTestId('blocks-origin'), { target: { value: 'custom' } });
    expect(screen.getByText('Пользовательский маршрут')).toBeTruthy();
    expect(screen.queryByText('Сообщение')).toBeNull();
    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: 'QA' } });
    expect(screen.getByText('Подходящие блоки не найдены')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: 'маршрут' } });
    expect(screen.getByText('Пользовательский маршрут')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blocks-origin'), { target: { value: 'system' } });
    expect(screen.getByText('Подходящие блоки не найдены')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: '' } });
    expect(screen.getByText('Сообщение')).toBeTruthy();
    expect(screen.queryByText('Пользовательский маршрут')).toBeNull();
    fireEvent.change(screen.getByTestId('blocks-origin'), { target: { value: 'all' } });

    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: 'несуществующий' } });
    expect(screen.getByText('Подходящие блоки не найдены')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blocks-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('blocks-open-editor'));
    expect(screen.getByText('Редактор открыт')).toBeTruthy();
  });

  it('показывает Category Filter только для нескольких фактических категорий', async () => {
    fetchBlocksCatalog.mockResolvedValue([
      messageBlock,
      { ...messageBlock, id: 'business-block', title: 'Бизнес-блок', category: 'business' },
    ]);
    render(
      <MemoryRouter>
        <BlockLibraryPage />
      </MemoryRouter>
    );
    await screen.findByText('Бизнес-блок');
    const category = screen.getByTestId('blocks-category') as HTMLSelectElement;
    expect(category).toBeTruthy();
    expect(Array.from(category.options).map(option => option.textContent)).toEqual([
      'Все категории',
      'Базовые',
      'Бизнес',
    ]);
    fireEvent.change(category, { target: { value: 'business' } });
    expect(screen.getByText('Бизнес-блок')).toBeTruthy();
    expect(screen.queryByText('Сообщение')).toBeNull();
  });

  it('filters, searches and sorts My Blocks with newest as the default', async () => {
    fetchMyCustomBlocks.mockResolvedValue([
      ownedVersion(1, 'Бета', 'draft', '2026-09-01T00:00:00Z'),
      ownedVersion(2, 'Альфа', 'published', '2026-09-03T00:00:00Z'),
      ownedVersion(3, 'Гамма', 'archived', '2026-09-02T00:00:00Z'),
    ]);
    render(
      <MemoryRouter>
        <BlockLibraryPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('my-custom-blocks').querySelectorAll('h3')).toHaveLength(3)
    );
    const cards = screen.getByTestId('my-custom-blocks').querySelectorAll('h3');
    expect(Array.from(cards).map(node => node.textContent)).toEqual(['Альфа', 'Гамма', 'Бета']);
    fireEvent.click(screen.getByRole('tab', { name: 'Черновики: 1' }));
    expect(screen.getByRole('heading', { name: 'Бета' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Альфа' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Опубликованные: 1' }));
    expect(screen.getByRole('heading', { name: 'Альфа' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Гамма' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Архивные: 1' }));
    expect(screen.getByRole('heading', { name: 'Гамма' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Альфа' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Все: 3' }));
    fireEvent.change(screen.getByTestId('my-blocks-search'), { target: { value: 'гам' } });
    expect(screen.getByRole('heading', { name: 'Гамма' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Бета' })).toBeNull();
    fireEvent.change(screen.getByTestId('my-blocks-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('my-blocks-sort'), { target: { value: 'az' } });
    expect(
      Array.from(screen.getByTestId('my-custom-blocks').querySelectorAll('h3')).map(
        node => node.textContent
      )
    ).toEqual(['Альфа', 'Бета', 'Гамма']);
    fireEvent.change(screen.getByTestId('my-blocks-sort'), { target: { value: 'za' } });
    expect(
      Array.from(screen.getByTestId('my-custom-blocks').querySelectorAll('h3')).map(
        node => node.textContent
      )
    ).toEqual(['Гамма', 'Бета', 'Альфа']);
    fireEvent.change(screen.getByTestId('my-blocks-sort'), { target: { value: 'oldest' } });
    expect(
      Array.from(screen.getByTestId('my-custom-blocks').querySelectorAll('h3')).map(
        node => node.textContent
      )
    ).toEqual(['Бета', 'Гамма', 'Альфа']);
  });

  it('показывает review state как основной статус и не предлагает повторную отправку', async () => {
    fetchMyCustomBlocks.mockResolvedValue([
      {
        ...ownedVersion(10, 'Ожидающий блок', 'draft', '2026-09-30T10:00:00Z'),
        review_state: 'admin_review_pending',
        latest_security_report: {
          status: 'succeeded',
          summary: 'raw provider summary',
          findings: [],
        },
        review_history: [],
      },
    ]);
    render(
      <MemoryRouter>
        <BlockLibraryPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('На проверке')).toBeTruthy();
    expect(screen.queryByText('Отправить на проверку')).toBeNull();
    expect(screen.queryByText('Проверить')).toBeNull();
    expect(document.body.textContent).not.toContain('raw provider summary');
  });

  it('после одобрения предлагает автору отдельную публикацию', async () => {
    fetchMyCustomBlocks.mockResolvedValue([
      {
        ...ownedVersion(11, 'Одобренный блок', 'draft', '2026-09-30T10:00:00Z'),
        review_state: 'approved',
        latest_security_report: { status: 'succeeded', summary: 'raw summary', findings: [] },
        review_history: [
          {
            id: 1,
            decision: 'approve',
            comment: '',
            reviewer_user_id: 1,
            created_at: '2026-09-30T10:00:00Z',
          },
        ],
      },
    ]);
    render(
      <MemoryRouter>
        <BlockLibraryPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Одобрен')).toBeTruthy();
    expect(screen.getByText('Последнее решение: Одобрено')).toBeTruthy();
    fireEvent.click(screen.getByText('Опубликовать'));
    await waitFor(() => expect(publishCustomBlock).toHaveBeenCalledWith(11));
    expect(screen.queryByText('Отправить на проверку')).toBeNull();
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
    expect(screen.getByTestId('admin-custom-block-review-queue')).toBeTruthy();
  });

  it('показывает ожидающую версию в отдельной очереди review', async () => {
    const pending = {
      ...ownedVersion(44, 'На проверке', 'draft', '2026-09-29T12:00:00Z'),
      review_state: 'admin_review_pending',
      validation_result: { valid: true, errors: [], warnings: [] },
      latest_security_report: { status: 'succeeded', summary: 'Отчёт готов', findings: [] },
    };
    fetchCustomBlockReviewQueue.mockResolvedValue([pending]);
    fetchAllCustomBlocksAdmin.mockResolvedValue([pending]);
    render(
      <MemoryRouter>
        <PlatformBlocksPage />
      </MemoryRouter>
    );
    expect((await screen.findAllByText('На проверке')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ожидают проверки: 1/)).toBeTruthy();
    expect(screen.getByText(/Автоматическая проверка: пройдена/)).toBeTruthy();
    expect(screen.getAllByText('Одобрить')).toHaveLength(1);
    expect(screen.getAllByText('Нужны изменения')).toHaveLength(1);
    expect(screen.getAllByText('Отклонить')).toHaveLength(1);
    expect(screen.queryByText('Проверить')).toBeNull();
    expect(screen.getByText('Открыть в очереди проверки')).toBeTruthy();
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
