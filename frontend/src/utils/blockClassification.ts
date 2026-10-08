import type { BlockCatalogItem } from '../types/blocks';

export type BlockType = 'basic' | 'system' | 'custom';

export const BLOCK_TYPE_ORDER: BlockType[] = ['basic', 'system', 'custom'];
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  basic: 'Базовые',
  system: 'Системные',
  custom: 'Кастомные',
};

/** Type is distinct from a user's relationship to a block. */
export function blockType(block: BlockCatalogItem): BlockType {
  if (block.source === 'custom' || block.blockVersionId != null || block.category === 'custom')
    return 'custom';
  if (block.category === 'system') return 'system';
  return 'basic';
}

export function customAccessSourceLabel(block: BlockCatalogItem): string {
  switch (block.accessSource) {
    case 'owner':
      return 'Мой блок';
    case 'marketplace':
      return 'Получено из Маркета';
    case 'direct_grant':
      return 'Получено напрямую';
    default:
      return 'Источник не установлен';
  }
}
