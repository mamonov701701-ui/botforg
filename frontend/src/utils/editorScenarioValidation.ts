/**
 * Оркестрация проверки сценария: compute (чистый) + синхронизация с zustand.
 * Сохранение использует computeEditorScenarioValidation из scenarioSaveCompute напрямую,
 * чтобы избежать циклического импорта со scenarioStore.
 */

import type { Edge, Node } from 'reactflow';
import type { BlockCatalogItem } from '../types/blocks';
import {
  computeEditorScenarioValidation,
  type EditorScenarioValidationComputed,
} from './scenarioSaveCompute';
import { useValidationStore } from '../stores/validationStore';
import { useScenarioDiagnosticsStore } from '../stores/scenarioDiagnosticsStore';
import { useScenarioStore } from '../stores/scenarioStore';
import { useEditorStore } from '../stores/editorStore';

export type ApplyEditorScenarioValidationResult = EditorScenarioValidationComputed;

export { SAVE_VALIDATION_BLOCKED_MESSAGE } from './scenarioValidationMessages';

export interface EditorValidationPipelineOverrides {
  catalog?: BlockCatalogItem[];
  scenarios?: Array<{ id: number; name: string }>;
  definedVariableKeys?: string[];
  systemVariableKeys?: string[];
  /**
   * Запись в zustand только при явном true.
   * По умолчанию только compute (без побочных эффектов) — безопасно при монтировании и в эффектах.
   */
  syncStores?: boolean;
}

export function syncEditorScenarioValidationToStores(r: EditorScenarioValidationComputed): void {
  useValidationStore.getState().setAllValidationResults(r.results);
  useScenarioDiagnosticsStore.getState().setDiagnostics(r.diagnostics);
  useScenarioStore.getState().setValidationStatus(r.blocked);
}

/**
 * Единая точка для UI (дебаунс в редакторе, export): берёт catalog и ключи переменных из editorStore,
 * список сценариев — из scenarioStore.
 */
export function runEditorValidationPipeline(
  nodes: Node[],
  edges: Edge[],
  overrides?: EditorValidationPipelineOverrides
): ApplyEditorScenarioValidationResult {
  const ed = useEditorStore.getState();
  const catalog = overrides?.catalog ?? ed.catalog;
  const v = ed.editorScenarioValidationVars;
  const definedVariableKeys = overrides?.definedVariableKeys ?? v.definedVariableKeys;
  const systemVariableKeys = overrides?.systemVariableKeys ?? v.systemVariableKeys;
  const scenarios = overrides?.scenarios ?? useScenarioStore.getState().scenarios;
  const r = computeEditorScenarioValidation(
    nodes,
    edges,
    catalog,
    scenarios,
    definedVariableKeys,
    systemVariableKeys
  );
  if (overrides?.syncStores === true) {
    syncEditorScenarioValidationToStores(r);
  }
  return r;
}

export function applyEditorScenarioValidation(
  nodes: Node[],
  edges: Edge[],
  catalog: BlockCatalogItem[],
  scenarios: Array<{ id: number; name: string }>,
  definedVariableKeys: string[],
  systemVariableKeys: string[],
  options?: { syncStores?: boolean }
): ApplyEditorScenarioValidationResult {
  const r = computeEditorScenarioValidation(
    nodes,
    edges,
    catalog,
    scenarios,
    definedVariableKeys,
    systemVariableKeys
  );
  if (options?.syncStores === true) {
    syncEditorScenarioValidationToStores(r);
  }
  return r;
}

/** Только проверка, без записи в store (например внешний вызов перед publish). */
export function isScenarioPublishBlocked(
  nodes: Node[],
  edges: Edge[],
  catalog: BlockCatalogItem[],
  scenarios: Array<{ id: number; name: string }>,
  definedVariableKeys: string[],
  systemVariableKeys: string[]
): boolean {
  return computeEditorScenarioValidation(
    nodes,
    edges,
    catalog,
    scenarios,
    definedVariableKeys,
    systemVariableKeys
  ).blocked;
}
