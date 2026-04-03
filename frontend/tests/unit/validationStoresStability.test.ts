import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useScenarioDiagnosticsStore,
  SCENARIO_DIAGNOSTICS_EMPTY_NODE,
} from '@/stores/scenarioDiagnosticsStore';
import { useValidationStore } from '@/stores/validationStore';
import { useScenarioStore } from '@/stores/scenarioStore';
import type { ScenarioDiagnostic } from '@/utils/scenarioConsistency';
import type { ValidationResult } from '@/utils/schemaValidation';
import { runEditorValidationPipeline } from '@/utils/editorScenarioValidation';
import { useEditorStore } from '@/stores/editorStore';
import { fetchVariableDefinitionsSafe } from '@/api/botMessageTemplate';
import * as client from '@/api/client';
import type { BlockCatalogItem } from '@/types/blocks';

describe('validation stores stability', () => {
  beforeEach(() => {
    useValidationStore.getState().clearValidation();
    useScenarioDiagnosticsStore.getState().setDiagnostics([]);
  });

  it('setDiagnostics does not notify when list is logically identical', () => {
    const row: ScenarioDiagnostic = {
      severity: 'error',
      blockId: 'n1',
      code: 'MissingOutgoingEdge',
      message: 'Нет связи',
    };
    useScenarioDiagnosticsStore.getState().setDiagnostics([row]);
    let fires = 0;
    const unsub = useScenarioDiagnosticsStore.subscribe(() => {
      fires++;
    });
    useScenarioDiagnosticsStore.getState().setDiagnostics([{ ...row }]);
    unsub();
    expect(fires).toBe(0);
  });

  it('setValidationResult does not notify when result is logically identical', () => {
    const r: ValidationResult = {
      nodeId: 'a',
      isValid: false,
      missingFields: ['Поле'],
      blockTitle: 'B',
    };
    useValidationStore.getState().setValidationResult('a', r);
    let fires = 0;
    const unsub = useValidationStore.subscribe(() => {
      fires++;
    });
    useValidationStore.getState().setValidationResult('a', { ...r });
    unsub();
    expect(fires).toBe(0);
  });

  it('setAllValidationResults does not notify when map is logically identical', () => {
    const r: ValidationResult = {
      nodeId: 'a',
      isValid: false,
      missingFields: ['Поле'],
      blockTitle: 'B',
    };
    useValidationStore.getState().setAllValidationResults([r]);
    let fires = 0;
    const unsub = useValidationStore.subscribe(() => {
      fires++;
    });
    useValidationStore.getState().setAllValidationResults([{ ...r }]);
    unsub();
    expect(fires).toBe(0);
  });

  it('setValidationStatus skips when hasValidationErrors unchanged', () => {
    useScenarioStore.setState({
      currentScenarioId: 1,
      currentState: {
        id: 1,
        name: 'S',
        icon: 'X',
        nodes: [],
        edges: [],
        isDirty: false,
        hasValidationErrors: true,
      },
    } as any);
    let fires = 0;
    const unsub = useScenarioStore.subscribe(() => fires++);
    useScenarioStore.getState().setValidationStatus(true);
    unsub();
    expect(fires).toBe(0);
  });

  it('SCENARIO_DIAGNOSTICS_EMPTY_NODE is stable reference', () => {
    expect(SCENARIO_DIAGNOSTICS_EMPTY_NODE).toBe(SCENARIO_DIAGNOSTICS_EMPTY_NODE);
  });

  it('setEditorScenarioValidationVars does not notify when keys unchanged', () => {
    useEditorStore.setState({
      editorScenarioValidationVars: {
        definedVariableKeys: ['a'],
        systemVariableKeys: ['b'],
      },
    });
    let fires = 0;
    const unsub = useEditorStore.subscribe(() => fires++);
    useEditorStore.getState().setEditorScenarioValidationVars(['a'], ['b']);
    unsub();
    expect(fires).toBe(0);
  });
});

describe('runEditorValidationPipeline', () => {
  beforeEach(() => {
    useValidationStore.getState().clearValidation();
    useScenarioDiagnosticsStore.getState().setDiagnostics([]);
    useEditorStore.setState({
      catalog: [],
      editorScenarioValidationVars: { definedVariableKeys: [], systemVariableKeys: [] },
    });
    useScenarioStore.setState({ scenarios: [] } as any);
  });

  it('with syncStores false does not write diagnostics', () => {
    useScenarioDiagnosticsStore.getState().setDiagnostics([]);
    runEditorValidationPipeline([], [], { syncStores: false });
    expect(useScenarioDiagnosticsStore.getState().list).toEqual([]);
  });

  it('with syncStores true writes diagnostics for invalid graph', () => {
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
    useEditorStore.setState({ catalog: [messageBlock] });
    const node = {
      id: 'x',
      type: 'default',
      position: { x: 0, y: 0 },
      data: { blockId: 'message', title: 'T', settings: { text: 'Hi {{unknown}}' } },
    } as any;
    runEditorValidationPipeline([node], [], {
      syncStores: true,
      definedVariableKeys: ['only_other'],
      systemVariableKeys: [],
    });
    expect(useScenarioDiagnosticsStore.getState().list.length).toBeGreaterThan(0);
  });
});

describe('fetchVariableDefinitionsSafe', () => {
  it('returns empty payload when API fails', async () => {
    const spy = vi.spyOn(client, 'get').mockRejectedValue(new Error('network'));
    const res = await fetchVariableDefinitionsSafe(1);
    spy.mockRestore();
    expect(res.ctor_bot_linked).toBe(false);
    expect(res.items).toEqual([]);
  });
});
