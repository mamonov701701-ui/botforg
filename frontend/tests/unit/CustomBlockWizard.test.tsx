import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDraft = vi.fn();
const updateDraft = vi.fn();
const validateBlock = vi.fn();
const publishBlock = vi.fn();

vi.mock('@/api/blocks', () => ({
  createCustomBlockDraft: (...args: unknown[]) => createDraft(...args),
  updateCustomBlockDraft: (...args: unknown[]) => updateDraft(...args),
  validateCustomBlock: (...args: unknown[]) => validateBlock(...args),
  publishCustomBlock: (...args: unknown[]) => publishBlock(...args),
  fetchCustomBlock: vi.fn(),
}));

import CustomBlockWizardPage from '@/features/dashboard/pages/CustomBlockWizardPage';
import { CUSTOM_BLOCK_WIZARD_STEPS } from '@/features/dashboard/blockLibrary/customBlockWizardContent';

beforeEach(() => {
  createDraft.mockReset().mockResolvedValue({ id: 41 });
  updateDraft.mockReset().mockResolvedValue({ id: 41 });
  validateBlock.mockReset().mockResolvedValue({ valid: true, errors: [], warnings: [] });
  publishBlock.mockReset().mockResolvedValue({ id: 41, status: 'published' });
});

describe('Мастер кастомного блока', () => {
  it('использует 11 канонических шагов и сохраняет введённые данные при навигации', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    expect(CUSTOM_BLOCK_WIZARD_STEPS).toHaveLength(11);
    expect(screen.getByText(/Шаг 1 из 11/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Мой блок' } });
    fireEvent.click(screen.getByText('Далее'));
    expect(screen.getByText(/Шаг 2 из 11/)).toBeTruthy();
    fireEvent.click(screen.getByText('Назад'));
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Мой блок');
  });

  it('сохраняет черновик, проверяет и публикует только валидный результат', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/create']}>
        <Routes>
          <Route path="/dashboard/block-library/create" element={<CustomBlockWizardPage />} />
          <Route path="/dashboard/block-library" element={<div>Библиотека</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Сохранить черновик'));
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1));
    for (let index = 0; index < 10; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByText('Проверить'));
    await waitFor(() => expect(validateBlock).toHaveBeenCalledWith(41));
    expect(screen.getByText('Ошибки')).toBeTruthy();
    fireEvent.click(screen.getByText('Опубликовать'));
    await waitFor(() => expect(publishBlock).toHaveBeenCalledWith(41));
    expect(screen.getByText('Библиотека')).toBeTruthy();
  });
});
