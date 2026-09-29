import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Node } from 'reactflow';
import { beforeEach, describe, expect, it } from 'vitest';

import BlockSettingsPanel from '@/features/editorV2/BlockSettingsPanel';
import { useEditorStore } from '@/stores/editorStore';

const exactNode: Node = {
  id: 'custom-node',
  type: 'default',
  position: { x: 0, y: 0 },
  data: {
    blockId: 'custom',
    title: 'Маршрутизатор',
    icon: '🧩',
    color: '#7c3aed',
    settings: {},
    customBlockVersionId: 43,
    customBlockStableId: 'router',
    customBlockVersion: 3,
    customBlockTitle: 'Маршрутизатор',
    customBlockPassport: {
      stable_block_id: 'router',
      version: 3,
      title_ru: 'Маршрутизатор',
      description: 'Выбирает один из маршрутов.',
      config_schema: [],
      connection_rules: { input_count: 1, output_count: 15 },
      outputs: Array.from({ length: 15 }, (_, index) => ({
        name: index === 0 ? 'success' : `route_${index + 1}`,
        display_name: index === 0 ? 'Успех' : `Маршрут ${index + 1}`,
      })),
    },
    customBlockUserGuide: { content: 'Версионная инструкция.' },
  },
};

beforeEach(() => {
  useEditorStore.setState({ catalog: [] });
});

describe('EditorV2 exact custom block settings', () => {
  it('uses the persisted exact-version contract when the version is absent from the new-use catalog', () => {
    render(
      <BlockSettingsPanel
        selectedNode={exactNode}
        onClose={() => undefined}
        onUpdateNode={() => undefined}
      />
    );

    expect(screen.queryByText('Блок не найден')).not.toBeInTheDocument();
    expect(screen.getByText('Маршрутизатор')).toBeInTheDocument();
    expect(
      screen.getByText('Для этого блока дополнительные настройки не требуются')
    ).toBeInTheDocument();
    expect(screen.getByText('Блок использует контракт своей версии')).toBeInTheDocument();
  });
});
