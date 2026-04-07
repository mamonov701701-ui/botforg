import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import {
  collectLocalInputVariables,
  getVariableDisplayWithKey,
  mergeVariableSuggestions,
  toUserVariableName,
} from '@/utils/scenarioVariableSuggestions';

describe('scenarioVariableSuggestions', () => {
  it('collects local variables from input blocks', () => {
    const nodes = [
      {
        id: 'n1',
        data: {
          blockId: 'input',
          settings: {
            variable_key: 'city',
            variable_label: 'Город',
            validation: { type: 'string' },
          },
        },
      },
    ] as unknown as Node[];
    const local = collectLocalInputVariables(nodes);
    expect(local).toHaveLength(1);
    expect(local[0].key).toBe('city');
    expect(local[0].label).toBe('Город');
  });

  it('keeps local variables when backend unavailable', () => {
    const merged = mergeVariableSuggestions(
      [
        {
          key: 'phone',
          label: 'Телефон',
          data_type: 'phone',
          is_system: false,
          scope: null,
          source: 'local',
        },
      ],
      []
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe('phone');
    expect(merged[0].label).toBe('Телефон');
  });

  it('deduplicates local/backend items by key with local label priority', () => {
    const merged = mergeVariableSuggestions(
      [
        {
          key: 'name',
          label: 'Имя',
          data_type: 'string',
          is_system: false,
          scope: null,
          source: 'local',
        },
      ],
      [
        {
          key: 'name',
          label: 'Name backend',
          data_type: 'string',
          is_system: false,
          scope: null,
        },
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe('name');
    expect(merged[0].label).toBe('Имя');
  });

  it('builds message list text as "label -> {{key}}"', () => {
    const text = getVariableDisplayWithKey({ key: 'roldr', label: 'Число из прошлого' });
    expect(text).toBe('Число из прошлого → {{roldr}}');
  });

  it('falls back to humanized key when label is missing', () => {
    expect(toUserVariableName({ key: 'user_city_name', label: null })).toBe('City name');
    expect(getVariableDisplayWithKey({ key: 'user_city_name', label: null })).toBe(
      'City name → {{user_city_name}}'
    );
  });
});
