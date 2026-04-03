/**
 * Чистая проверка графа для save/publish/export — без zustand (нет циклических импортов со scenarioStore).
 */

import type { Edge, Node } from 'reactflow';
import type { BlockCatalogItem } from '../types/blocks';
import {
  validateAllNodesWithSchema,
  hasValidationErrors,
  type ValidationResult,
} from './schemaValidation';
import {
  validateScenarioConsistency,
  hasScenarioErrors,
  type ScenarioDiagnostic,
} from './scenarioConsistency';

export interface EditorScenarioValidationComputed {
  results: ValidationResult[];
  diagnostics: ScenarioDiagnostic[];
  blocked: boolean;
}

export function computeEditorScenarioValidation(
  nodes: Node[],
  edges: Edge[],
  catalog: BlockCatalogItem[],
  scenarios: Array<{ id: number; name: string }>,
  definedVariableKeys: string[],
  systemVariableKeys: string[]
): EditorScenarioValidationComputed {
  const results = validateAllNodesWithSchema(nodes, catalog, scenarios);
  const diagnostics = validateScenarioConsistency(nodes, edges, catalog, {
    definedVariableKeys,
    systemVariableKeys,
    scenariosForGoTo: scenarios,
  });
  const blocked = hasValidationErrors(results) || hasScenarioErrors(diagnostics);
  return { results, diagnostics, blocked };
}
