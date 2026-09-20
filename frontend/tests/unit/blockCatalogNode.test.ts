import { describe, expect, it } from 'vitest';
import {
  catalogBlockDefaultSettings,
  catalogBlockRuntimeId,
  customBlockNodeSnapshot,
} from '@/utils/blockCatalogNode';
import type { BlockCatalogItem } from '@/types/blocks';

const custom: BlockCatalogItem = {
  id: 'custom:confirm:v2',
  title: 'Подтверждение',
  category: 'custom',
  description: 'Описание',
  icon: '🧩',
  color: '#7c3aed',
  planAccess: ['free'],
  permissions: ['viewer'],
  source: 'custom',
  runtimeBlockId: 'message',
  stableBlockId: 'confirm',
  blockVersionId: 42,
  version: 2,
  passport: { purpose: 'Подтвердить' },
  userGuide: { content: 'Инструкция v2' },
  configSchema: [
    { name: 'text', type: 'text', label: 'Текст сообщения', required: true, default: 'Готово' },
  ],
};

describe('EditorV2 custom block snapshot', () => {
  it('stores the exact immutable version while executing the reviewed message contract', () => {
    expect(catalogBlockRuntimeId(custom)).toBe('message');
    expect(customBlockNodeSnapshot(custom)).toEqual({
      customBlockVersionId: 42,
      customBlockStableId: 'confirm',
      customBlockVersion: 2,
      customBlockTitle: 'Подтверждение',
      customBlockPassport: { purpose: 'Подтвердить' },
      customBlockUserGuide: { content: 'Инструкция v2' },
    });
    expect(catalogBlockDefaultSettings(custom)).toEqual({ text: 'Готово' });
  });
});
