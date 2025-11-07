import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ScenariosDropdown from './ScenariosDropdown';
import SaveDropdown from './SaveDropdown';
import NewScenarioModal from './NewScenarioModal';
import SaveToLibraryModal from './SaveToLibraryModal';
import SaveBotModal from './SaveBotModal';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useEditorStore } from '../../stores/editorStore';

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
  const { botId } = useParams<{ botId: string }>();

  // Scenario store
  const {
    scenarios,
    currentScenarioId,
    loadBotScenarios,
    loadLibraryScenarios,
    selectScenario,
    createScenario,
    saveCurrentScenario,
    deleteScenario: deleteScenarioAPI,
    saveToLibrary: saveToLibraryAPI,
    enableAutoSave,
    disableAutoSave,
    hasUnsavedChanges: storeHasUnsaved,
  } = useScenarioStore();

  // Editor store для toast
  const { showToast } = useEditorStore();

  // Модальные окна
  const [isNewScenarioOpen, setIsNewScenarioOpen] = useState(false);
  const [isSaveToLibraryOpen, setIsSaveToLibraryOpen] = useState(false);
  const [isSaveBotOpen, setIsSaveBotOpen] = useState(false);

  // Загрузка сценариев при монтировании
  useEffect(() => {
    if (botId) {
      loadBotScenarios(parseInt(botId));
      loadLibraryScenarios();
      enableAutoSave(); // Включаем автосохранение
    }

    return () => {
      disableAutoSave(); // Выключаем при размонтировании
    };
  }, [botId, loadBotScenarios, loadLibraryScenarios, enableAutoSave, disableAutoSave]);

  const handleSelectScenario = (scenarioId: string) => {
    selectScenario(parseInt(scenarioId));
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
      showToast(error.message || 'Ошибка при создании', 'error');
    }
  };

  const handleCreateFromTemplate = async (templateId: string, name: string) => {
    // TODO: Реализовать импорт из библиотеки
    showToast('Функция в разработке', 'info');
  };

  const handleImportFromFile = async (file: File, name: string) => {
    // TODO: Реализовать импорт из файла
    showToast('Функция в разработке', 'info');
  };

  // Обработчики для SaveDropdown
  const handleQuickSave = async () => {
    try {
      await saveCurrentScenario();
      showToast('Сценарий сохранён', 'success');
    } catch (error: any) {
      showToast(error.message || 'Ошибка при сохранении', 'error');
    }
  };

  const handleSaveBot = () => {
    setIsSaveBotOpen(true);
  };

  const handleSaveToLibrary = () => {
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
      showToast(error.message || 'Ошибка при сохранении', 'error');
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
          onClick={() => setIsNewScenarioOpen(true)}
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
            Сценарии:
          </label>
          <ScenariosDropdown
            scenarios={scenariosForDropdown}
            currentScenarioId={currentScenarioId?.toString() || ''}
            onSelectScenario={handleSelectScenario}
            onDeleteScenario={handleDeleteScenario}
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
    </>
  );
};

export default EditorControls;
