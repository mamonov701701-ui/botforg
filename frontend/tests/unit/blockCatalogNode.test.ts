import { describe, expect, it } from 'vitest';
import {
  catalogBlockDefaultSettings,
  catalogBlockRuntimeId,
  customBlockNodeSnapshot,
  resolveNodeCatalogBlock,
} from '@/utils/blockCatalogNode';
import type { BlockCatalogItem } from '@/types/blocks';
import type { Edge, Node } from 'reactflow';
import { validateAllNodesWithSchema } from '@/utils/schemaValidation';
import { validateScenarioConsistency } from '@/utils/scenarioConsistency';

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

  it('resolves a persisted exact JavaScript version from its snapshot without the new-use catalog', () => {
    const outputs = Array.from({ length: 15 }, (_, index) => ({
      name: index === 0 ? 'success' : `route_${index + 1}`,
      display_name: index === 0 ? 'Успех' : `Маршрут ${index + 1}`,
    }));
    const javascript: BlockCatalogItem = {
      ...custom,
      id: 'custom:router:v3',
      title: 'Маршрутизатор',
      stableBlockId: 'router',
      blockVersionId: 43,
      version: 3,
      runtimeBlockId: 'custom',
      configSchema: [],
      passport: {
        stable_block_id: 'router',
        version: 3,
        title_ru: 'Маршрутизатор',
        description: 'Выбирает точный маршрут.',
        config_schema: [],
        connection_rules: { input_count: 1, output_count: 15 },
        outputs,
      },
    };
    const persistedData = JSON.parse(
      JSON.stringify({
        blockId: 'custom',
        ...customBlockNodeSnapshot(javascript),
        title: javascript.title,
        icon: javascript.icon,
        color: javascript.color,
        settings: {},
      })
    );
    const resolved = resolveNodeCatalogBlock([], persistedData);
    expect(resolved).toMatchObject({
      id: 'custom:router:v3',
      source: 'custom',
      blockVersionId: 43,
      version: 3,
      runtimeBlockId: 'custom',
    });
    expect(resolved?.passport?.outputs as unknown[]).toHaveLength(15);

    const node = {
      id: 'custom-node',
      type: 'default',
      position: { x: 0, y: 0 },
      data: persistedData,
    } as Node;
    expect(validateAllNodesWithSchema([node], [])[0]).toMatchObject({ isValid: true });
    expect(validateScenarioConsistency([node], [], []).some(d => d.severity === 'error')).toBe(
      false
    );
  });

  it('validates Start → exact Custom Block → Message with a named route', () => {
    const outputs = [
      { name: 'success', display_name: 'Успех' },
      { name: 'error', display_name: 'Ошибка' },
    ];
    const nodes = [
      {
        id: 'start',
        type: 'default',
        position: { x: 0, y: 0 },
        data: { blockId: 'start', title: 'Начало', settings: {} },
      },
      {
        id: 'custom',
        type: 'default',
        position: { x: 0, y: 100 },
        data: {
          blockId: 'custom',
          title: 'Маршрутизатор',
          settings: {},
          customBlockVersionId: 43,
          customBlockStableId: 'router',
          customBlockVersion: 3,
          customBlockPassport: {
            stable_block_id: 'router',
            version: 3,
            title_ru: 'Маршрутизатор',
            config_schema: [],
            connection_rules: { input_count: 1, output_count: 2 },
            outputs,
          },
        },
      },
      {
        id: 'message',
        type: 'default',
        position: { x: 200, y: 100 },
        data: { blockId: 'message', title: 'Сообщение', settings: { text: 'Готово' } },
      },
    ] as Node[];
    const edges = [
      {
        id: 'start-custom',
        source: 'start',
        target: 'custom',
        sourceHandle: 'bottom',
        targetHandle: 'top',
      },
      { id: 'custom-success', source: 'custom', target: 'message', sourceHandle: 'success' },
    ] as Edge[];
    const catalog = [
      {
        ...custom,
        id: 'start',
        title: 'Начало',
        source: 'system',
        runtimeBlockId: 'start',
        configSchema: [],
      },
      {
        ...custom,
        id: 'message',
        title: 'Сообщение',
        source: 'system',
        runtimeBlockId: 'message',
        configSchema: [],
      },
    ] as BlockCatalogItem[];
    expect(
      validateScenarioConsistency(nodes, edges, catalog).filter(item => item.severity === 'error')
    ).toEqual([]);
  });
});
