import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ resetPassword: vi.fn() }));
vi.mock('@/api/auth', () => ({ resetPassword: auth.resetPassword }));
import ResetPassword from '@/features/auth/ResetPassword';

beforeEach(() => {
  auth.resetPassword.mockReset();
  window.history.replaceState(null, '', '/auth/reset#token=isolated-test-token');
});

describe('Stage 8 password recovery page', () => {
  it('does not consume the link for mismatched fields, then submits once', async () => {
    auth.resetPassword.mockResolvedValue({ message: 'ok' });
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    );
    expect(window.location.hash).toBe('');
    fireEvent.change(screen.getByPlaceholderText('Новый пароль'), {
      target: { value: 'FirstPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Подтвердите пароль'), {
      target: { value: 'OtherPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
    expect(screen.getByText('❌ Пароли не совпадают')).toBeVisible();
    expect(auth.resetPassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Подтвердите пароль'), {
      target: { value: 'FirstPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
    await waitFor(() => expect(auth.resetPassword).toHaveBeenCalledOnce());
    expect(auth.resetPassword).toHaveBeenCalledWith('isolated-test-token', 'FirstPass123!');
    expect(screen.getByRole('button', { name: 'Изменить пароль' })).toBeDisabled();
  });
});
