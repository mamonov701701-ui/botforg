import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { validateScenarioConsistency } from '@/utils/scenarioConsistency';
import type { BlockCatalogItem } from '@/types/blocks';

const conditionBlock: BlockCatalogItem = {
  id: 'condition',
  title: 'Условие',
  category: 'basic',
  description: 'Проверяет условие',
  icon: '🔀',
  color: '#8B5CF6',
  planAccess: ['free', 'pro', 'enterprise'],
  permissions: ['owner', 'admin', 'manager_template', 'developer', 'support', 'viewer'],
  configSchema: [],
};

function conditionNode(settings: Record<string, unknown>): Node {
  return {
    id: 'c1',
    type: 'default',
    position: { x: 0, y: 0 },
    data: {
      blockId: 'condition',
      title: 'Условие',
      settings,
    },
  } as Node;
}

describe('scenarioConsistency condition unknown variable', () => {
  it('does not report unknown variable for user_tag source', () => {
    const diags = validateScenarioConsistency(
      [
        conditionNode({
          conditionSourceType: 'user_tag',
          variable: 'vip',
        }),
      ],
      [],
      [conditionBlock],
      { definedVariableKeys: [] }
    );
    expect(diags.some(d => d.code === 'ConditionUnknownVariable')).toBe(false);
  });

  it('still reports unknown variable for saved_answer source', () => {
    const diags = validateScenarioConsistency(
      [
        conditionNode({
          conditionSourceType: 'saved_answer',
          variable: 'vip',
        }),
      ],
      [],
      [conditionBlock],
      { definedVariableKeys: [] }
    );
    expect(diags.some(d => d.code === 'ConditionUnknownVariable')).toBe(true);
  });
});
