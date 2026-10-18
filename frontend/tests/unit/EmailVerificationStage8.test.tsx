import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const emailApi = vi.hoisted(() => ({ preview: vi.fn(), verify: vi.fn() }));
vi.mock('@/api/auth', () => ({
  previewEmailVerification: emailApi.preview,
  verifyEmail: emailApi.verify,
}));
import VerifyEmail from '@/features/auth/VerifyEmail';

beforeEach(() => {
  emailApi.preview.mockReset();
  emailApi.verify.mockReset();
  window.history.replaceState(null, '', '/auth/verify#token=sample-token');
});

describe('two-step email verification', () => {
  it('previews without consuming the link and requires a click to confirm', async () => {
    emailApi.preview.mockResolvedValue({ status: 'ready' });
    emailApi.verify.mockResolvedValue({ message: 'Адрес подтверждён' });
    render(
      <MemoryRouter>
        <VerifyEmail />
      </MemoryRouter>
    );

    const button = await screen.findByRole('button', { name: 'Подтвердить адрес' });
    expect(emailApi.preview).toHaveBeenCalledWith('sample-token');
    expect(emailApi.verify).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');

    fireEvent.click(button);
    await waitFor(() => expect(emailApi.verify).toHaveBeenCalledWith('sample-token'));
    expect(await screen.findByText('Адрес подтверждён. Теперь войдите в аккаунт.')).toBeTruthy();
  });

  it('does not show a confirmation action for an expired link', async () => {
    emailApi.preview.mockRejectedValue(new Error('expired'));
    render(
      <MemoryRouter>
        <VerifyEmail />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('Ссылка недействительна или срок её действия истёк.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подтвердить адрес' })).toBeNull();
    expect(emailApi.verify).not.toHaveBeenCalled();
  });
});
