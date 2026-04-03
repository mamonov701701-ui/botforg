import { create } from 'zustand';
import type { ScenarioDiagnostic } from '../utils/scenarioConsistency';
import { scenarioDiagnosticsEqual } from '../utils/validationCompare';

function groupByNode(diagnostics: ScenarioDiagnostic[]): Map<string, ScenarioDiagnostic[]> {
  const m = new Map<string, ScenarioDiagnostic[]>();
  for (const d of diagnostics) {
    const arr = m.get(d.blockId) ?? [];
    arr.push(d);
    m.set(d.blockId, arr);
  }
  return m;
}

/**
 * Стабильная пустая ссылка для селекторов byNodeId.get(id) ?? EMPTY — не создавать [] в getSnapshot
 * (иначе useSyncExternalStore → бесконечные ререндеры / Maximum update depth exceeded).
 */
export const SCENARIO_DIAGNOSTICS_EMPTY_NODE: readonly ScenarioDiagnostic[] = Object.freeze([]);

interface ScenarioDiagnosticsState {
  /** Плоский список (порядок прохода по узлам) */
  list: ScenarioDiagnostic[];
  byNodeId: Map<string, ScenarioDiagnostic[]>;
  setDiagnostics: (list: ScenarioDiagnostic[]) => void;
}

export const useScenarioDiagnosticsStore = create<ScenarioDiagnosticsState>(set => ({
  list: [],
  byNodeId: new Map(),
  setDiagnostics: list =>
    set(state => {
      if (scenarioDiagnosticsEqual(state.list, list)) {
        return state;
      }
      return {
        list,
        byNodeId: groupByNode(list),
      };
    }),
}));
