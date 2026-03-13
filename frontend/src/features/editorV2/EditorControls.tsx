import React, { useState, useEffect, useRef } from 'react';
import { Plus, History, Upload, Check, Loader2, AlertCircle, Eye } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import ScenariosDropdown from './ScenariosDropdown';
import BotsDropdown from './BotsDropdown';
import SaveDropdown from './SaveDropdown';
import NewScenarioModal from './NewScenarioModal';
import SaveToLibraryModal from './SaveToLibraryModal';
import SaveBotModal from './SaveBotModal';
import NewBotModal from './NewBotModal';
import VersionHistoryModal from './VersionHistoryModal';
import BotSimulator from '../simulator/BotSimulator';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getBots, type Bot } from '../../api/bot';
import { publishScenario } from '../../api/scenarios';
import { AccessLocked } from '../../components/AccessLocked';
import { hasAccessToAction } from '../../constants/roles';

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

  // Bots state
  const [bots, setBots] = useState<Bot[]>([]);
  const [isNewBotOpen, setIsNewBotOpen] = useState(false);

  // Scenario store
  const {
    scenarios,
    currentScenarioId,
    currentBotId,
    currentState,
    libraryScenarios,
    isLoading: scenariosLoading,
    loadBotScenarios,
    loadLibraryScenarios,
    selectScenario,
    createScenario,
    saveCurrentScenario,
    deleteScenario: deleteScenarioAPI,
    saveToLibrary: saveToLibraryAPI,
    addFromLibrary,
    enableAutoSave,
    disableAutoSave,
    hasUnsavedChanges: storeHasUnsaved,
    saveStatus,
    lastSaveError,
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
  const { setNodes, setEdges } = useEditorStore();

  // Модальные окна
  const [isNewScenarioOpen, setIsNewScenarioOpen] = useState(false);
  const [isSaveToLibraryOpen, setIsSaveToLibraryOpen] = useState(false);
  const [isSaveBotOpen, setIsSaveBotOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

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

  // Загрузка сценариев при монтировании (только для авторизованных пользователей)
  useEffect(() => {
    if (!botId || !user) return;

    const botIdNum = parseInt(botId);
    let cancelled = false;

    (async () => {
      try {
        console.log('🔄 Loading scenarios for bot:', botIdNum);
        await loadBotScenarios(botIdNum);
        if (cancelled) return;
        loadLibraryScenarios();
        // Автосохранение только при редактировании и наличии scenario_edit
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
      setNodes(draft.nodes);
      setEdges(draft.edges);
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
    setNodes,
    setEdges,
    updateCurrentScenario,
    showToast,
    isReadOnly,
    canEditScenario,
  ]);

  const handleSelectScenario = (scenarioId: string) => {
    selectScenario(parseInt(scenarioId));
  };

  // При выборе бота — переходим (useEffect загрузит сценарии при изменении botId)
  const handleSelectBot = (newBotId: number) => {
    if (newBotId === (botId ? parseInt(botId) : null)) return; // Уже выбран
    navigate(`/editor/${newBotId}`);
  };

  const currentScenario = scenarios.find(s => s.id === currentScenarioId);
  const canPublish = hasAccessToAction(user?.role, 'scenario_edit');
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);

  const handlePublishConfirmed = async () => {
    if (!currentScenarioId || !botId) return;

    const nodes = currentState?.nodes || [];
    const hasValidationErrors = currentState?.hasValidationErrors;

    if (!nodes.length) {
      showToast('Нельзя публиковать пустой сценарий', 'warning');
      setIsPublishConfirmOpen(false);
      return;
    }

    const hasStartNode = nodes.some(n => {
      const data: any = n.data || {};
      const t = (data.blockId || data.type || '').toString().toLowerCase();
      return t === 'start';
    });

    if (!hasStartNode) {
      showToast('В сценарии отсутствует стартовый блок', 'warning');
      setIsPublishConfirmOpen(false);
      return;
    }

    if (hasValidationErrors) {
      showToast('Нельзя публиковать сценарий с ошибками валидации', 'warning');
      setIsPublishConfirmOpen(false);
      return;
    }

    try {
      await publishScenario(currentScenarioId);
      showToast('Сценарий опубликован', 'success');
      await loadBotScenarios(parseInt(botId));
    } catch (err: any) {
      showToast(err?.message || 'Ошибка при публикации', 'error');
    } finally {
      setIsPublishConfirmOpen(false);
    }
  };

  const handleVersionHistoryRestore = async () => {
    if (!botId || !currentScenarioId) return;
    const botIdNum = parseInt(botId);
    await loadBotScenarios(botIdNum);
    selectScenario(currentScenarioId);
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === parseInt(scenarioId));
    if (!scenario) return;

    if (!confirm(`Удалить сценарий "${scenario.name}"?`)) return;

    try {
      await deleteScenarioAPI(parseInt(scenarioId));
      showToast('Сценарий удалён', 'success');
    } catch (error: any) {
      showToast(error.message || 'Ошибка при удалении', 'error');
    }
  };

  // Обработчики для NewScenarioModal
  const handleCreateEmpty = async (name: string, icon: string) => {
    if (!user) {
      showToast('Для создания сценариев необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }

    try {
      await createScenario({
        name,
        icon,
        content: { nodes: [], edges: [] },
        is_main: false,
      });
      showToast(`Сценарий "${name}" создан`, 'success');
      setIsNewScenarioOpen(false);
    } catch (error: any) {
      if (error.status === 401) {
        showToast('Для создания сценариев необходимо войти в систему', 'error');
        openAuth(window.location.pathname);
      } else {
        showToast(error.message || 'Ошибка при создании', 'error');
      }
    }
  };

  const handleCreateFromTemplate = async (templateId: string, name: string) => {
    try {
      await addFromLibrary(parseInt(templateId));
      showToast(`Сценарий "${name}" добавлен из библиотеки`, 'success');
      setIsNewScenarioOpen(false);
    } catch (error: any) {
      showToast(error.message || 'Ошибка при добавлении', 'error');
    }
  };

  const handleImportFromFile = async (file: File, name: string) => {
    // TODO: Реализовать импорт из файла
    showToast('Функция в разработке', 'info');
  };

  // Обработчики для SaveDropdown
  const handleQuickSave = async () => {
    if (!user) {
      showToast('Для сохранения сценариев необходимо войти в систему', 'error');
      openAuth(window.location.pathname);
      return;
    }

    // Проверяем, есть ли выбранный сценарий
    if (!currentScenarioId) {
      showToast('Сначала создайте сценарий', 'warning');
      setIsNewScenarioOpen(true);
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

  // Преобразуем сценарии для dropdown
  const scenariosForDropdown = scenarios.map(s => ({
    id: s.id.toString(),
    name: s.name,
    icon: s.icon || 'FileText',
  }));

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          backgroundColor: '#0f1729',
          borderBottom: '1px solid #1f2937',
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

        {/* Кнопка "Новый сценарий" — disabled в read-only */}
        <button
          disabled={isReadOnly}
          onClick={() => {
            if (isReadOnly) return;
            if (!user) {
              showToast('Для создания сценариев необходимо войти в систему', 'error');
              openAuth(window.location.pathname);
              return;
            }
            setIsNewScenarioOpen(true);
          }}
          style={{
            background: 'transparent',
            color: isReadOnly ? '#6b7280' : '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            cursor: isReadOnly ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
            opacity: isReadOnly ? 0.6 : 1,
          }}
          onMouseEnter={e => {
            if (!isReadOnly) e.currentTarget.style.background = '#1a1a2e';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
          }}
          title={isReadOnly ? 'Доступно в полной версии' : 'Создать новый сценарий в текущем боте'}
        >
          <Plus size={18} />
          <span>Новый сценарий</span>
        </button>

        {/* Dropdown сценариев + статус */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Сценарий:
          </label>
          {currentScenario && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background:
                  currentScenario.status === 'published'
                    ? 'rgba(34, 197, 94, 0.2)'
                    : currentScenario.status === 'archived'
                      ? 'rgba(148, 163, 184, 0.2)'
                      : 'rgba(156, 163, 175, 0.2)',
                color:
                  currentScenario.status === 'published'
                    ? '#22c55e'
                    : currentScenario.status === 'archived'
                      ? '#9ca3af'
                      : '#9ca3af',
              }}
            >
              {currentScenario.status === 'published'
                ? 'Опубликовано'
                : currentScenario.status === 'archived'
                  ? 'Архив'
                  : 'Черновик'}
            </span>
          )}
          <ScenariosDropdown
            scenarios={scenariosForDropdown}
            currentScenarioId={currentScenarioId?.toString() || ''}
            onSelectScenario={handleSelectScenario}
            onDeleteScenario={isReadOnly ? undefined : handleDeleteScenario}
            isLoading={scenariosLoading}
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

        {/* Опубликовать изменения */}
        <AccessLocked hasAccess={canPublish} actionKey="scenario_edit">
          <button
            onClick={() => setIsPublishConfirmOpen(true)}
            disabled={!currentScenarioId || isReadOnly}
            title={
              isReadOnly
                ? 'Доступно в полной версии'
                : currentScenarioId
                  ? 'Опубликовать изменения'
                  : 'Сначала выберите сценарий'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: !currentScenarioId || isReadOnly ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: !currentScenarioId || isReadOnly ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (currentScenarioId && !isReadOnly) {
                e.currentTarget.style.background = 'var(--primary-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Upload size={18} />
            Опубликовать
          </button>
        </AccessLocked>

        {/* История изменений — доступна для просмотра всем, восстановление через AccessLocked */}
        <button
          onClick={() => currentScenarioId && setIsVersionHistoryOpen(true)}
          disabled={!currentScenarioId}
          title={currentScenarioId ? 'История изменений' : 'Сначала выберите сценарий'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: 'transparent',
            border: '1px solid #374151',
            borderRadius: 6,
            color: '#9ca3af',
            fontSize: 14,
            fontWeight: 600,
            cursor: !currentScenarioId ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: !currentScenarioId ? 0.5 : 1,
          }}
          onMouseEnter={e => {
            if (currentScenarioId) {
              e.currentTarget.style.background = '#1a1a2e';
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#374151';
            e.currentTarget.style.color = '#9ca3af';
          }}
        >
          <History size={18} />
          История
        </button>

        {/* Разделитель */}
        <div
          style={{
            width: 1,
            height: 32,
            background: '#374151',
            marginLeft: 'auto',
          }}
        />

        {/* Кнопка предпросмотра бота */}
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
          title={currentScenarioId ? 'Предпросмотр сценария как чат' : 'Сначала выберите сценарий'}
        >
          <Eye size={16} />
          Preview Bot
        </button>

        {/* Индикатор состояния автосохранения */}
        {!isReadOnly && canEditScenario && currentScenarioId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color:
                saveStatus === 'error'
                  ? '#ef4444'
                  : saveStatus === 'saving'
                    ? '#9ca3af'
                    : '#22c55e',
            }}
            title={saveStatus === 'error' ? lastSaveError || undefined : undefined}
          >
            {saveStatus === 'saving' && (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            )}
            {saveStatus === 'error' && <AlertCircle size={14} />}
            {saveStatus === 'idle' && <Check size={14} />}
            <span>
              {saveStatus === 'saving' && 'Сохранение...'}
              {saveStatus === 'error' && 'Ошибка сохранения'}
              {saveStatus === 'idle' && 'Сохранено'}
            </span>
          </div>
        )}

        {/* SaveDropdown — в read-only только экспорт */}
        <SaveDropdown
          onQuickSave={isReadOnly ? undefined : handleQuickSave}
          onSaveBot={isReadOnly ? undefined : handleSaveBot}
          onSaveToLibrary={isReadOnly ? undefined : handleSaveToLibrary}
          onExportToFile={handleExportToFile}
          hasUnsavedChanges={storeHasUnsaved()}
        />
      </div>

      {/* Модальные окна */}
      <NewScenarioModal
        isOpen={isNewScenarioOpen}
        onClose={() => setIsNewScenarioOpen(false)}
        onCreateEmpty={handleCreateEmpty}
        onCreateFromTemplate={handleCreateFromTemplate}
        onImportFromFile={handleImportFromFile}
        libraryScenarios={libraryScenarios}
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

      {isPublishConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#020617',
              borderRadius: 12,
              padding: 24,
              width: 420,
              maxWidth: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              border: '1px solid #1f2937',
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 8,
                color: '#f9fafb',
              }}
            >
              Опубликовать сценарий?
            </h2>
            <p
              style={{
                fontSize: 14,
                color: '#9ca3af',
                marginBottom: 12,
              }}
            >
              Текущая версия черновика будет сохранена как опубликованная. Это повлияет на работу
              бота.
            </p>
            <ul
              style={{
                fontSize: 13,
                color: '#e5e7eb',
                marginBottom: 16,
                paddingLeft: 18,
              }}
            >
              <li>• Сценарий не должен быть пустым.</li>
              <li>• Должен быть настроен стартовый блок.</li>
              <li>• Не должно быть ошибок валидации.</li>
            </ul>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                onClick={() => setIsPublishConfirmOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #374151',
                  background: 'transparent',
                  color: '#e5e7eb',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={handlePublishConfirmed}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Опубликовать
              </button>
            </div>
          </div>
        </div>
      )}

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

      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        scenarioId={currentScenarioId}
        scenarioName={scenarios.find(s => s.id === currentScenarioId)?.name || 'Сценарий'}
        onRestoreSuccess={handleVersionHistoryRestore}
      />

      <BotSimulator isOpen={isSimulatorOpen} onClose={() => setIsSimulatorOpen(false)} />
    </>
  );
};

export default EditorControls;
