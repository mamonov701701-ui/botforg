import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDraft = vi.fn();
const updateDraft = vi.fn();
const validateBlock = vi.fn();
const publishBlock = vi.fn();
const fetchBlock = vi.fn();

vi.mock('@/api/blocks', () => ({
  createCustomBlockDraft: (...args: unknown[]) => createDraft(...args),
  updateCustomBlockDraft: (...args: unknown[]) => updateDraft(...args),
  validateCustomBlock: (...args: unknown[]) => validateBlock(...args),
  publishCustomBlock: (...args: unknown[]) => publishBlock(...args),
  fetchCustomBlock: (...args: unknown[]) => fetchBlock(...args),
}));

import CustomBlockWizardPage from '@/features/dashboard/pages/CustomBlockWizardPage';
import { CUSTOM_BLOCK_WIZARD_STEPS } from '@/features/dashboard/blockLibrary/customBlockWizardContent';

const savedVersion = (payload: Record<string, any>) => ({
  id: 41,
  version: 1,
  status: 'draft',
  title: payload.title || 'Черновик',
  description: payload.description || '',
  category: payload.category || 'custom',
  passport: {
    purpose: payload.purpose || '',
    when_to_use: payload.when_to_use || '',
    inputs: payload.inputs || [],
    outputs: payload.outputs || [],
    config_schema: payload.config_schema || [],
    connection_rules: payload.connection_rules || {},
    simulator_compatibility: payload.simulator_compatibility ?? true,
    supported_channels: payload.supported_channels || [],
    limitations: payload.limitations || [],
    examples: payload.examples || [],
    internal_code: 'custom_test',
    wizard_step: payload.wizard_step ?? 0,
  },
  user_guide: payload.user_guide || { content: '' },
  runtime_kind: payload.runtime_compatibility,
  runtime_definition: {
    ...(payload.runtime_definition || {}),
    kind: payload.runtime_compatibility,
  },
  execution_spec: payload.execution_spec ?? null,
});

beforeEach(() => {
  createDraft.mockReset().mockImplementation(payload => Promise.resolve(savedVersion(payload)));
  updateDraft
    .mockReset()
    .mockImplementation((_id, payload) => Promise.resolve(savedVersion(payload)));
  validateBlock.mockReset().mockResolvedValue({ valid: true, errors: [], warnings: [] });
  publishBlock.mockReset().mockResolvedValue({ id: 41, version: 1, status: 'published' });
  fetchBlock.mockReset();
});

