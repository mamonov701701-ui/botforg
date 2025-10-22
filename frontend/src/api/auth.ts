/**
 * Authentication API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post } from './client';

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
  return post('/auth/logout');
}

export function getLoginUrl(provider: 'google' | 'yandex' | 'mailru') {
  const baseURL = import.meta.env.VITE_API_URL || '';
  return `${baseURL}/auth/${provider}/login`;
}

export async function registerEmail(email: string, password: string, name?: string) {
  return post('/auth/register', { email, password, name, role: 'user' });
}

export async function loginEmail(email: string, password: string) {
  const baseURL = import.meta.env.VITE_API_URL || '';
  const url = baseURL ? `${baseURL}/auth/login` : '/auth/login';
  
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username: email,
      password: password,
    }),
  }).then(response => response.json());
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
