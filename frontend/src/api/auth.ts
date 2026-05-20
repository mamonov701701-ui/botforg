/**
 * Authentication API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post, put, patch, ApiError, clearGetResponseCache } from './client';

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
  allow_send_text_to_ai?: boolean;
}

export interface SettingsOut {
  profile: ProfileSettingsOut;
  interface: InterfaceSettingsOut;
  notifications: NotificationSettingsOut;
  agent: AgentSettingsOut;
  demo_content_created?: boolean;
}

// Token management
const TOKEN_KEY = 'auth_token';
const AUTH_FETCH_TIMEOUT_MS = 15000;
let meInFlight: Promise<any> | null = null;

async function authJsonRequest(path: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.message || 'Ошибка запроса';
      const d = errorData.detail;
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d) && d[0]?.msg) msg = d[0].msg;
      throw new Error(msg);
    }

    return await response.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверьте соединение и попробуйте снова.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  clearGetResponseCache();
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  clearGetResponseCache();
}

export async function getMe() {
  if (meInFlight) return meInFlight;

  meInFlight = (async () => {
    try {
      return await get('/me');
    } catch (error: any) {
      // Только строгая auth-ошибка превращает пользователя в guest.
      if (error.status === 401 || error.status === 403) {
        clearToken();
        return null;
      }
      throw error;
    }
  })();

  try {
    return await meInFlight;
  } finally {
    meInFlight = null;
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
    const data = await authJsonRequest('/auth/email/register', { email, password, name });
    if (data.access_token) {
      saveToken(data.access_token);
    }
    return data;
  } catch (error: any) {
    throw new Error(error?.message || 'Ошибка регистрации');
  }
}

export async function loginEmail(email: string, password: string) {
  const data = await authJsonRequest('/auth/email/login', {
    email,
    password,
  });
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
  agent?: {
    enabled?: boolean;
    mode?: string;
    data_policy?: string;
    allow_send_text_to_ai?: boolean;
  };
}): Promise<SettingsOut> {
  return put('/me/settings', data);
}
