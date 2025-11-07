import { Node, Edge } from 'reactflow';

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: Date;
  updatedAt: Date;
}

export type ScenarioType = 'main' | 'payment' | 'faq' | 'support' | 'catalog' | 'custom';

export const SCENARIO_ICONS: Record<ScenarioType, string> = {
  main: '🏠',
  payment: '💳',
  faq: '❓',
  support: '🆘',
  catalog: '📦',
  custom: '⚙️',
};

export const DEFAULT_SCENARIOS: Array<{ type: ScenarioType; name: string; description: string }> = [
  {
    type: 'main',
    name: 'Главный',
    description: 'Главное меню и приветствие',
  },
];
