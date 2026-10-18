import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PasswordField from '@/components/PasswordField';
import AuthModal from '@/features/auth/AuthModal';
import { useUiStore } from '@/stores/uiStore';

function Fields({ showSecond = true }: { showSecond?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <>
      <PasswordField
        id="current"
        label="Текущий пароль"
        value={current}
        onChange={event => setCurrent(event.target.value)}
        autoComplete="current-password"
      />
      {showSecond && (
        <PasswordField
          id="next"
          label="Новый пароль"
          value={next}
          onChange={event => setNext(event.target.value)}
          autoComplete="new-password"
        />
      )}
    </>
  );
}

describe('Stage 8 password visibility', () => {
  it('keeps values and each field visibility independent', () => {
    const { rerender } = render(<Fields />);
    const current = screen.getByLabelText('Текущий пароль') as HTMLInputElement;
    const next = screen.getByLabelText('Новый пароль') as HTMLInputElement;
    expect(current.type).toBe('password');
    expect(next.type).toBe('password');
    fireEvent.change(current, { target: { value: 'CurrentPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать текущий пароль' }));
    expect(current.type).toBe('text');
    expect(current.value).toBe('CurrentPass123!');
    expect(next.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Скрыть текущий пароль' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть текущий пароль' }));
    expect(current.type).toBe('password');
    rerender(<Fields showSecond={false} />);
    rerender(<Fields />);
    expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('type', 'password');
  });

  it('preserves focus, caret and keyboard operation when toggled', async () => {
    render(<Fields />);
    const current = screen.getByLabelText('Текущий пароль') as HTMLInputElement;
    fireEvent.change(current, { target: { value: 'CurrentPass123!' } });
    current.focus();
    current.setSelectionRange(3, 7);
    const toggle = screen.getByRole('button', { name: 'Показать текущий пароль' });
    toggle.focus();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(current).toHaveFocus();
      expect(current.selectionStart).toBe(3);
      expect(current.selectionEnd).toBe(7);
    });
  });

  it('hides and clears the login password after closing the same modal instance', async () => {
    act(() => useUiStore.getState().openAuth());
    render(
      <MemoryRouter>
        <AuthModal />
      </MemoryRouter>
    );
    const password = screen.getByPlaceholderText('Пароль') as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'TemporaryPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(password.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    act(() => useUiStore.getState().openAuth());
    const reopened = (await screen.findByPlaceholderText('Пароль')) as HTMLInputElement;
    expect(reopened.type).toBe('password');
    expect(reopened.value).toBe('');
    act(() => useUiStore.getState().closeAuth());
  });
});
