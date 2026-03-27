import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Eye, BookOpen } from 'lucide-react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import ScenarioHubDropdown from './ScenarioHubDropdown';
import NewScenarioNameModal from './NewScenarioNameModal';
import AddScenarioFromMineModal from './AddScenarioFromMineModal';
import type { Scenario } from '../../api/scenarios';
import BotsDropdown from './BotsDropdown';
import SaveDropdown from './SaveDropdown';
import SaveToLibraryModal from './SaveToLibraryModal';
import SaveBotModal from './SaveBotModal';
import NewBotModal from './NewBotModal';
import BotSimulator from '../simulator/BotSimulator';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getBots, type Bot } from '../../api/bot';
import { hasAccessToAction } from '../../constants/roles';

/** Разбор JSON импорта сценария (React Flow: nodes + edges). */
function parseScenarioImportPayload(
  raw: string
):
  | { ok: true; nodes: any[]; edges: any[] }
  | { ok: false; code: 'parse' | 'object' | 'nodes' | 'edges' } {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { ok: false, code: 'object' };
    if (!Array.isArray((data as { nodes?: unknown }).nodes)) return { ok: false, code: 'nodes' };
    if (!Array.isArray((data as { edges?: unknown }).edges)) return { ok: false, code: 'edges' };
    return {
      ok: true,
      nodes: (data as { nodes: any[] }).nodes,
      edges: (data as { edges: any[] }).edges,
    };
  } catch {
    return { ok: false, code: 'parse' };
  }
}

