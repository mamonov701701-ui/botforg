import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import ScenariosDropdown from './ScenariosDropdown';
import BotsDropdown from './BotsDropdown';
import SaveDropdown from './SaveDropdown';
import NewScenarioModal from './NewScenarioModal';
import SaveToLibraryModal from './SaveToLibraryModal';
import SaveBotModal from './SaveBotModal';
import NewBotModal from './NewBotModal';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getBots, type Bot } from '../../api/bot';

interface EditorControlsProps {
  onExport?: () => void;
  onSave?: () => void;
  onOpenBlockLibrary?: () => void;
  hasUnsavedChanges?: boolean;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  onExport,
  onSave,
  onOpenBlockLibrary,
  hasUnsavedChanges = false,
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
  } = useScenarioStore();

  // Editor store для toast
  const { showToast } = useEditorStore();

  // Auth store для проверки авторизации
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();

  // Модальные окна
  const [isNewScenarioOpen, setIsNewScenarioOpen] = useState(false);
  const [isSaveToLibraryOpen, setIsSaveToLibraryOpen] = useState(false);
  const [isSaveBotOpen, setIsSaveBotOpen] = useState(false);

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
    if (botId && user) {
      const botIdNum = parseInt(botId);
      console.log('🔄 Loading scenarios for bot:', botIdNum);

      loadBotScenarios(botIdNum);
      loadLibraryScenarios();
      enableAutoSave(); // Включаем автосохранение
    }

    return () => {
      disableAutoSave(); // Выключаем при размонтировании
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, user]); // botId и user в зависимостях

  const handleSelectScenario = (scenarioId: string) => {
    selectScenario(parseInt(scenarioId));
  };

  // При выборе бота — переходим (useEffect загрузит сценарии при изменении botId)
  const handleSelectBot = (newBotId: number) => {
    if (newBotId === (botId ? parseInt(botId) : null)) return; // Уже выбран
    navigate(`/editor/${newBotId}`);
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
        {/* Кнопка "Добавить блок" */}
        {onOpenBlockLibrary && (
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

        {/* Кнопка "Новый сценарий" */}
        <button
          onClick={() => {
            if (!user) {
              showToast('Для создания сценариев необходимо войти в систему', 'error');
              openAuth(window.location.pathname);
              return;
            }
            setIsNewScenarioOpen(true);
          }}
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid #374151',
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
            e.currentTarget.style.background = '#1a1a2e';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
          }}
          title="Создать новый сценарий в текущем боте"
        >
          <Plus size={18} />
          <span>Новый сценарий</span>
        </button>

        {/* Dropdown сценариев */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Сценарий:
          </label>
          <ScenariosDropdown
            scenarios={scenariosForDropdown}
            currentScenarioId={currentScenarioId?.toString() || ''}
            onSelectScenario={handleSelectScenario}
            onDeleteScenario={handleDeleteScenario}
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

        {/* Разделитель */}
        <div
          style={{
            width: 1,
            height: 32,
            background: '#374151',
            marginLeft: 'auto',
          }}
        />

        {/* SaveDropdown */}
        <SaveDropdown
          onQuickSave={handleQuickSave}
          onSaveBot={handleSaveBot}
          onSaveToLibrary={handleSaveToLibrary}
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
    </>
  );
};

export default EditorControls;
