import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SettingsPage from '@/features/dashboard/pages/SettingsPage';
import AccountLegalPage from '@/features/dashboard/pages/AccountLegalPage';

const mocks = vi.hoisted(() => ({
  getAccountProfile: vi.fn(),
  getSettings: vi.fn(),
  listAccountSessions: vi.fn(),
  getDeletionRequest: vi.fn(),
  getOptionalConsents: vi.fn(),
  getLegalAccountOverview: vi.fn(),
}));

vi.mock('@/api/account', () => ({
  getAccountProfile: mocks.getAccountProfile,
  listAccountSessions: mocks.listAccountSessions,
  getDeletionRequest: mocks.getDeletionRequest,
  getOptionalConsents: mocks.getOptionalConsents,
}));
vi.mock('@/api/auth', () => ({ getSettings: mocks.getSettings }));
vi.mock('@/api/legal', () => ({ getLegalAccountOverview: mocks.getLegalAccountOverview }));

describe('Stage 8 legal navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountProfile.mockResolvedValue({
      name: 'QA',
      date_of_birth: null,
      phone: null,
      public_id: 'BF-QA',
      email: 'qa@example.com',
      email_verified: true,
    });
    mocks.getSettings.mockResolvedValue({
      profile: { two_factor_enabled: false },
      interface: { theme: 'system', density: 'comfortable', font_size: 'medium' },
      agent: {
        enabled: false,
        mode: 'advisor',
        data_policy: 'minimal',
        allow_send_text_to_ai: false,
      },
    });
    mocks.listAccountSessions.mockResolvedValue([]);
    mocks.getDeletionRequest.mockResolvedValue({ status: 'none' });
    mocks.getOptionalConsents.mockResolvedValue({ advertising_consent: false });
    mocks.getLegalAccountOverview.mockResolvedValue({
      current_documents: [
        {
          id: 1,
          doc_type: 'public_offer',
          slug: 'public-offer',
          version: '1.2',
          status: 'published',
          title: 'Публичная оферта',
          content_sha256: '',
          published_at: '2026-10-10T00:00:00Z',
          archived_at: null,
        },
      ],
      archived_documents: [],
      accepted: [],
      purchase_snapshots: [],
      consent_history: [
        {
          doc_type: 'public_offer',
          doc_version: '1.2',
          accepted_at: '2026-10-10T12:00:00Z',
          revision_id: 1,
          confirmation_result: 'accepted',
        },
      ],
    });
  });

  it('opens real account documents and consent history from Settings', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/settings']}>
        <Routes>
          <Route path="/dashboard/settings" element={<SettingsPage />} />
          <Route path="/dashboard/account/legal" element={<AccountLegalPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole('button', { name: 'Конфиденциальность' }));
    fireEvent.click(screen.getByRole('button', { name: 'Конфиденциальность' }));
    const link = screen.getByRole('link', {
      name: /Открыть действующие условия и историю согласий/,
    });
    expect(link.getAttribute('href')).toBe('/dashboard/account/legal');
    fireEvent.click(link);
    await waitFor(() => screen.getByTestId('account-legal-active-list'));
    expect(screen.getByTestId('account-legal-consent-history')).toHaveTextContent('Принято');
    expect(screen.getByTestId('account-legal-read-public-offer')).toHaveAttribute(
      'href',
      '/dashboard/account/legal/public-offer'
    );
  });

  it('restores the security tab from URL and keeps reauthentication fields separate', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/settings?tab=security']}>
        <Routes>
          <Route path="/dashboard/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeVisible()
    );
    const emailPassword = screen.getByLabelText('Текущий пароль', { selector: '#email-password' });
    fireEvent.change(emailPassword, { target: { value: 'private-value' } });
    expect(screen.getByLabelText('Текущий пароль', { selector: '#password-current' })).toHaveValue(
      ''
    );
    fireEvent.click(screen.getByRole('button', { name: 'Конфиденциальность' }));
    expect(screen.getByRole('heading', { name: 'Ваши данные' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Безопасность' }));
    expect(screen.getByLabelText('Текущий пароль', { selector: '#email-password' })).toHaveValue(
      ''
    );
  });
});