interface EditorControlsProps {
  onExport?: () => void;
  onSave?: () => void;
  onOpenBlockLibrary?: () => void;
  hasUnsavedChanges?: boolean;
  /** Демо-режим: только просмотр, без редактирования */
  isReadOnly?: boolean;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  onExport,
  onSave,
  onOpenBlockLibrary,
  hasUnsavedChanges = false,
  isReadOnly = false,
}) => {
  const { id: botId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Bots state
  const [bots, setBots] = useState<Bot[]>([]);
  const [isNewBotOpen, setIsNewBotOpen] = useState(false);
  const [isNewScenarioNameOpen, setIsNewScenarioNameOpen] = useState(false);
  const [newScenarioSubmitBusy, setNewScenarioSubmitBusy] = useState(false);
  const [isAddFromMineOpen, setIsAddFromMineOpen] = useState(false);
  const [addFromMineBusy, setAddFromMineBusy] = useState(false);

  // Scenario store
  const {
    scenarios,
    currentScenarioId,
    currentBotId,
    isLoading: scenariosLoading,
    loadBotScenarios,
    selectScenario,
    createScenario,
    saveCurrentScenario,
    deleteScenario: deleteScenarioAPI,
    renameScenario,
    saveToLibrary: saveToLibraryAPI,
    enableAutoSave,
    disableAutoSave,
    hasUnsavedChanges: storeHasUnsaved,
    getDraftFromStorage,
    clearDraftFromStorage,
    updateCurrentScenario,
  } = useScenarioStore();

  // Editor store для toast
  const { showToast } = useEditorStore();

  // Auth store для проверки авторизации
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();

  const canEditScenario = hasAccessToAction(user?.role, 'scenario_edit');

  // Модальные окна
  const [isSaveToLibraryOpen, setIsSaveToLibraryOpen] = useState(false);
  const [isSaveBotOpen, setIsSaveBotOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  /** UI: кнопки хаба неактивны во время async */
  const [hubMenuBusy, setHubMenuBusy] = useState(false);
  const hubBusyRef = useRef(false);

  const beginHubAction = () => {
    if (hubBusyRef.current) return false;
    hubBusyRef.current = true;
    setHubMenuBusy(true);
    return true;
  };

  const endHubAction = () => {
    hubBusyRef.current = false;
    setHubMenuBusy(false);
  };

  // Загрузка ботов при монтировании
  useEffect(() => {
    const loadBots = async () => {
      try {
        const response = await getBots();
        setBots(response.items || []);
      } catch (err) {
        console.error('Failed to load bots:', err);
        // Если ошибка авторизации - ничего не делаем, боты загрузятся после входа
      }
    };
    loadBots();
  }, []);

  // Загрузка сценариев бота + списка «все мои» + выбор сценария из state навигации
  useEffect(() => {
    if (!botId || !user) return;

    const botIdNum = parseInt(botId);
    let cancelled = false;
    const pickScenarioId = (location.state as { pickScenarioId?: number } | null)?.pickScenarioId;

    (async () => {
      try {
        console.log('🔄 Loading scenarios for bot:', botIdNum);
        await loadBotScenarios(botIdNum);
        if (cancelled) return;

        if (pickScenarioId != null && !cancelled) {
          const st = useScenarioStore.getState();
          if (st.scenarios.some(s => s.id === pickScenarioId)) {
            st.selectScenario(pickScenarioId);
            navigate('.', { replace: true, state: {} });
          }
        }

        if (!isReadOnly && canEditScenario) {
          enableAutoSave();
        } else {
          disableAutoSave();
        }
      } catch (e: any) {
        if (cancelled) return;
        const is403 =
          e?.status === 403 ||
          (typeof e?.message === 'string' && e.message.includes('Access denied'));
        if (is403) {
          showToast('Нет доступа к этому боту. Выберите свой бот.', 'error');
          navigate('/dashboard/bots');
          return;
        }
        console.error('Failed to load scenarios:', e);
      }
    })();

    return () => {
      cancelled = true;
      disableAutoSave();
    };
    // pickScenarioId читается из location.state при смене botId (переход «Открыть» с другого бота).
    // Не добавляем location.state в deps — иначе после replace с пустым state будет лишняя перезагрузка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, user, isReadOnly, canEditScenario]);

  // Обработчик beforeunload — предупреждение при закрытии вкладки с несохранёнными изменениями
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (storeHasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Проверка локального черновика при загрузке сценария — предложение восстановить
  const shownRestoreRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentBotId || !currentScenarioId || isReadOnly || !canEditScenario) return;
    const key = `${currentBotId}_${currentScenarioId}`;
    if (shownRestoreRef.current.has(key)) return;

    const draft = getDraftFromStorage(currentBotId, currentScenarioId);
    if (!draft) return;

    shownRestoreRef.current.add(key);
    const restore = window.confirm(
      'Найдены несохранённые изменения с прошлой сессии. Восстановить?'
    );
    if (restore) {
      // Граф только в scenarioStore; EditorV2Shell подтянет nodes/edges по сигнатуре store
      updateCurrentScenario(draft.nodes, draft.edges);
      showToast('Черновик восстановлен', 'success');
    } else {
      clearDraftFromStorage();
    }
  }, [
    currentBotId,
    currentScenarioId,
    getDraftFromStorage,
    clearDraftFromStorage,
    updateCurrentScenario,
    showToast,
    isReadOnly,
    canEditScenario,
  ]);

  const handleSelectScenario = (scenarioId: number) => {
    selectScenario(scenarioId);
  };

  // При выборе бота — переходим (useEffect загрузит сценарии при изменении botId)
  const handleSelectBot = (newBotId: number) => {
    if (newBotId === (botId ? parseInt(botId) : null)) return; // Уже выбран
    navigate(`/editor/${newBotId}`);
  };

  const openNewScenarioNameModal = useCallback(() => {
    if (isReadOnly) return;
    if (!user) {
      showToast('Для создания сценариев необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }
    setIsNewScenarioNameOpen(true);
  }, [isReadOnly, user, showToast, openAuth]);

  const handleSubmitNewScenarioName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setNewScenarioSubmitBusy(true);
      try {
        await createScenario({
          name: trimmed,
          content: { nodes: [], edges: [] },
          is_main: false,
        });
        showToast(`Сценарий «${trimmed}» создан`, 'success');
        setIsNewScenarioNameOpen(false);
      } catch (error: any) {
        if (error.status === 401) {
          showToast('Для создания сценариев необходимо войти в систему', 'error');
          openAuth(window.location.pathname);
        } else {
          showToast(error.message || 'Ошибка при создании сценария', 'error');
        }
      } finally {
        setNewScenarioSubmitBusy(false);
      }
    },
    [createScenario, showToast, openAuth]
  );

  /** Копия графа в новый сценарий текущего бота (оригинал не меняется) */
  const handleCreateCopyFromMine = useCallback(
    async (source: Scenario) => {
      const raw = source.content;
      const nodes = Array.isArray(raw?.nodes) ? JSON.parse(JSON.stringify(raw.nodes)) : [];
      const edges = Array.isArray(raw?.edges) ? JSON.parse(JSON.stringify(raw.edges)) : [];
      const existingNames = new Set(useScenarioStore.getState().scenarios.map(s => s.name));
      let name = `${source.name} (копия)`;
      let k = 2;
      while (existingNames.has(name)) {
        name = `${source.name} (копия ${k})`;
        k += 1;
      }
      setAddFromMineBusy(true);
      try {
        await createScenario({
          name,
          content: { nodes, edges },
          is_main: false,
        });
        showToast('Копия добавлена в этого бота', 'success');
        setIsAddFromMineOpen(false);
      } catch (error: any) {
        if (error.status === 401) {
          showToast('Для создания сценариев необходимо войти в систему', 'error');
          openAuth(window.location.pathname);
        } else {
          showToast(error.message || 'Не удалось создать копию', 'error');
        }
      } finally {
        setAddFromMineBusy(false);
      }
    },
    [createScenario, showToast, openAuth]
  );

  const handleDeleteScenario = async (scenarioId: number) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    if (!confirm(`Удалить сценарий "${scenario.name}"?`)) return;

    try {
      await deleteScenarioAPI(scenarioId);
      showToast('Сценарий удалён', 'success');
    } catch (error: any) {
      showToast(error.message || 'Ошибка при удалении', 'error');
    }
  };

  const handleHubImportJson = useCallback(() => {
    if (isReadOnly) return;
    if (!user) {
      showToast('Для импорта необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = (input as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!beginHubAction()) return;

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = reader.result as string;
          const parsed = parseScenarioImportPayload(raw);
          if (!parsed.ok) {
            const map = {
              parse: 'Файл повреждён или неверный формат JSON',
              object: 'Некорректный формат: ожидается объект JSON',
              nodes: 'В файле нет списка узлов',
              edges: 'В файле нет списка связей',
            } as const;
            showToast(map[parsed.code], 'error');
            return;
          }

          let st = useScenarioStore.getState();
          if (!st.currentScenarioId) {
            await st.createScenario({
              name: 'Новый сценарий',
              content: { nodes: [], edges: [] },
              is_main: false,
            });
            st = useScenarioStore.getState();
          }

          st.importFromJson(parsed.nodes, parsed.edges);
          showToast('Граф импортирован в текущий сценарий', 'success');
        } catch (err: any) {
          showToast(err?.message || 'Не удалось импортировать файл', 'error');
        } finally {
          endHubAction();
        }
      };
      reader.onerror = () => {
        endHubAction();
        showToast('Не удалось прочитать файл', 'error');
      };
      reader.readAsText(file);
    };
    input.click();
  }, [isReadOnly, user, showToast, openAuth]);

  const handleRenameScenario = useCallback(
    async (scenarioId: number, name: string) => {
      try {
        await renameScenario(scenarioId, name);
        showToast('Название сохранено', 'success');
      } catch (error: any) {
        if (error?.status === 401) {
          showToast('Для редактирования необходимо войти в систему', 'error');
          openAuth(window.location.pathname);
        } else {
          showToast(error?.message || 'Не удалось переименовать', 'error');
        }
        throw error;
      }
    },
    [renameScenario, showToast, openAuth]
  );

  const openAddFromMineModal = useCallback(() => {
    if (isReadOnly) return;
    if (!user) {
      showToast('Для добавления сценария необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }
    setIsAddFromMineOpen(true);
  }, [isReadOnly, user, showToast, openAuth]);

  // Обработчики для SaveDropdown
  const handleQuickSave = async () => {
    if (!user) {
      showToast('Для сохранения сценариев необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }

    // Проверяем, есть ли выбранный сценарий
    if (!currentScenarioId) {
      showToast('Создайте или выберите сценарий в меню «Сценарий»', 'warning');
      return;
    }

    try {
      await saveCurrentScenario();
      showToast('Сценарий сохранён', 'success');
    } catch (error: any) {
      // Обработка ошибок авторизации
      if (error.status === 401) {
        showToast('Для сохранения сценариев необходимо войти в систему', 'error');
      } else {
        showToast(error.message || 'Ошибка при сохранении', 'error');
      }
    }
  };

  const handleSaveBot = () => {
    if (!user) {
      showToast('Для сохранения бота необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }
    setIsSaveBotOpen(true);
  };

  const handleSaveToLibrary = () => {
    if (!user) {
      showToast('Для сохранения в библиотеку необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }
    setIsSaveToLibraryOpen(true);
  };

  const handleExportToFile = () => {
    if (onExport) onExport();
  };

  // Обработчики для SaveToLibraryModal
  const handleSaveScenarioToLibrary = async (data: {
    name: string;
    description: string;
    category: string;
    icon: string;
    overwrite: boolean;
  }) => {
    try {
      await saveToLibraryAPI(data);
      showToast(`Сценарий "${data.name}" сохранён в библиотеку`, 'success');
      setIsSaveToLibraryOpen(false);
    } catch (error: any) {
      // Обработка ошибок авторизации
      if (error.status === 401) {
        showToast('Для сохранения в библиотеку необходимо войти в систему', 'error');
      } else {
        showToast(error.message || 'Ошибка при сохранении', 'error');
      }
    }
  };

  // Обработчики для SaveBotModal
  const handleSaveBotSubmit = async (data: {
    name: string;
    description: string;
    action: 'update' | 'copy' | 'rename';
  }) => {
    // TODO: Реализовать сохранение бота
    showToast('Функция в разработке', 'info');
    setIsSaveBotOpen(false);
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 10,
          columnGap: 12,
          padding: '12px 16px',
          backgroundColor: '#0f1729',
          borderBottom: '1px solid #1f2937',
          minWidth: 0,
        }}
      >
        {/* Кнопка "Добавить блок" — скрыта в read-only */}
        {onOpenBlockLibrary && !isReadOnly && (
          <button
            onClick={onOpenBlockLibrary}
            style={{
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#16a34a';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#22c55e';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="Открыть библиотеку блоков и добавить новый блок в сценарий"
          >
            <Plus size={18} />
            <span>Добавить блок</span>
          </button>
        )}

        {/* Меню сценариев */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Сценарий:
          </label>
          <ScenarioHubDropdown
            botScenarios={scenarios}
            currentScenarioId={currentScenarioId}
            isLoading={scenariosLoading}
            isReadOnly={isReadOnly}
            busy={hubMenuBusy}
            onSelectScenario={handleSelectScenario}
            onRequestCreate={openNewScenarioNameModal}
            onRequestAddFromMine={openAddFromMineModal}
            onImportJson={handleHubImportJson}
            onDeleteScenario={isReadOnly ? undefined : id => void handleDeleteScenario(id)}
            onRenameScenario={isReadOnly || !canEditScenario ? undefined : handleRenameScenario}
          />
        </div>

        {/* Разделитель */}
        <div
          style={{
            width: 1,
            height: 32,
            background: '#374151',
          }}
        />

        {/* Dropdown ботов */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Бот:
          </label>
          <BotsDropdown
            bots={bots.map(b => ({
              id: b.id,
              title: b.title || b.name || `Бот #${b.id}`,
              username: b.username || '',
              is_active: b.is_active,
            }))}
            currentBotId={botId ? parseInt(botId) : null}
            onSelectBot={handleSelectBot}
            onCreateBot={() => setIsNewBotOpen(true)}
            onCreateFromTemplate={() => navigate('/dashboard/templates')}
          />
        </div>

        {/* Предпросмотр и сохранение — справа */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Кнопка предпросмотра сценария */}
          <button
            onClick={() => {
              if (!currentScenarioId) {
                showToast('Сначала выберите сценарий', 'warning');
                return;
              }
              setIsSimulatorOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: '#0b1120',
              borderRadius: 999,
              border: '1px solid #1f2937',
              color: '#e5e7eb',
              fontSize: 13,
              fontWeight: 500,
              cursor: currentScenarioId ? 'pointer' : 'not-allowed',
              opacity: currentScenarioId ? 1 : 0.5,
            }}
            disabled={!currentScenarioId}
            title={
              currentScenarioId ? 'Предпросмотр сценария как чат' : 'Сначала выберите сценарий'
            }
          >
            <Eye size={16} />
            <span>Предпросмотр</span>
          </button>

          <Link
            to="/features?tab=blocks"
            title="Справка по блокам: что делает каждый шаг в сценарии"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid transparent',
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <BookOpen size={15} />
            <span>Справка по блокам</span>
          </Link>

          {/* SaveDropdown — в read-only только экспорт */}
          <SaveDropdown
            onQuickSave={isReadOnly ? undefined : handleQuickSave}
            onSaveBot={isReadOnly ? undefined : handleSaveBot}
            onSaveToLibrary={isReadOnly ? undefined : handleSaveToLibrary}
            onExportToFile={handleExportToFile}
            hasUnsavedChanges={storeHasUnsaved()}
          />
        </div>
      </div>

      {/* Модальные окна */}
      <NewScenarioNameModal
        isOpen={isNewScenarioNameOpen}
        onClose={() => !newScenarioSubmitBusy && setIsNewScenarioNameOpen(false)}
        onSubmit={handleSubmitNewScenarioName}
        busy={newScenarioSubmitBusy}
      />

      <AddScenarioFromMineModal
        isOpen={isAddFromMineOpen}
        onClose={() => !addFromMineBusy && setIsAddFromMineOpen(false)}
        onAddCopy={handleCreateCopyFromMine}
        busy={addFromMineBusy}
      />

      <SaveToLibraryModal
        isOpen={isSaveToLibraryOpen}
        onClose={() => setIsSaveToLibraryOpen(false)}
        onSave={handleSaveScenarioToLibrary}
        currentScenarioName={scenarios.find(s => s.id === currentScenarioId)?.name || 'Сценарий'}
      />

      <SaveBotModal
        isOpen={isSaveBotOpen}
        onClose={() => setIsSaveBotOpen(false)}
        onSave={handleSaveBotSubmit}
        currentBotName={`Бот #${botId}`}
        currentBotDescription="Описание бота"
        scenarioCount={scenarios.length}
        hasUnsavedChanges={storeHasUnsaved()}
      />

      <NewBotModal
        isOpen={isNewBotOpen}
        onClose={() => setIsNewBotOpen(false)}
        onBotCreated={newBotId => {
          // Обновляем список ботов
          getBots()
            .then(response => setBots(response.items || []))
            .catch(console.error);
        }}
      />

      <BotSimulator isOpen={isSimulatorOpen} onClose={() => setIsSimulatorOpen(false)} />
    </>
  );
};

export default EditorControls;
