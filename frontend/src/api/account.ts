import { del, get, patch, post, put } from './client';
import { getToken } from './auth';

export interface AccountProfile {
  public_id: number;
  name: string | null;
  username: string | null;
  email: string;
  email_verified: boolean;
  pending_email: string | null;
  phone: string | null;
  phone_verified: boolean;
  date_of_birth: string | null;
  avatar: string | null;
}

export interface AccountSession {
  id: string;
  current: boolean;
  client: string;
  created_at: string;
  last_seen_at: string;
}

export const getAccountProfile = (): Promise<AccountProfile> => get('/me');
export const saveAccountProfile = (
  name: string,
  dateOfBirth: string | null
): Promise<AccountProfile> => patch('/me', { name, date_of_birth: dateOfBirth });
export const claimUsername = (username: string): Promise<AccountProfile> =>
  post('/me/username', { username });
export const savePhone = (phone: string): Promise<AccountProfile> => put('/me/phone', { phone });
export const removePhone = (): Promise<AccountProfile> => del('/me/phone');
export const requestEmailChange = (newEmail: string, currentPassword: string) =>
  post('/api/user/security/change-email', {
    new_email: newEmail,
    current_password: currentPassword,
  });
export const changeAccountPassword = (currentPassword: string, newPassword: string) =>
  post('/api/user/security/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
export const listAccountSessions = (): Promise<AccountSession[]> =>
  get('/api/user/security/sessions');
export const revokeAccountSession = (id: string) =>
  del(`/api/user/security/sessions/${encodeURIComponent(id)}`);
export const revokeOtherSessions = () => post('/api/user/security/sessions/revoke-others');
export const setupTotp = (password: string): Promise<{ secret: string; otpauth_uri: string }> =>
  post('/api/user/security/totp/setup', { password });
export const confirmTotp = (code: string): Promise<{ backup_codes: string[] }> =>
  post('/api/user/security/totp/confirm', { code });
export const cancelTotpSetup = () => post('/api/user/security/totp/cancel');
export const disableTotp = (password: string, code: string) =>
  post('/api/user/security/totp/disable', { current_password: password, code });
export const getDeletionRequest = (): Promise<{ status: string; requested_at: string | null }> =>
  get('/privacy/deletion-request');
export const requestAccountDeletion = (password: string, code?: string) =>
  post('/privacy/delete', { current_password: password, two_factor_code: code || null });
export const exportAccountData = () => post('/privacy/export');
export const getOptionalConsents = (): Promise<{ advertising_consent: boolean }> =>
  get('/privacy/optional-consents');
export const setAdvertisingConsent = (
  accepted: boolean
): Promise<{ advertising_consent: boolean }> =>
  post('/privacy/optional-consents/advertising', { accepted });

export async function uploadAvatar(file: File): Promise<AccountProfile> {
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const response = await fetch('/me/avatar', {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось загрузить аватар');
  }
  return response.json();
}

export const removeAvatar = (): Promise<AccountProfile> => del('/me/avatar');
