import React, { useEffect, useState } from 'react';
import { BlockConfigField } from '../../../../types/blocks';
import { useScenarioStore } from '../../../../stores/scenarioStore';
import { Plus, AlertCircle, ExternalLink } from 'lucide-react';

interface Props {
  field: BlockConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

export const ScenarioSelectField: React.FC<Props> = ({ field, value, onChange, error }) => {
  const { scenarios, currentBotId, createScenario } = useScenarioStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Получить название выбранного сценария
  const selectedScenario = scenarios.find(s => s.id === value);
  const isScenarioMissing = value && !selectedScenario;

  const handleCreateScenario = async () => {
    if (!newScenarioName.trim() || !currentBotId) return;

    setIsCreating(true);
    try {
      const newScenario = await createScenario({
        name: newScenarioName.trim(),
        bot_id: currentBotId,
      });
      onChange(newScenario.id);
      setShowCreateForm(false);
      setNewScenarioName('');
    } catch (err) {
      console.error('Failed to create scenario:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      {/* Предупреждение если сценарий не найден */}
      {isScenarioMissing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            marginBottom: 8,
            fontSize: 12,
            color: '#ef4444',
          }}
        >
          <AlertCircle size={14} />
          <span>Сценарий не найден (возможно, удалён)</span>
        </div>
      )}

      {/* Select */}
      <select
        value={value || ''}
        onChange={e => {
          const val = e.target.value;
          if (val === '__create__') {
            setShowCreateForm(true);
          } else {
            onChange(val ? parseInt(val) : null);
          }
        }}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: error ? 'rgba(239, 68, 68, 0.1)' : '#1a1a2e',
          border: `1px solid ${error ? '#ef4444' : '#374151'}`,
          borderRadius: 8,
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        <option value="">— Выберите сценарий —</option>

        {scenarios
          .filter(s => s.bot_id === currentBotId)
          .map(scenario => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.icon ? `${scenario.icon} ` : '📄 '}
              {scenario.name}
              {scenario.is_main ? ' (главный)' : ''}
            </option>
          ))}

        <option value="__create__" style={{ borderTop: '1px solid #374151' }}>
          + Создать новый сценарий
        </option>
      </select>

      {/* Форма создания нового сценария */}
      {showCreateForm && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#1f2937',
            borderRadius: 8,
            border: '1px solid #374151',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#e5e7eb' }}>
            Создать новый сценарий
          </div>

          <input
            type="text"
            value={newScenarioName}
            onChange={e => setNewScenarioName(e.target.value)}
            placeholder="Название сценария..."
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#0f1729',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              marginBottom: 8,
            }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateScenario();
              if (e.key === 'Escape') setShowCreateForm(false);
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreateScenario}
              disabled={isCreating || !newScenarioName.trim()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: isCreating ? 'wait' : 'pointer',
                opacity: isCreating || !newScenarioName.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Plus size={14} />
              {isCreating ? 'Создание...' : 'Создать'}
            </button>

            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewScenarioName('');
              }}
              style={{
                padding: '8px 12px',
                background: '#374151',
                border: 'none',
                borderRadius: 6,
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Ссылка на выбранный сценарий */}
      {selectedScenario && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ExternalLink size={12} />
          <span>
            Будет запущен сценарий:{' '}
            <strong style={{ color: '#9ca3af' }}>{selectedScenario.name}</strong>
          </span>
        </div>
      )}

      {/* Ошибка валидации */}
      {error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
