/**
 * Authentication API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post } from './client';

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
  const baseURL = import.meta.env.VITE_API_URL || '';
  return `${baseURL}/auth/${provider}/login`;
}

export async function registerEmail(email: string, password: string, name?: string) {
  const response = await post('/auth/register', { email, password, name, role: 'user' });
  if (response.access_token) {
    saveToken(response.access_token);
  }
  return response;
}

export async function loginEmail(email: string, password: string) {
  const baseURL = import.meta.env.VITE_API_URL || '';
  const url = baseURL ? `${baseURL}/auth/login` : '/auth/login';
  
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
