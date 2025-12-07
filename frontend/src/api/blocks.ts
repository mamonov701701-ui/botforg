/**
 * Blocks API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get } from './client';
import { BlockCatalogItem } from '../types/blocks';

export async function fetchBlocksCatalog(
  plan?: string,
  role?: string
): Promise<BlockCatalogItem[]> {
  // Параметры plan и role теперь игнорируются на бэкенде
  // Бэкенд автоматически использует данные авторизованного пользователя
  // Оставляем параметры для обратной совместимости, но они не используются
  const url = '/blocks';
  return get(url);
}

export async function fetchCategories(): Promise<string[]> {
  return get('/blocks/categories');
}
