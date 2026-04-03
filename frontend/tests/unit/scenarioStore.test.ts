import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BlockCatalogItem } from '@/types/blocks';
import * as scenarioAPI from '@/api/scenarios';
import { useScenarioStore } from '@/stores/scenarioStore';
import { useEditorStore } from '@/stores/editorStore';

const messageBlock: BlockCatalogItem = {
  id: 'message',
  title: 'Сообщение',
  category: 'basic',
  description: '',
  icon: '💬',
  color: '#000',
  planAccess: ['free'],
  permissions: ['developer'],
  configSchema: [{ name: 'text', type: 'text', label: 'Текст', required: false }],
};

const inputBlock: BlockCatalogItem = {
  id: 'input',
  title: 'Ввод',
  category: 'basic',
  description: '',
  icon: '⌨',
  color: '#000',
  planAccess: ['free'],
  permissions: ['developer'],
  configSchema: [],
};

vi.mock('@/api/scenarios', () => ({
  __esModule: true,
  ...vi.importActual<any>('@/api/scenarios'),
  updateScenario: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Test',
    icon: 'X',
    content: { nodes: [], edges: [] },
  }),
  publishScenario: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Test',
    icon: 'X',
    content: { nodes: [], edges: [] },
    status: 'published',
  }),
}));

function baseScenarioState() {
  return {
    currentBotId: 1,
    scenarios: [],
    currentScenarioId: 1,
    currentState: {
      id: 1,
      name: 'Test',
      icon: 'X',
      nodes: [] as any[],
      edges: [] as any[],
      isDirty: false,
      hasValidationErrors: false,
    },
  } as any;
}

describe('scenarioStore synchronization and autosave', () => {
  beforeEach(() => {
    useEditorStore.setState({
      catalog: [],
      editorScenarioValidationVars: { definedVariableKeys: [], systemVariableKeys: [] },
    });
    useScenarioStore.setState(baseScenarioState());
  });

  afterEach(() => {
    vi.useRealTimers();
    (scenarioAPI.updateScenario as any).mockClear();
    (scenarioAPI.publishScenario as any).mockClear();
  });

  it('importFromJson updates currentState and marks scenario dirty', () => {
    const store = useScenarioStore.getState();
    const nodes = [{ id: 'n1', type: 'default', position: { x: 0, y: 0 }, data: {} } as any];
    const edges: any[] = [];

    store.importFromJson(nodes as any, edges as any);

    const updated = useScenarioStore.getState().currentState!;
    expect(updated.nodes).toEqual(nodes);
    expect(updated.edges).toEqual(edges);
    expect(updated.isDirty).toBe(true);
  });

  it('autosave triggers after debounce when enabled', async () => {
    vi.useFakeTimers();

    const store = useScenarioStore.getState();
    store.enableAutoSave();

    // Пустой граф проходит validator; узел без blockId блокировал бы save
    const nodes: any[] = [];
    const edges: any[] = [];

    store.importFromJson(nodes as any, edges as any);

    await vi.advanceTimersByTimeAsync(4900);
    expect(scenarioAPI.updateScenario as any).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    await vi.runOnlyPendingTimersAsync();

    expect(scenarioAPI.updateScenario).toHaveBeenCalledTimes(1);

    const finalState = useScenarioStore.getState().currentState!;
    expect(finalState.isDirty).toBe(false);
  });
});

