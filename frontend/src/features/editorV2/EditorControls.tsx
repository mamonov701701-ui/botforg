import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import ScenariosDropdown from './ScenariosDropdown';
import SaveDropdown from './SaveDropdown';
import NewScenarioModal from './NewScenarioModal';
import SaveToLibraryModal from './SaveToLibraryModal';
import SaveBotModal from './SaveBotModal';

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
  // Стартовый сценарий (создается автоматически при создании бота)
  // TODO: Заменить на данные из API/store
  const [scenarios] = useState([
    { id: '1', name: 'Главный', icon: 'Home' },
    // Остальные сценарии добавляются через "Новый сценарий"
  ]);

  const [currentScenarioId, setCurrentScenarioId] = useState('1');

  // Модальные окна
  const [isNewScenarioOpen, setIsNewScenarioOpen] = useState(false);
  const [isSaveToLibraryOpen, setIsSaveToLibraryOpen] = useState(false);
  const [isSaveBotOpen, setIsSaveBotOpen] = useState(false);

  const handleSelectScenario = (scenarioId: string) => {
    setCurrentScenarioId(scenarioId);
    // TODO: Загрузить nodes и edges выбранного сценария
    console.log('Switching to scenario:', scenarioId);
  };

  const handleDeleteScenario = (scenarioId: string) => {
    // TODO: Подтверждение и удаление сценария
    console.log('Delete scenario:', scenarioId);
    if (confirm('Удалить этот сценарий?')) {
      // Удаление
    }
  };

  // Обработчики для NewScenarioModal
  const handleCreateEmpty = (name: string, icon: string) => {
    console.log('Create empty scenario:', name, icon);
    // TODO: Создать пустой сценарий и переключиться на него
  };

  const handleCreateFromTemplate = (templateId: string, name: string) => {
    console.log('Create from template:', templateId, name);
    // TODO: Создать сценарий из шаблона
  };

  const handleImportFromFile = (file: File, name: string) => {
    console.log('Import from file:', file.name, name);
    // TODO: Импортировать сценарий из файла
  };

  // Обработчики для SaveDropdown
  const handleQuickSave = () => {
    console.log('Quick save');
    if (onSave) onSave();
  };

  const handleSaveBot = () => {
    setIsSaveBotOpen(true);
  };

  const handleSaveToLibrary = () => {
    setIsSaveToLibraryOpen(true);
  };

  const handleExportToFile = () => {
    console.log('Export to file');
    if (onExport) onExport();
  };

  // Обработчики для SaveToLibraryModal
  const handleSaveScenarioToLibrary = (data: {
    name: string;
    description: string;
    category: string;
    icon: string;
    overwrite: boolean;
  }) => {
    console.log('Save scenario to library:', data);
    // TODO: Сохранить сценарий в библиотеку через API
  };

  // Обработчики для SaveBotModal
  const handleSaveBotSubmit = (data: {
    name: string;
    description: string;
    action: 'update' | 'copy' | 'rename';
  }) => {
    console.log('Save bot:', data);
    // TODO: Сохранить бота через API
  };

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
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
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
          hasUnsavedChanges={hasUnsavedChanges}
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
        currentScenarioName={scenarios.find(s => s.id === currentScenarioId)?.name}
      />

      <SaveBotModal
        isOpen={isSaveBotOpen}
        onClose={() => setIsSaveBotOpen(false)}
        onSave={handleSaveBotSubmit}
        currentBotName="Магазин одежды"
        currentBotDescription="Бот для интернет-магазина"
        scenarioCount={scenarios.length}
        hasUnsavedChanges={hasUnsavedChanges}
      />
    </>
  );
};

export default EditorControls;
