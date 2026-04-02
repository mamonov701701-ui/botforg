/**
 * Blocks API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get } from './client';
import { BlockCatalogItem } from '../types/blocks';

import { apiOrigin } from './devApiOrigin';

/** Каталог блоков: в dev — только прокси Vite; в prod — VITE_API_URL при необходимости. */
function resolveLearnCatalogUrl(): string {
  const base = apiOrigin();
  if (base) {
    return `${base}/blocks/learn-catalog`;
  }
  return '/blocks/learn-catalog';
}

/**
 * Полный каталог для страницы обучения (публичный endpoint).
 * Отдельный fetch: без обязательной авторизации и с понятными логами [Blocks].
 */
export async function fetchBlocksLearnCatalog(): Promise<BlockCatalogItem[]> {
  const url = resolveLearnCatalogUrl();
  console.log('[Blocks] loading...', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.log('[Blocks] response:', response.status, response.statusText, response.ok);

    if (!response.ok) {
      const err = new Error(`learn-catalog HTTP ${response.status}`);
      console.error('[Blocks] failed:', err);
      throw err;
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      console.error('[Blocks] failed: body is not an array', data);
      throw new Error('learn-catalog: invalid JSON');
    }

    console.log('[Blocks] loaded items:', data.length);
    return data as BlockCatalogItem[];
  } catch (error) {
    console.error('[Blocks] failed:', error);
    throw error;
  }
}

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
