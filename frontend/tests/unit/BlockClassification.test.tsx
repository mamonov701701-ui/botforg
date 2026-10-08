import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BlockCatalogItem } from '@/types/blocks';
import { blockType, customAccessSourceLabel } from '@/utils/blockClassification';
import { mergeClientCatalogBlocks } from '@/constants/clientCatalogMerge';
import { useEditorStore } from '@/stores/editorStore';
import { useAuthStore } from '@/stores/authStore';
import BlockLibraryModal from '@/features/editorV2/BlockLibraryModal';

const base: BlockCatalogItem = {
  id: 'message',
  title: 'Сообщение',
  category: 'basic',
  description: 'Текст',
  icon: '💬',
  color: '#336699',
  planAccess: ['free'],
  permissions: ['viewer'],
  configSchema: [],
};
const system: BlockCatalogItem = {
  ...base,
  id: 'internal',
  title: 'Служебный',
  category: 'system',
  runtimeBlockId: 'message',
};
const custom: BlockCatalogItem = {
  ...base,
  id: 'custom:key:v2',
  title: 'Блок автора',
  category: 'custom',
  source: 'custom',
  blockVersionId: 42,
  version: 2,
  authorName: 'Саша',
  accessSource: 'marketplace',
  runtimeBlockId: 'message',
};

describe('shared Block Library classification', () => {
  beforeEach(() => {
    useAuthStore.getState().setUser(null);
    useEditorStore.setState({ catalog: [base, system, custom], searchQuery: '' });
  });

  it('keeps functional category and type separate across platform and custom blocks', () => {
    expect(mergeClientCatalogBlocks([custom])[0].category).toBe('custom');
    expect([base, system, custom].map(blockType)).toEqual(['basic', 'system', 'custom']);
    expect(customAccessSourceLabel({ ...custom, accessSource: 'owner' })).toBe('Мой блок');
    expect(customAccessSourceLabel({ ...custom, accessSource: 'direct_grant' })).toBe(
      'Получено напрямую'
    );
  });

  it('shows three tabs, custom metadata, and preserves exact version on add', () => {
    const onAddBlock = vi.fn();
    render(<BlockLibraryModal isOpen onClose={vi.fn()} onAddBlock={onAddBlock} />);
    expect(screen.getByText('Базовые')).toBeTruthy();
    expect(screen.getByText('Системные')).toBeTruthy();
    fireEvent.click(screen.getByText('Системные'));
    expect(screen.getByText('Служебный')).toBeTruthy();
    expect(screen.queryByText('Блок автора')).toBeNull();
    fireEvent.click(screen.getByText('Кастомные'));
    expect(screen.getByText('Блок автора')).toBeTruthy();
    expect(screen.getByText(/v2 · Саша · Получено из Маркета/)).toBeTruthy();
    expect(screen.queryByText('Сообщение')).toBeNull();
    fireEvent.click(screen.getByText('Блок автора'));
    expect(onAddBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockVersionId: 42, version: 2 })
    );
  });

  it('searches across types without reclassifying custom blocks', () => {
    render(<BlockLibraryModal isOpen onClose={vi.fn()} onAddBlock={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Найти блок...'), {
      target: { value: 'Блок автора' },
    });
    expect(screen.getByText('Блок автора')).toBeTruthy();
    expect(blockType(custom)).toBe('custom');
  });
});
