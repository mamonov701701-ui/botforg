/**
 * Store для управления сценариями в редакторе
 */

import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import * as scenarioAPI from '../api/scenarios';
import type { BlockCatalogItem } from '../types/blocks';
import type { ScenarioDiagnostic } from '../utils/scenarioConsistency';
import { computeEditorScenarioValidation } from '../utils/scenarioSaveCompute';
import { SAVE_VALIDATION_BLOCKED_MESSAGE } from '../utils/scenarioValidationMessages';
import { buildRuntimeGraph, RuntimeGraph } from '../utils/runtimeNormalization';
import { migrateScenarioNodes } from '../utils/scenarioContentMigration';
import { useEditorStore } from './editorStore';
import { useValidationStore } from './validationStore';
import { useScenarioDiagnosticsStore } from './scenarioDiagnosticsStore';

/** Опции save/publish: при необходимости переопределить данные из editorStore */
export interface SaveCurrentScenarioOptions {
  catalog?: BlockCatalogItem[];
  definedVariableKeys?: string[];
  systemVariableKeys?: string[];
  scenarios?: Array<{ id: number; name: string }>;
}

export interface SaveCurrentScenarioResult {
  saved: boolean;
  blocked: boolean;
  diagnostics: ScenarioDiagnostic[];
  errorMessage?: string;
}

export interface PublishCurrentScenarioResult extends SaveCurrentScenarioResult {
  published: boolean;
}

interface ScenarioState {
  id: number | null;
  name: string;
  icon: string;
  nodes: Node[];
  edges: Edge[];
  isDirty: boolean; // Есть несохраненные изменения
  // Краткое состояние валидации сценария
  hasValidationErrors: boolean;
}

interface ScenarioStore {
  // Текущий бот
  currentBotId: number | null;

  // Сценарии текущего бота
  scenarios: scenarioAPI.Scenario[];

  // Текущий активный сценарий
  currentScenarioId: number | null;

  // Состояние текущего сценария
  currentState: ScenarioState | null;

  // Библиотека сценариев
  libraryScenarios: scenarioAPI.Scenario[];

  // Загрузка
  isLoading: boolean;
  isSaving: boolean;

  // Статус автосохранения: idle | saving | error
  saveStatus: 'idle' | 'saving' | 'error';
  lastSaveError: string | null;

  // Последнее сохранение
  lastSaved: Date | null;

  // Actions
  loadBotScenarios: (botId: number) => Promise<void>;
  loadLibraryScenarios: () => Promise<void>;

  selectScenario: (scenarioId: number) => void;
  createScenario: (data: scenarioAPI.ScenarioCreate) => Promise<scenarioAPI.Scenario>;
  updateCurrentScenario: (nodes: Node[], edges: Edge[]) => void;
  syncFromEditor: () => void;
  saveCurrentScenario: (opts?: SaveCurrentScenarioOptions) => Promise<SaveCurrentScenarioResult>;

  /** Сохранить, затем POST /publish; та же валидация, что и при save */
  publishCurrentScenario: (
    opts?: SaveCurrentScenarioOptions
  ) => Promise<PublishCurrentScenarioResult>;
  deleteScenario: (scenarioId: number) => Promise<void>;
  /** Только имя; граф и currentState.nodes/edges не трогаем */
  renameScenario: (scenarioId: number, name: string) => Promise<void>;

  saveToLibrary: (data: {
    name?: string;
    description?: string;
    category?: string;
    icon?: string;
  }) => Promise<void>;

  addFromLibrary: (libraryScenarioId: number) => Promise<void>;

  // Автосохранение
  enableAutoSave: () => void;
  disableAutoSave: () => void;

  // Импорт сценария из JSON в текущий сценарий
  importFromJson: (nodes: Node[], edges: Edge[]) => void;

  // Валидация
  setValidationStatus: (hasErrors: boolean) => void;

  // Utility
  hasUnsavedChanges: () => boolean;
  getCurrentScenario: () => scenarioAPI.Scenario | null;
  getCurrentStatus: () => scenarioAPI.Scenario['status'] | null;
  /**
   * Возвращает нормализованный runtime‑snapshot для текущего сценария
   * на основе editor‑графа (currentState.nodes/edges).
   *
   * Этот snapshot:
   * - не содержит UI‑полей и React Flow‑специфики
   * - может быть передан на backend для выполнения
   */
  getCurrentRuntimeGraph: () => RuntimeGraph | null;
  getDraftFromStorage: (
    botId: number,
    scenarioId: number
  ) => { nodes: Node[]; edges: Edge[] } | null;
  clearDraftFromStorage: () => void;
}

