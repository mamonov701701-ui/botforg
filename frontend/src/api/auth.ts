/**
 * Authentication API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post, put, patch, ApiError } from './client';

// --- Типы для настроек личного кабинета (ответ API: snake_case) ---
export interface ProfileSettingsOut {
  name: string | null;
  email: string;
  language: string;
  timezone: string;
  two_factor_enabled: boolean;
}

export interface InterfaceSettingsOut {
  theme: string;
  density: string;
  font_size: string;
}

export interface NotificationChannelOut {
  bot_errors: boolean;
  payments: boolean;
  team_changes: boolean;
}

export interface NotificationSettingsOut {
  email: NotificationChannelOut;
  telegram: NotificationChannelOut;
}

export interface AgentSettingsOut {
  enabled: boolean;
  mode: string;
  data_policy: string;
}

export interface SettingsOut {
  profile: ProfileSettingsOut;
  interface: InterfaceSettingsOut;
  notifications: NotificationSettingsOut;
  agent: AgentSettingsOut;
}

// Token management
const TOKEN_KEY = 'auth_token';

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function getMe() {
  try {
    return await get('/me');
  } catch (error: any) {
    if (error.status === 401) {
      // Очищаем токен только при 401 на /me - это означает что токен невалидный
      clearToken();
      return null;
    }
    throw error;
  }
}

export async function logout() {
  try {
    await post('/auth/logout');
  } finally {
    clearToken();
  }
}

export function getLoginUrl(provider: 'google' | 'yandex' | 'mailru') {
  // Используем прокси
  return `/auth/${provider}/login`;
}

export async function registerEmail(email: string, password: string, name?: string) {
  try {
    // Используем прямой fetch для регистрации (JSON формат)
    const response = await fetch('/auth/email/register', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.message || 'Ошибка регистрации';
      const d = errorData.detail;
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d) && d[0]?.msg) msg = d[0].msg;
      throw new Error(msg);
    }

    const data = await response.json();
    if (data.access_token) {
      saveToken(data.access_token);
    }
    return data;
  } catch (error: any) {
    throw new Error(error?.message || 'Ошибка регистрации');
  }
}

export async function loginEmail(email: string, password: string) {
  // Используем новый email endpoint
  const url = '/auth/email/login';

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email,
      password: password,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || 'Ошибка входа');
  }

  const data = await response.json();
  if (data.access_token) {
    saveToken(data.access_token);
  }
  return data;
}

export async function requestPasswordReset(email: string) {
  return post('/auth/email/request-reset', { email });
}

export async function resetPassword(token: string, newPassword: string) {
  return post('/auth/email/reset', { token, new_password: newPassword });
}

export async function verifyEmail(token: string) {
  return get(`/auth/email/verify?token=${token}`);
}

// --- 152-ФЗ: юридические документы и согласия ---

export interface LegalDocOut {
  version: string;
  text: string;
}

export interface LegalDocsResponse {
  privacy_policy: LegalDocOut;
  terms: LegalDocOut;
  consent_text: LegalDocOut;
}

export async function getLegalDocs(): Promise<LegalDocsResponse> {
  return get('/legal/docs');
}

export async function getConsentStatus(): Promise<{
  accepted: { doc_type: string; doc_version: string; accepted_at: string }[];
}> {
  return get('/legal/consent/status');
}

export async function acceptConsent(docType: string, docVersion: string): Promise<{ ok: boolean }> {
  return post('/legal/consent', { doc_type: docType, doc_version: docVersion });
}

// --- Настройки личного кабинета ---

export async function getSettings(): Promise<SettingsOut> {
  return get('/me/settings');
}

export async function updateMe(data: { name?: string | null }): Promise<void> {
  await patch('/me', data);
}

export async function updateSettings(data: {
  profile?: {
    name?: string | null;
    language?: string;
    timezone?: string;
    two_factor_enabled?: boolean;
  };
  interface?: { theme?: string; density?: string; font_size?: string };
  notifications?: {
    email?: { bot_errors?: boolean; payments?: boolean; team_changes?: boolean };
    telegram?: { bot_errors?: boolean; payments?: boolean; team_changes?: boolean };
  };
  agent?: { enabled?: boolean; mode?: string; data_policy?: string };
}): Promise<SettingsOut> {
  return put('/me/settings', data);
}
