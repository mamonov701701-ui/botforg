import React, { useEffect, useState } from 'react';
import { BlockConfigField } from '../../../../types/blocks';
import { getScenarioNodes, ScenarioNode } from '../../../../api/scenarios';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  field: BlockConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  // ID сценария для загрузки блоков (передаётся из родительского компонента)
  scenarioId?: number;
}

export const NodeSelectField: React.FC<Props> = ({ field, value, onChange, error, scenarioId }) => {
  const [nodes, setNodes] = useState<ScenarioNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Загрузка блоков при изменении сценария
  useEffect(() => {
    if (!scenarioId) {
      setNodes([]);
      return;
    }

    const loadNodes = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const scenarioNodes = await getScenarioNodes(scenarioId);
        setNodes(scenarioNodes);
      } catch (err) {
        console.error('Failed to load scenario nodes:', err);
        setLoadError('Не удалось загрузить блоки сценария');
        setNodes([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadNodes();
  }, [scenarioId]);

  // Проверка, существует ли выбранный блок
  const selectedNode = nodes.find(n => n.id === value);
  const isNodeMissing = value && nodes.length > 0 && !selectedNode;

  // Если сценарий не выбран
  if (!scenarioId) {
    return (
      <div
        style={{
          padding: '12px',
          background: '#1a1a2e',
          borderRadius: 8,
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        Сначала выберите сценарий
      </div>
    );
  }

  return (
    <div>
      {/* Загрузка */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px',
            background: '#1a1a2e',
            borderRadius: 8,
            fontSize: 12,
            color: '#9ca3af',
          }}
        >
          <Loader2
            size={14}
            className="animate-spin"
            style={{ animation: 'spin 1s linear infinite' }}
          />
          Загрузка блоков...
        </div>
      )}

      {/* Ошибка загрузки */}
      {loadError && (
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
          <span>{loadError}</span>
        </div>
      )}

      {/* Предупреждение если блок не найден */}
      {isNodeMissing && (
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
          <span>Блок не найден в сценарии (возможно, удалён)</span>
        </div>
      )}

      {/* Select */}
      {!isLoading && !loadError && (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value || null)}
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
          disabled={nodes.length === 0}
        >
          <option value="">— Выберите блок —</option>

          {nodes.map(node => (
            <option key={node.id} value={node.id}>
              {node.icon ? `${node.icon} ` : '📦 '}
              {node.title}
              {node.block_type === 'start' ? ' (начало)' : ''}
            </option>
          ))}
        </select>
      )}

      {/* Пустой список */}
      {!isLoading && !loadError && nodes.length === 0 && (
        <div
          style={{
            padding: '12px',
            background: '#1a1a2e',
            borderRadius: 8,
            fontSize: 12,
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          В сценарии нет блоков
        </div>
      )}

      {/* Выбранный блок */}
      {selectedNode && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#6b7280',
          }}
        >
          Выполнение начнётся с блока:{' '}
          <strong style={{ color: '#9ca3af' }}>{selectedNode.title}</strong>
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

      {/* CSS для анимации */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};
