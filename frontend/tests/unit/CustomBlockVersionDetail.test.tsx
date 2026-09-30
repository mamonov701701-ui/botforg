import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCustomBlock = vi.fn();
vi.mock('@/api/blocks', () => ({
  fetchCustomBlock: (...args: unknown[]) => fetchCustomBlock(...args),
}));

import CustomBlockVersionDetailPage from '@/features/dashboard/pages/CustomBlockVersionDetailPage';

beforeEach(() => {
  fetchCustomBlock.mockReset().mockResolvedValue({
    id: 77,
    stable_block_id: 'router',
    owner_user_id: 1,
    version: 3,
    status: 'published',
    status_label: 'Опубликован',
    title: 'Маршрутизатор',
    description: 'Выбирает маршрут',
    category: 'custom',
    usage_count: 2,
    runtime_kind: 'javascript',
    runtime_definition: { kind: 'javascript' },
    passport: {
      purpose: 'Направить сценарий',
      when_to_use: 'При ветвлении',
      limitations: ['Нет сети'],
      connection_rules: { input_count: 1, output_count: 2 },
      outputs: [
        { name: 'success', display_name: 'Успех' },
        { name: 'retry', display_name: 'Повторить' },
      ],
    },
    user_guide: { content: 'Соедините оба выхода.' },
  });
});

describe('CustomBlockVersionDetailPage', () => {
  it('renders the exact version execution and connections contract', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/custom/77']}>
        <Routes>
          <Route
            path="/dashboard/block-library/custom/:versionId"
            element={<CustomBlockVersionDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/JavaScript Runtime/)).toBeTruthy();
    expect(screen.getByText('Входов: 1. Выходов: 2.')).toBeTruthy();
    const breadcrumbs = screen.getByTestId('bf-page-shell-breadcrumbs');
    expect(breadcrumbs).toHaveTextContent('Библиотека блоков');
    expect(breadcrumbs).toHaveStyle({ overflow: 'visible' });
    expect(screen.getByText(/Повторить · маршрут/)).toBeTruthy();
    expect(screen.queryByText(/отправляет настроенное сообщение/)).toBeNull();
  });

  it('показывает историю проверки русскими пользовательскими названиями', async () => {
    fetchCustomBlock.mockResolvedValue({
      ...(await fetchCustomBlock()),
      status: 'draft',
      status_label: 'Черновик',
      review_state: 'admin_review_pending',
      latest_security_report: {
        status: 'succeeded',
        summary:
          'Development AI Security Agent provider completed; Manual Admin Review is still required.',
        findings: [],
      },
      review_history: [
        {
          id: 1,
          decision: 'approve',
          reviewer_user_id: 1,
          comment: '',
          created_at: '2026-09-30T10:00:00Z',
        },
      ],
      review_events: [
        {
          id: 1,
          event_type: 'admin_review_pending',
          previous_state: 'draft',
          resulting_state: 'admin_review_pending',
          actor_type: 'system',
          metadata: {},
          created_at: '2026-09-30T10:00:00Z',
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/custom/77']}>
        <Routes>
          <Route
            path="/dashboard/block-library/custom/:versionId"
            element={<CustomBlockVersionDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/Процесс проверки: На проверке/)).toBeTruthy();
    expect(screen.getByText('История процесса проверки')).toBeTruthy();
    expect(
      screen.getByText(/Передано администратору: Черновик → На проверке · Система/)
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('review_submitted');
    expect(document.body.textContent).not.toContain(
      'Development AI Security Agent provider completed'
    );
  });
});
