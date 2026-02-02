/**
 * Store для управления сценариями в редакторе
 */

import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import * as scenarioAPI from '../api/scenarios';
import { useEditorStore } from './editorStore';

interface ScenarioState {
  id: number;
  name: string;
  icon: string;
  nodes: Node[];
  edges: Edge[];
  isDirty: boolean; // Есть несохраненные изменения
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

  // Последнее сохранение
  lastSaved: Date | null;

  // Actions
  loadBotScenarios: (botId: number) => Promise<void>;
  loadLibraryScenarios: () => Promise<void>;

  selectScenario: (scenarioId: number) => void;
  createScenario: (data: scenarioAPI.ScenarioCreate) => Promise<scenarioAPI.Scenario>;
  updateCurrentScenario: (nodes: Node[], edges: Edge[]) => void;
  syncFromEditor: () => void;
  saveCurrentScenario: () => Promise<void>;
  deleteScenario: (scenarioId: number) => Promise<void>;

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

  // Utility
  hasUnsavedChanges: () => boolean;
  getCurrentScenario: () => scenarioAPI.Scenario | null;
}

export const useScenarioStore = create<ScenarioStore>((set, get) => {
  let autoSaveInterval: NodeJS.Timeout | null = null;

  return {
    // Initial state
    currentBotId: null,
    scenarios: [],
    currentScenarioId: null,
    currentState: null,
    libraryScenarios: [],
    isLoading: false,
    isSaving: false,
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
        },
      });

      // Очищаем редактор
      const editorStore = useEditorStore.getState();
      editorStore.setNodes([]);
      editorStore.setEdges([]);

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
        nodes: scenario.content?.nodes || [],
        edges: scenario.content?.edges || [],
        isDirty: false,
      };

      set({
        currentScenarioId: scenarioId,
        currentState: newState,
      });

      // Синхронизируем с editorStore
      const editorStore = useEditorStore.getState();
      editorStore.setNodes(newState.nodes);
      editorStore.setEdges(newState.edges);
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

    // Update current scenario (вызывается из editorStore при изменении nodes/edges)
    updateCurrentScenario: (nodes: Node[], edges: Edge[]) => {
      set(state => ({
        currentState: state.currentState
          ? { ...state.currentState, nodes, edges, isDirty: true }
          : null,
      }));
    },

    // Синхронизация с editorStore (вызывается при изменениях в React Flow)
    syncFromEditor: () => {
      const editorStore = useEditorStore.getState();
      const { currentState } = get();

      if (currentState) {
        get().updateCurrentScenario(editorStore.nodes, editorStore.edges);
      }
    },

    // Save current scenario
    saveCurrentScenario: async () => {
      const { currentScenarioId, currentState } = get();
      if (!currentScenarioId || !currentState) return;

      set({ isSaving: true });
      try {
        const updated = await scenarioAPI.updateScenario(currentScenarioId, {
          content: {
            nodes: currentState.nodes,
            edges: currentState.edges,
          },
        });

        // Обновляем в списке
        set(state => ({
          scenarios: state.scenarios.map(s => (s.id === currentScenarioId ? updated : s)),
          currentState: state.currentState ? { ...state.currentState, isDirty: false } : null,
          isSaving: false,
          lastSaved: new Date(),
        }));
      } catch (error: any) {
        console.error('Failed to save scenario:', error);
        set({ isSaving: false });
        // Пробрасываем ошибку дальше для обработки в UI
        if (error.status === 401) {
          throw new Error('Для сохранения сценариев необходимо войти в систему');
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

    // Автосохранение
    enableAutoSave: () => {
      if (autoSaveInterval) return; // Уже включено

      autoSaveInterval = setInterval(async () => {
        const { currentState, isSaving } = get();
        if (currentState?.isDirty && !isSaving) {
          try {
            await get().saveCurrentScenario();
            console.log('✅ Автосохранение выполнено');
          } catch (error) {
            console.error('❌ Ошибка автосохранения:', error);
          }
        }
      }, 30000); // Каждые 30 секунд

      console.log('🔄 Автосохранение включено (каждые 30 сек)');
    },

    disableAutoSave: () => {
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
        console.log('⏸️ Автосохранение выключено');
      }
    },

    // Utility
    hasUnsavedChanges: () => {
      return get().currentState?.isDirty || false;
    },

    getCurrentScenario: () => {
      const { currentScenarioId, scenarios } = get();
      return scenarios.find(s => s.id === currentScenarioId) || null;
    },
  };
});
