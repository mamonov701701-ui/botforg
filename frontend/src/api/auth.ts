/**
 * Authentication API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post, ApiError } from './client';

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
    const response = await fetch('/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name, role: 'user' }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || 'Ошибка регистрации');
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
  // Всегда используем прокси для надёжности
  const url = '/auth/login';

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username: email,
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