describe('Мастер кастомного блока', () => {
  it('использует 9 содержательных шагов и сохраняет введённые данные при навигации', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    expect(CUSTOM_BLOCK_WIZARD_STEPS).toHaveLength(9);
    expect(screen.getByText(/Шаг 1 из 9/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Мой блок' } });
    fireEvent.click(screen.getByText('Далее'));
    expect(screen.getByText(/Шаг 2 из 9/)).toBeTruthy();
    fireEvent.click(screen.getByText('Назад'));
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Мой блок');
  });

  it('показывает все 9 tabs без scroll и переходит напрямую Step 8 → Step 2', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    const navigation = screen.getByTestId('wizard-tab-navigation');
    expect(screen.getAllByRole('tab')).toHaveLength(9);
    expect(navigation.className).toContain('gap-x-0');
    expect(navigation.className).not.toContain('overflow');
    expect(screen.queryByTestId('wizard-vertical-navigation')).toBeNull();
    expect(screen.queryByTestId('wizard-horizontal-navigation')).toBeNull();
    CUSTOM_BLOCK_WIZARD_STEPS.forEach((_, index) => {
      expect(screen.getByTestId(`wizard-step-number-${index + 1}`).textContent).toBe(
        String(index + 1)
      );
    });
    fireEvent.click(screen.getByTestId('wizard-step-8'));
    expect(screen.getByText(/Шаг 8 из 9/)).toBeTruthy();
    expect(screen.getByTestId('wizard-step-8').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('wizard-step-number-1').textContent).toBe('1');
    expect(screen.queryByTestId('wizard-step-completed-1')).toBeNull();
    fireEvent.click(screen.getByTestId('wizard-step-2'));
    expect(screen.getByText(/Шаг 2 из 9/)).toBeTruthy();
  });

  it('поддерживает keyboard activation для tabs', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    const stepEight = screen.getByTestId('wizard-step-8');
    stepEight.focus();
    fireEvent.keyDown(stepEight, { key: 'Enter' });
    expect(screen.getByText(/Шаг 8 из 9/)).toBeTruthy();
    const stepTwo = screen.getByTestId('wizard-step-2');
    stepTwo.focus();
    fireEvent.keyDown(stepTwo, { key: ' ' });
    expect(screen.getByText(/Шаг 2 из 9/)).toBeTruthy();
  });

  it('связывает active tab и Content Card общей поверхностью без progress bar', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    const layout = screen.getByTestId('wizard-navigation-content-layout');
    const pageShell = screen.getByTestId('wizard-active-page-shell');
    const navigation = screen.getByTestId('wizard-tab-navigation');
    const content = screen.getByTestId('wizard-current-step-card');
    const activeTab = screen.getByTestId('wizard-step-1');
    expect(layout.contains(navigation)).toBe(true);
    expect(layout.contains(content)).toBe(true);
    expect(pageShell.contains(navigation)).toBe(true);
    expect(pageShell.contains(content)).toBe(true);
    expect(screen.queryByTestId('wizard-progress-divider')).toBeNull();
    expect(activeTab.className).toContain('bg-[var(--bf-section-bg)]');
    expect(activeTab.className).toContain('border-b-0');
    expect(activeTab.className).not.toContain('border-b-transparent');
    expect(content.className).toContain('custom-block-wizard__page-content');
    expect(activeTab.className).toContain('h-11');
    expect(activeTab.className).not.toContain('-mb-px');
    expect(screen.queryByTestId('wizard-active-page-shoulder')).toBeNull();
    expect(screen.queryByTestId('wizard-back-page-shoulder')).toBeNull();
    expect(screen.queryByTestId('wizard-back-page-layer')).toBeNull();
    expect(screen.queryByTestId('wizard-step-completed-1')).toBeNull();
    expect(screen.queryByTestId('wizard-step-warning-1')).toBeNull();
  });

  it('докует целый active row к Content Card на desktop 5+4', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    const cssValue = (stepNumber: number, variable: string) =>
      Number(
        (screen.getByTestId(`wizard-step-${stepNumber}`) as HTMLElement).style.getPropertyValue(
          variable
        )
      );
    for (const activeStep of [1, 5]) {
      fireEvent.click(screen.getByTestId(`wizard-step-${activeStep}`));
      expect(cssValue(1, '--wizard-tab-row-desktop')).toBe(2);
      expect(cssValue(5, '--wizard-tab-row-desktop')).toBe(2);
      expect(cssValue(6, '--wizard-tab-row-desktop')).toBe(1);
      expect(cssValue(9, '--wizard-tab-row-desktop')).toBe(1);
    }
    for (const activeStep of [6, 9]) {
      fireEvent.click(screen.getByTestId(`wizard-step-${activeStep}`));
      expect(cssValue(1, '--wizard-tab-row-desktop')).toBe(1);
      expect(cssValue(5, '--wizard-tab-row-desktop')).toBe(1);
      expect(cssValue(6, '--wizard-tab-row-desktop')).toBe(2);
      expect(cssValue(9, '--wizard-tab-row-desktop')).toBe(2);
    }
    expect(
      [1, 2, 3, 4, 5].map(stepNumber => cssValue(stepNumber, '--wizard-tab-column-desktop'))
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      [6, 7, 8, 9].map(stepNumber => cssValue(stepNumber, '--wizard-tab-column-desktop'))
    ).toEqual([1, 2, 3, 4]);
    expect(screen.getByTestId('wizard-tab-navigation').nextElementSibling).toBe(
      screen.getByTestId('wizard-current-step-card')
    );
  });

  it('докует active row на medium 3+3+3 и narrow layout без изменения DOM order', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    const cssOrder = (stepNumber: number, variable: string) =>
      Number(
        (screen.getByTestId(`wizard-step-${stepNumber}`) as HTMLElement).style.getPropertyValue(
          variable
        )
      );
    for (const [activeStep, rowStart] of [
      [2, 1],
      [5, 4],
      [8, 7],
    ] as const) {
      fireEvent.click(screen.getByTestId(`wizard-step-${activeStep}`));
      expect(cssOrder(rowStart, '--wizard-tab-row-medium')).toBe(3);
      expect(cssOrder(rowStart + 2, '--wizard-tab-row-medium')).toBe(3);
    }
    fireEvent.click(screen.getByTestId('wizard-step-4'));
    expect(cssOrder(3, '--wizard-tab-row-narrow')).toBe(5);
    expect(cssOrder(4, '--wizard-tab-row-narrow')).toBe(5);
    expect(cssOrder(4, '--wizard-tab-row-mobile')).toBe(9);
    expect([1, 2, 3].map(stepNumber => cssOrder(stepNumber, '--wizard-tab-column-medium'))).toEqual(
      [1, 2, 3]
    );
    expect([3, 4].map(stepNumber => cssOrder(stepNumber, '--wizard-tab-column-narrow'))).toEqual([
      1, 2,
    ]);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent?.match(/^\d+/)?.[0])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
  });

  it('автосохраняет изменённый draft и текущий шаг после debounce', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter>
          <CustomBlockWizardPage />
        </MemoryRouter>
      );
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Автосохранение' } });
      fireEvent.click(screen.getByTestId('wizard-step-3'));
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Автосохранение',
          wizard_step: 2,
        })
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId('draft-save-status')).toHaveTextContent('Сохранено');
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes autosaves so a stale response cannot overwrite a newer draft', async () => {
    vi.useFakeTimers();
    let resolveCreate!: (value: any) => void;
    let resolveUpdate!: (value: any) => void;
    createDraft.mockImplementation(
      payload =>
        new Promise(resolve => {
          resolveCreate = () => resolve(savedVersion(payload));
        })
    );
    updateDraft.mockImplementation(
      (_id, payload) =>
        new Promise(resolve => {
          resolveUpdate = () => resolve(savedVersion(payload));
        })
    );
    try {
      render(
        <MemoryRouter>
          <CustomBlockWizardPage />
        </MemoryRouter>
      );
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Первая версия' } });
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      expect(createDraft).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новая версия' } });
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      expect(updateDraft).not.toHaveBeenCalled();
      await act(async () => {
        resolveCreate(undefined);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(updateDraft).toHaveBeenCalledWith(
        41,
        expect.objectContaining({ title: 'Новая версия' })
      );
      await act(async () => {
        resolveUpdate(undefined);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId('draft-save-status')).toHaveTextContent('Сохранено');
    } finally {
      vi.useRealTimers();
    }
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
    for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByText('Проверить'));
    await waitFor(() => expect(validateBlock).toHaveBeenCalledWith(41));
    expect(screen.getByText('Ошибки')).toBeTruthy();
    fireEvent.click(screen.getByText('Опубликовать'));
    await waitFor(() => expect(publishBlock).toHaveBeenCalledWith(41));
    expect(screen.getByText('Блок успешно опубликован')).toBeTruthy();
    expect(screen.getByText('Вернуться в библиотеку')).toBeTruthy();
  });

  it('переносит описание результатов в соединения и позволяет выбрать терминальный контракт', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByText('Далее'));
    expect(screen.getByText(/Каждый выход описывает результат/)).toBeTruthy();
    expect(screen.getByText('Входы')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Выходы'), { target: { value: '0' } });
    expect(screen.getByText(/терминальный блок/)).toBeTruthy();
  });

  it('allows more than six named outputs up to the technical limit', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.change(screen.getByLabelText('Выходы'), { target: { value: '7' } });
    expect(screen.getByText('Выход 7: отображаемое название')).toBeTruthy();
    expect(screen.getByRole('option', { name: '32 выход(а)' })).toBeTruthy();
  });

  it('keeps the display-name input mounted while typing and generates a Russian machine key', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByText('Далее'));
    const input = screen.getByPlaceholderText('Например, Успех') as HTMLInputElement;
    input.focus();
    let value = '';
    for (const character of 'Текст сообщения') {
      value += character;
      fireEvent.change(input, { target: { value } });
      expect(document.activeElement).toBe(input);
    }
    expect(screen.getByText('tekst_soobshcheniya')).toBeTruthy();
  });

  it('explains that Message fallback cannot publish multiple routes', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.change(screen.getByLabelText('Выходы'), { target: { value: '7' } });
    fireEvent.click(screen.getByText('Далее'));
    expect(screen.getByRole('alert').textContent).toContain('Message fallback');
    expect(screen.getByRole('alert').textContent).toContain('JavaScript Runtime');
  });

  it('сохраняет переключение Message → JavaScript → Message в API payload и каноническом ответе', async () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByText('Далее'));
    const checkbox = screen.getByLabelText('Выполнять JavaScript в изолированном раннере');

    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('Сохранить черновик'));
    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          runtime_compatibility: 'javascript',
          runtime_definition: expect.objectContaining({ kind: 'javascript' }),
          execution_spec: expect.objectContaining({ language: 'javascript' }),
        })
      )
    );
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('Сохранить черновик'));
    await waitFor(() =>
      expect(updateDraft).toHaveBeenCalledWith(
        41,
        expect.objectContaining({
          runtime_compatibility: 'message',
          runtime_definition: expect.objectContaining({ kind: 'message' }),
          execution_spec: null,
        })
      )
    );
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('сохраняет JavaScript с пользовательским входом, 15 выходами и route success', async () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByText('Далее'));
    fireEvent.change(screen.getByLabelText('Входные данные — по одному на строке'), {
      target: { value: 'Текст сообщения' },
    });
    fireEvent.click(screen.getByText('Далее'));
    fireEvent.change(screen.getByLabelText('Выходы'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByLabelText('Выполнять JavaScript в изолированном раннере'));
    fireEvent.click(screen.getByText('Сохранить черновик'));

    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: [
            expect.objectContaining({
              name: 'tekst_soobshcheniya',
              display_name: 'Текст сообщения',
            }),
          ],
          outputs: expect.arrayContaining([expect.objectContaining({ name: 'success' })]),
          runtime_compatibility: 'javascript',
          execution_spec: expect.objectContaining({
            inputs: [expect.objectContaining({ name: 'tekst_soobshcheniya' })],
            outputs: expect.arrayContaining([expect.objectContaining({ name: 'success' })]),
            source: expect.stringContaining('route: "success"'),
          }),
        })
      )
    );
    const payload = createDraft.mock.calls[0][0];
    expect(payload.outputs).toHaveLength(15);
    expect(payload.execution_spec.outputs).toHaveLength(15);
  });

  it('не показывает пользователю raw Pydantic pattern при ошибке сохранения', async () => {
    createDraft.mockRejectedValue(new Error("String should match pattern '^[a-z][a-z0-9_]*$'"));
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Сохранить черновик'));
    const status = await screen.findByText(/Шаг 5 «Выполнение»/);
    expect(status.textContent).toContain('Шаг 5 «Выполнение»');
    expect(status.textContent).toContain('системных идентификаторов');
    expect(status.textContent).not.toContain('pattern');
    expect(status.textContent).not.toContain('^[a-z]');
  });

  it('sanitizes raw maximum-length validation errors', async () => {
    createDraft.mockRejectedValue(new Error('String should have at most 96 characters'));
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Сохранить черновик'));
    const status = await screen.findByText(/Название входа или выхода слишком длинное/);
    expect(status.textContent).toContain('слишком длинное');
    expect(status.textContent).toContain('96');
    expect(status.textContent).not.toContain('String should');
  });

  it('restores current step and preserves multiline JavaScript exactly', async () => {
    const source = `function run(envelope) {
  return {
    outputs: {},
    route: "success",
    logs: []
  };
}`;
    const javascript = savedVersion({
      title: 'Форматированный блок',
      description: 'Тест',
      purpose: 'Тест',
      when_to_use: 'Тест',
      inputs: [],
      outputs: [{ name: 'success', display_name: 'Успех' }],
      config_schema: [],
      connection_rules: { input_count: 1, output_count: 1 },
      runtime_compatibility: 'javascript',
      runtime_definition: { kind: 'javascript' },
      execution_spec: { language: 'javascript', source },
      wizard_step: 4,
    });
    fetchBlock.mockResolvedValue(javascript);
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/custom/41/edit']}>
        <Routes>
          <Route
            path="/dashboard/block-library/custom/:versionId/edit"
            element={<CustomBlockWizardPage />}
          />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Шаг 5 из 9/);
    const sourceInput = screen
      .getByText('Код JavaScript')
      .closest('label')
      ?.querySelector('textarea') as HTMLTextAreaElement;
    expect(sourceInput.value).toBe(source);
    fireEvent.click(screen.getByText('Сохранить черновик'));
    await waitFor(() =>
      expect(updateDraft).toHaveBeenCalledWith(
        41,
        expect.objectContaining({
          wizard_step: 4,
          execution_spec: expect.objectContaining({ source }),
        })
      )
    );
  });

  it('shows the Connections Contract input count in the final summary', () => {
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('wizard-step-4'));
    fireEvent.change(screen.getByLabelText('Выходы'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('wizard-step-9'));
    const inputsLabel = screen.getByText('Входы');
    expect(inputsLabel.parentElement?.textContent).toContain('1');
    expect(screen.getByText(/1 вход\(а\), 15 выход\(а\)/)).toBeTruthy();
  });

  it('восстанавливает JavaScript Execution Specification при reload и не теряет режим при save', async () => {
    const javascript = savedVersion({
      title: 'Маршрутизатор',
      description: 'Тест',
      purpose: 'Маршрутизация',
      when_to_use: 'После ввода',
      category: 'custom',
      inputs: [{ name: 'value' }],
      outputs: Array.from({ length: 15 }, (_, index) => ({
        name: `route_${index + 1}`,
        display_name: `Маршрут ${index + 1}`,
      })),
      config_schema: [],
      connection_rules: { input_count: 1, output_count: 15 },
      runtime_compatibility: 'javascript',
      runtime_definition: { kind: 'javascript' },
      execution_spec: {
        language: 'javascript',
        source: "function run(envelope) { return { outputs: {}, route: 'route_1', logs: [] }; }",
      },
      simulator_compatibility: true,
      supported_channels: [],
      limitations: [],
      examples: [],
      user_guide: { content: 'Инструкция' },
    });
    fetchBlock.mockResolvedValue(javascript);
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/custom/41/edit']}>
        <Routes>
          <Route
            path="/dashboard/block-library/custom/:versionId/edit"
            element={<CustomBlockWizardPage />}
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchBlock).toHaveBeenCalledWith(41));
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByText('Далее'));
    const checkbox = screen.getByLabelText(
      'Выполнять JavaScript в изолированном раннере'
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('function run');

    fireEvent.click(screen.getByText('Сохранить черновик'));
    await waitFor(() =>
      expect(updateDraft).toHaveBeenCalledWith(
        41,
        expect.objectContaining({
          runtime_compatibility: 'javascript',
          execution_spec: expect.objectContaining({
            source: expect.stringContaining('function run'),
          }),
        })
      )
    );
    expect(checkbox.checked).toBe(true);
  });

  it('кнопка «Исправить» открывает новый шаг 5 для ошибки выполнения', async () => {
    validateBlock.mockResolvedValue({
      valid: false,
      errors: ['Шаг 5 «Выполнение»: тестовая ошибка'],
      warnings: ['Шаг 6 «Ограничения»: тестовое предупреждение'],
    });
    render(
      <MemoryRouter>
        <CustomBlockWizardPage />
      </MemoryRouter>
    );
    for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByText('Проверить'));
    await screen.findByText('Исправить');
    expect(screen.getByTestId('wizard-step-5').getAttribute('data-step-status')).toBe('error');
    expect(screen.getByTestId('wizard-step-6').getAttribute('data-step-status')).toBe('normal');
    expect(screen.getByTestId('wizard-step-number-5').textContent).toBe('5');
    expect(screen.getByTestId('wizard-step-error-5')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-number-6').textContent).toBe('6');
    expect(screen.queryByTestId('wizard-step-warning-6')).toBeNull();
    expect(screen.getByTestId('wizard-step-5').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('wizard-step-error-5').textContent).toContain(
      'На этом шаге есть ошибка'
    );
    fireEvent.click(screen.getByText('Исправить'));
    expect(screen.getByText(/Шаг 5 из 9: Как выполняется блок/)).toBeTruthy();
  });

  it('navigates from the publish success state to the existing quick EditorV2 route', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/block-library/create']}>
        <Routes>
          <Route path="/dashboard/block-library/create" element={<CustomBlockWizardPage />} />
          <Route path="/editor" element={<div>Быстрый вход в EditorV2</div>} />
        </Routes>
      </MemoryRouter>
    );
    for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(screen.getByText('Опубликовать'));
    await screen.findByText('Блок успешно опубликован');
    fireEvent.click(screen.getByText('Открыть в редакторе'));
    expect(await screen.findByText('Быстрый вход в EditorV2')).toBeTruthy();
  });
});
