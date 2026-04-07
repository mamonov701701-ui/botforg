import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { InputBlockSettingsForm } from '@/features/editorV2/BlockSettingsPanel/InputBlockSettingsForm';

function Harness() {
  const [settings, setSettings] = React.useState<Record<string, unknown>>({
    question_text: '',
    variable_label: '',
    variable_key: '',
    variable_key_manual: false,
    required: true,
    trim: true,
    validation: { type: 'string' },
    separate_error_branch: false,
  });
  const [tick, setTick] = React.useState(0);

  return (
    <div>
      <button onClick={() => setTick(v => v + 1)}>rerender-{tick}</button>
      <InputBlockSettingsForm
        settings={settings}
        isReadOnly={false}
        onFieldChange={(field, value) => {
          setSettings(prev => ({ ...prev, [field]: value }));
        }}
        onSettingsPatch={patch => {
          setSettings(prev => ({ ...prev, ...patch }));
        }}
      />
    </div>
  );
}

describe('InputBlockSettingsForm UX variable binding', () => {
  it('updates "Название ответа" on typing', () => {
    render(<Harness />);
    const nameInput = screen.getByPlaceholderText('Например: Имя') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Телефон' } });
    expect(nameInput.value).toBe('Телефон');
  });

  it('autogenerates variable_key from variable_label when manual=false', () => {
    render(<Harness />);
    const nameInput = screen.getByPlaceholderText('Например: Имя') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'г' } });
    fireEvent.change(nameInput, { target: { value: 'го' } });
    fireEvent.change(nameInput, { target: { value: 'гор' } });
    fireEvent.change(nameInput, { target: { value: 'горо' } });
    fireEvent.change(nameInput, { target: { value: 'город' } });
    expect(nameInput.value).toBe('город');

    fireEvent.click(screen.getByRole('button', { name: /Дополнительные настройки/i }));
    const sysInput = screen.getByPlaceholderText('Например: city') as HTMLInputElement;
    expect(sysInput.value).toBe('gorod');
  });

  it('does not overwrite variable_key when manual=true', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Дополнительные настройки/i }));
    const sysInput = screen.getByPlaceholderText('Например: city') as HTMLInputElement;

    fireEvent.change(sysInput, { target: { value: 'custom_key' } });
    const manualToggle = screen.getByLabelText('Изменять вручную') as HTMLInputElement;
    expect(manualToggle.checked).toBe(true);

    const nameInput = screen.getByPlaceholderText('Например: Имя') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Имя клиента' } });
    expect(sysInput.value).toBe('custom_key');
  });

  it('shows updated helper texts in advanced settings', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Дополнительные настройки/i }));
    expect(screen.getByText('Используется для подстановки ответа в сообщениях')).toBeTruthy();
    expect(screen.getByText('Автоматически очищать пробелы')).toBeTruthy();
    expect(screen.getByText(/Ограничение длины ответа пользователя/i)).toBeTruthy();
    expect(screen.getByText(/Дополнительная проверка \(для опытных пользователей\)/i)).toBeTruthy();
  });

  it('keeps variable_label after unrelated rerender', () => {
    render(<Harness />);
    const nameInput = screen.getByPlaceholderText('Например: Имя') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Город' } });
    fireEvent.click(screen.getByRole('button', { name: /rerender-/i }));
    expect(nameInput.value).toBe('Город');
  });
});
