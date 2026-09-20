import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';
import type { BlockCatalogItem } from '@/types/blocks';

const customMessage: BlockCatalogItem = {
  id: 'custom:order-confirmation:v1',
  title: 'Подтвердить заказ',
  category: 'custom',
  description: 'Отправляет подтверждение заказа.',
  icon: '🧩',
  color: '#7c3aed',
  planAccess: ['free'],
  permissions: ['viewer'],
  configSchema: [],
  source: 'custom',
  runtimeBlockId: 'message',
  blockVersionId: 17,
};

describe('EditorV2 custom block catalog visibility', () => {
  beforeEach(() => {
    useEditorStore.setState({
      catalog: [customMessage],
      searchQuery: '',
      favoriteBlockIds: [],
      recentBlockIds: [],
    });
  });

  it('keeps a published custom message block visible despite its versioned catalog id', () => {
    useEditorStore.getState().setSearchQuery('подтвердить заказ');

    expect(useEditorStore.getState().getFilteredCatalog()).toEqual([customMessage]);
  });

  it('keeps a custom block in favourites and recent blocks using its runtime contract', () => {
    useEditorStore.setState({
      favoriteBlockIds: [customMessage.id],
      recentBlockIds: [customMessage.id],
    });

    expect(useEditorStore.getState().getFavoriteBlocks()).toEqual([customMessage]);
    expect(useEditorStore.getState().getRecentBlocks()).toEqual([customMessage]);
  });
});
