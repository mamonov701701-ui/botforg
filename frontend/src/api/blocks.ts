/**
 * Blocks API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { del, get, post, put } from './client';
import { BlockCatalogItem, CustomBlockDraftPayload, CustomBlockVersion } from '../types/blocks';

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

/** Полный read-only каталог для платформенной админки. */
export async function fetchAdminBlocksCatalog(): Promise<BlockCatalogItem[]> {
  return get('/blocks/admin-catalog');
}

export async function fetchCategories(): Promise<string[]> {
  return get('/blocks/categories');
}

export const fetchMyCustomBlocks = (): Promise<CustomBlockVersion[]> => get('/blocks/custom/mine');
export const fetchAllCustomBlocksAdmin = (): Promise<CustomBlockVersion[]> =>
  get('/blocks/custom/admin');
export const fetchCustomBlock = (id: number): Promise<CustomBlockVersion> =>
  get(`/blocks/custom/${id}`);
export const createCustomBlockDraft = (
  payload: CustomBlockDraftPayload
): Promise<CustomBlockVersion> => post('/blocks/custom/drafts', payload);
export const updateCustomBlockDraft = (
  id: number,
  payload: CustomBlockDraftPayload
): Promise<CustomBlockVersion> => put(`/blocks/custom/${id}`, payload);
export const validateCustomBlock = (
  id: number
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> =>
  post(`/blocks/custom/${id}/validate`, {});
export const publishCustomBlock = (id: number): Promise<CustomBlockVersion> =>
  post(`/blocks/custom/${id}/publish`, {});
export const createCustomBlockVersion = (id: number): Promise<CustomBlockVersion> =>
  post(`/blocks/custom/${id}/versions`, {});
export const archiveCustomBlock = (id: number): Promise<CustomBlockVersion> =>
  post(`/blocks/custom/${id}/archive`, {});
export const restoreCustomBlock = (id: number): Promise<CustomBlockVersion> =>
  post(`/blocks/custom/${id}/restore`, {});
export const deleteCustomBlockDraft = (id: number): Promise<void> => del(`/blocks/custom/${id}`);