describe('saveCurrentScenario validation gate', () => {
  beforeEach(() => {
    useEditorStore.setState({
      catalog: [messageBlock],
      editorScenarioValidationVars: {
        definedVariableKeys: ['only_declared'],
        systemVariableKeys: [],
      },
    });
    useScenarioStore.setState({
      ...baseScenarioState(),
      currentState: {
        ...baseScenarioState().currentState,
        isDirty: true,
        nodes: [
          {
            id: 'n-msg',
            type: 'default',
            position: { x: 0, y: 0 },
            data: {
              blockId: 'message',
              title: 'M',
              settings: { text: 'Hi {{unknown_ph}}' },
            },
          },
        ],
        edges: [],
      },
    });
  });

  afterEach(() => {
    (scenarioAPI.updateScenario as any).mockClear();
    (scenarioAPI.publishScenario as any).mockClear();
  });

  it('blocks save when MessageUnknownPlaceholder is severity error', async () => {
    const res = await useScenarioStore.getState().saveCurrentScenario();
    expect(res.blocked).toBe(true);
    expect(res.saved).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'MessageUnknownPlaceholder')).toBe(true);
    expect(scenarioAPI.updateScenario).not.toHaveBeenCalled();
    expect(useScenarioStore.getState().currentState?.hasValidationErrors).toBe(true);
  });

  it('blocks save when input has MissingOutgoingEdge', async () => {
    useEditorStore.setState({ catalog: [inputBlock] });
    useScenarioStore.setState({
      currentState: {
        ...baseScenarioState().currentState,
        isDirty: true,
        nodes: [
          {
            id: 'n-in',
            type: 'default',
            position: { x: 0, y: 0 },
            data: {
              blockId: 'input',
              title: 'In',
              settings: {
                question_text: 'Q?',
                variable_key: 'ok_key',
                required: true,
                trim: true,
                validation: { type: 'string' },
              },
            },
          },
        ],
        edges: [],
      },
    });

    const res = await useScenarioStore.getState().saveCurrentScenario();
    expect(res.blocked).toBe(true);
    expect(res.saved).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'MissingOutgoingEdge')).toBe(true);
    expect(scenarioAPI.updateScenario).not.toHaveBeenCalled();
  });

  it('saves when only consistency warnings (no errors)', async () => {
    useEditorStore.setState({
      catalog: [messageBlock],
      editorScenarioValidationVars: { definedVariableKeys: [], systemVariableKeys: [] },
    });

    const res = await useScenarioStore.getState().saveCurrentScenario();
    expect(res.blocked).toBe(false);
    expect(res.saved).toBe(true);
    expect(res.diagnostics.some(d => d.severity === 'warning')).toBe(true);
    expect(scenarioAPI.updateScenario).toHaveBeenCalledTimes(1);
  });
});

describe('publishCurrentScenario', () => {
  beforeEach(() => {
    useEditorStore.setState({
      catalog: [messageBlock],
      editorScenarioValidationVars: {
        definedVariableKeys: ['x'],
        systemVariableKeys: [],
      },
    });
    useScenarioStore.setState({
      ...baseScenarioState(),
      currentState: {
        ...baseScenarioState().currentState,
        isDirty: true,
        nodes: [
          {
            id: 'n-msg',
            type: 'default',
            position: { x: 0, y: 0 },
            data: {
              blockId: 'message',
              title: 'M',
              settings: { text: 'Hello {{bad}}' },
            },
          },
        ],
        edges: [],
      },
    });
  });

  afterEach(() => {
    (scenarioAPI.updateScenario as any).mockClear();
    (scenarioAPI.publishScenario as any).mockClear();
  });

  it('does not call publish API when validation blocks save', async () => {
    const res = await useScenarioStore.getState().publishCurrentScenario();
    expect(res.published).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.saved).toBe(false);
    expect(scenarioAPI.updateScenario).not.toHaveBeenCalled();
    expect(scenarioAPI.publishScenario).not.toHaveBeenCalled();
  });

  it('calls publish after successful save when graph is valid', async () => {
    useEditorStore.setState({
      catalog: [messageBlock],
      editorScenarioValidationVars: { definedVariableKeys: [], systemVariableKeys: [] },
    });
    useScenarioStore.setState({
      currentState: {
        ...baseScenarioState().currentState,
        isDirty: true,
        nodes: [
          {
            id: 'n-msg',
            type: 'default',
            position: { x: 0, y: 0 },
            data: {
              blockId: 'message',
              title: 'M',
              settings: { text: 'Plain text' },
            },
          },
        ],
        edges: [],
      },
    });

    const res = await useScenarioStore.getState().publishCurrentScenario();
    expect(res.blocked).toBe(false);
    expect(res.saved).toBe(true);
    expect(res.published).toBe(true);
    expect(scenarioAPI.updateScenario).toHaveBeenCalled();
    expect(scenarioAPI.publishScenario).toHaveBeenCalledWith(1);
  });
});

describe('quick save vs saveCurrentScenario contract', () => {
  it('saveCurrentScenario returns structured result for UI (non-throwing validation)', async () => {
    useEditorStore.setState({ catalog: [messageBlock] });
    useScenarioStore.setState(baseScenarioState());

    const res = await useScenarioStore.getState().saveCurrentScenario();
    expect(typeof res.saved).toBe('boolean');
    expect(typeof res.blocked).toBe('boolean');
    expect(Array.isArray(res.diagnostics)).toBe(true);
  });
});
