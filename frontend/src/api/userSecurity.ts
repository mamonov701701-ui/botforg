/**
 * API для управления безопасностью пользователя
 */
import api from './client';

export interface ChangeEmailRequest {
  new_email: string;
  current_password: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

/**
 * Изменить email
 */
export async function changeEmail(data: ChangeEmailRequest): Promise<void> {
  await api.post('/api/user/security/change-email', data);
}

/**
 * Изменить пароль
 */
export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await api.post('/api/user/security/change-password', data);
}

/**
 * Проверить текущий пароль
 */
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    await api.post('/api/user/security/verify-password', { password });
    return true;
  } catch {
    return false;
  }
}
