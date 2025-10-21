/**
 * Blocks API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get } from './client';
import { BlockCatalogItem } from '../types/blocks';

export async function fetchBlocksCatalog(plan?: string, role?: string): Promise<BlockCatalogItem[]> {
  const params = new URLSearchParams();
  if (plan) params.set('plan', plan);
  if (role) params.set('role', role);
  
  const url = `/blocks${params.toString() ? '?' + params : ''}`;
  return get(url);
}

export async function fetchCategories(): Promise<string[]> {
  return get('/blocks/categories');
}