const DRAFT_STORAGE_KEY = 'scenario_draft';
const DRAFT_STORAGE_DEBOUNCE_MS = 2000;

export const useScenarioStore = create<ScenarioStore>((set, get) => {
  let autoSaveInterval: NodeJS.Timeout | null = null;
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let autoSaveEnabled = false;
  let draftStorageTimeout: ReturnType<typeof setTimeout> | null = null;

  const saveDraftToStorage = () => {
    const { currentBotId, currentScenarioId, currentState } = get();
    if (!currentBotId || !currentScenarioId || !currentState?.isDirty) return;
    try {
      const key = `${DRAFT_STORAGE_KEY}_${currentBotId}_${currentScenarioId}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          nodes: currentState.nodes,
          edges: currentState.edges,
          savedAt: Date.now(),
        })
      );
    } catch {
      // localStorage full or disabled
    }
  };

  const clearDraftFromStorage = () => {
    const { currentBotId, currentScenarioId } = get();
    if (!currentBotId || !currentScenarioId) return;
    try {
      localStorage.removeItem(`${DRAFT_STORAGE_KEY}_${currentBotId}_${currentScenarioId}`);
    } catch {}
  };

  return {
    // Initial state
    currentBotId: null,
    scenarios: [],
    currentScenarioId: null,
    currentState: null,
    libraryScenarios: [],
    isLoading: false,
    isSaving: false,
    saveStatus: 'idle',
    lastSaveError: null,
    lastSaved: null,

    // Load scenarios
    loadBotScenarios: async (botId: number) => {
      // Сбрасываем текущее состояние при переключении бота
      set({
        isLoading: true,
        currentBotId: botId,
        currentScenarioId: null,
        scenarios: [],
        currentState: {
          id: null,
          name: '',
          icon: 'FileText',
          nodes: [],
          edges: [],
          isDirty: false,
          hasValidationErrors: false,
        },
      });

      try {
        const scenarios = await scenarioAPI.getBotScenarios(botId);
        set({ scenarios, isLoading: false });

        // Автоматически выбираем главный сценарий
        const mainScenario = scenarios.find(s => s.is_main);
        if (mainScenario) {
          get().selectScenario(mainScenario.id);
        } else if (scenarios.length > 0) {
          get().selectScenario(scenarios[0].id);
        }
      } catch (error: any) {
        set({ isLoading: false });
        const is403 =
          error?.status === 403 ||
          (typeof error?.message === 'string' && error.message.includes('Access denied'));
        if (is403) throw error;
        console.error('Failed to load scenarios:', error);
      }
    },

    loadLibraryScenarios: async () => {
      try {
        const libraryScenarios = await scenarioAPI.getLibraryScenarios();
        set({ libraryScenarios });
      } catch (error) {
        console.error('Failed to load library scenarios:', error);
      }
    },

    // Select scenario
    selectScenario: (scenarioId: number) => {
      const scenario = get().scenarios.find(s => s.id === scenarioId);
      if (!scenario) return;

      const newState = {
        id: scenario.id,
        name: scenario.name,
        icon: scenario.icon || 'FileText',
        nodes: migrateScenarioNodes(scenario.content?.nodes || []),
        edges: scenario.content?.edges || [],
        isDirty: false,
        hasValidationErrors: false,
      };

      set({
        currentScenarioId: scenarioId,
        currentState: newState,
      });
    },

    // Create scenario
    createScenario: async (data: scenarioAPI.ScenarioCreate) => {
      const botId = get().currentBotId;
      if (!botId) throw new Error('No bot selected');

      const scenario = await scenarioAPI.createScenario({
        ...data,
        bot_id: botId,
      });

      // Добавляем в список
      set(state => ({
        scenarios: [...state.scenarios, scenario],
      }));

      // Автоматически переключаемся на новый сценарий
      get().selectScenario(scenario.id);

      return scenario;
    },

    // Update current scenario (вызывается из редактора при изменении nodes/edges)
    updateCurrentScenario: (nodes: Node[], edges: Edge[]) => {
      set(state => ({
        currentState: state.currentState
          ? { ...state.currentState, nodes, edges, isDirty: true }
          : null,
      }));
      if (draftStorageTimeout) clearTimeout(draftStorageTimeout);
      draftStorageTimeout = setTimeout(saveDraftToStorage, DRAFT_STORAGE_DEBOUNCE_MS);

      if (autoSaveEnabled) {
        if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(async () => {
          const { currentState, isSaving } = get();
          if (currentState?.isDirty && !isSaving) {
            try {
              await get().saveCurrentScenario();
            } catch {
              // Ошибка уже отражена в saveStatus
            }
          }
        }, 5000);
      }
    },

    // Импорт JSON в текущий сценарий.
    // CONTRACT: вызывает updateCurrentScenario, поэтому:
    // - обновляет currentState.nodes/edges;
    // - помечает сценарий как isDirty;
    // - запускает debounce автосохранения и сохранение draft в localStorage.
    importFromJson: (nodes: Node[], edges: Edge[]) => {
      get().updateCurrentScenario(migrateScenarioNodes(nodes), edges);
    },

    // Устарело: граф в currentState; синхронизация из EditorV2Shell (RF → updateCurrentScenario).
    syncFromEditor: () => undefined,

    saveCurrentScenario: async (opts?: SaveCurrentScenarioOptions) => {
      const { currentScenarioId, currentState } = get();
      if (!currentScenarioId || !currentState) {
        return {
          saved: false,
          blocked: false,
          diagnostics: [],
          errorMessage: 'Нет активного сценария для сохранения',
        };
      }

      const ed = useEditorStore.getState();
      const catalog = opts?.catalog ?? ed.catalog;
      const vars = ed.editorScenarioValidationVars;
      const definedVariableKeys = opts?.definedVariableKeys ?? vars.definedVariableKeys;
      const systemVariableKeys = opts?.systemVariableKeys ?? vars.systemVariableKeys;
      const scenarios = opts?.scenarios ?? get().scenarios;

      const v = computeEditorScenarioValidation(
        currentState.nodes,
        currentState.edges,
        catalog,
        scenarios,
        definedVariableKeys,
        systemVariableKeys
      );

      useValidationStore.getState().setAllValidationResults(v.results);
      useScenarioDiagnosticsStore.getState().setDiagnostics(v.diagnostics);

      if (v.blocked) {
        set(state => ({
          currentState: state.currentState
            ? { ...state.currentState, hasValidationErrors: true }
            : null,
          isSaving: false,
          saveStatus: 'idle',
        }));
        return {
          saved: false,
          blocked: true,
          diagnostics: v.diagnostics,
          errorMessage: SAVE_VALIDATION_BLOCKED_MESSAGE,
        };
      }

      set({
        isSaving: true,
        saveStatus: 'saving',
        lastSaveError: null,
      });
      set(state => ({
        currentState: state.currentState
          ? { ...state.currentState, hasValidationErrors: false }
          : null,
      }));

      try {
        const updated = await scenarioAPI.updateScenario(currentScenarioId, {
          content: {
            nodes: migrateScenarioNodes(currentState.nodes),
            edges: currentState.edges,
          },
        });

        clearDraftFromStorage();
        set(state => ({
          scenarios: state.scenarios.map(s => (s.id === currentScenarioId ? updated : s)),
          currentState: state.currentState ? { ...state.currentState, isDirty: false } : null,
          isSaving: false,
          saveStatus: 'idle',
          lastSaveError: null,
          lastSaved: new Date(),
        }));
        return {
          saved: true,
          blocked: false,
          diagnostics: v.diagnostics,
        };
      } catch (error: any) {
        console.error('Failed to save scenario:', error);
        const errMsg = error?.message || 'Ошибка сохранения';
        set({
          isSaving: false,
          saveStatus: 'error',
          lastSaveError: errMsg,
        });
        if (error.status === 401) {
          throw new Error('Для сохранения сценариев необходимо войти в систему');
        }
        throw error;
      }
    },

    publishCurrentScenario: async (opts?: SaveCurrentScenarioOptions) => {
      const saveRes = await get().saveCurrentScenario(opts);
      if (!saveRes.saved) {
        return { ...saveRes, published: false };
      }

      const id = get().currentScenarioId;
      if (!id) {
        return {
          saved: true,
          published: false,
          blocked: false,
          diagnostics: saveRes.diagnostics,
          errorMessage: 'Нет активного сценария',
        };
      }

      try {
        const updated = await scenarioAPI.publishScenario(id);
        set(state => ({
          scenarios: state.scenarios.map(s => (s.id === id ? updated : s)),
        }));
        return {
          saved: true,
          published: true,
          blocked: false,
          diagnostics: saveRes.diagnostics,
        };
      } catch (error: any) {
        console.error('Failed to publish scenario:', error);
        const errMsg = error?.message || 'Ошибка публикации';
        set({
          isSaving: false,
          saveStatus: 'error',
          lastSaveError: errMsg,
        });
        if (error.status === 401) {
          throw new Error('Для публикации сценариев необходимо войти в систему');
        }
        throw error;
      }
    },

    // Delete scenario
    deleteScenario: async (scenarioId: number) => {
      await scenarioAPI.deleteScenario(scenarioId);

      const { currentScenarioId, scenarios } = get();
      const remainingScenarios = scenarios.filter(s => s.id !== scenarioId);

      set({ scenarios: remainingScenarios });

      // Если удалили текущий - переключаемся на другой
      if (currentScenarioId === scenarioId && remainingScenarios.length > 0) {
        const mainScenario = remainingScenarios.find(s => s.is_main);
        get().selectScenario(mainScenario ? mainScenario.id : remainingScenarios[0].id);
      }
    },

    renameScenario: async (scenarioId: number, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('Имя сценария не может быть пустым');
      }
      const updated = await scenarioAPI.updateScenario(scenarioId, { name: trimmed });
      set(state => ({
        scenarios: state.scenarios.map(s => (s.id === scenarioId ? updated : s)),
        currentState:
          state.currentScenarioId === scenarioId && state.currentState
            ? { ...state.currentState, name: updated.name }
            : state.currentState,
      }));
    },

    // Save to library
    saveToLibrary: async data => {
      const { currentScenarioId } = get();
      if (!currentScenarioId) return;

      await scenarioAPI.saveToLibrary(currentScenarioId, data);

      // Обновляем библиотеку
      await get().loadLibraryScenarios();
    },

    // Add from library
    addFromLibrary: async (libraryScenarioId: number) => {
      const botId = get().currentBotId;
      if (!botId) throw new Error('No bot selected');

      const scenario = await scenarioAPI.addFromLibrary(libraryScenarioId, botId);

      // Добавляем в список
      set(state => ({
        scenarios: [...state.scenarios, scenario],
      }));

      // Переключаемся на новый
      get().selectScenario(scenario.id);
    },

    // Автосохранение с debounce: сохраняем через 5с после последнего изменения
    enableAutoSave: () => {
      autoSaveEnabled = true;
      console.log('🔄 Автосохранение включено (debounce 5s)');
    },

    disableAutoSave: () => {
      autoSaveEnabled = false;
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
      }
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
      }
      console.log('⏸️ Автосохранение выключено');
    },

    // Валидация
    setValidationStatus: hasErrors => {
      set(state => {
        if (!state.currentState) return state;
        if (state.currentState.hasValidationErrors === hasErrors) return state;
        return {
          currentState: { ...state.currentState, hasValidationErrors: hasErrors },
        };
      });
    },

    // Utility
    hasUnsavedChanges: () => {
      return get().currentState?.isDirty || false;
    },

    getCurrentScenario: () => {
      const { currentScenarioId, scenarios } = get();
      return scenarios.find(s => s.id === currentScenarioId) || null;
    },

    getCurrentStatus: () => {
      const { currentScenarioId, scenarios } = get();
      const s = scenarios.find(sc => sc.id === currentScenarioId);
      return s ? s.status : null;
    },

    getCurrentRuntimeGraph: () => {
      const { currentState } = get();
      if (!currentState) return null;
      return buildRuntimeGraph(currentState.nodes, currentState.edges);
    },

    getDraftFromStorage: (botId: number, scenarioId: number) => {
      try {
        const raw = localStorage.getItem(`${DRAFT_STORAGE_KEY}_${botId}_${scenarioId}`);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data?.nodes && data?.edges ? { nodes: data.nodes, edges: data.edges } : null;
      } catch {
        return null;
      }
    },

    clearDraftFromStorage,
  };
});
