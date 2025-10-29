import React, { useMemo, useEffect, useState } from 'react';
import { Node } from 'reactflow';
import { useEditorStore } from '../../../stores/editorStore';
import { useValidationStore } from '../../../stores/validationStore';
import { validateNodeSettings } from '../../../utils/schemaValidation';
import { FieldRenderer } from './FieldRenderer';
import { BlockConfigField } from '../../../types/blocks';

interface Props {
  selectedNode: Node;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export default function BlockSettingsPanel({
  selectedNode,
  onClose,
  onDelete,
  onDuplicate,
}: Props) {
  const catalog = useEditorStore(state => state.catalog);
  const setNodes = useEditorStore(state => state.setNodes);
  const showToast = useEditorStore(state => state.showToast);
  const setValidationResult = useValidationStore(state => state.setValidationResult);
  const [hasChanges, setHasChanges] = useState(false);

  // Find block definition from catalog
  const block = useMemo(
    () => catalog.find(b => b.id === selectedNode.data.blockId),
    [catalog, selectedNode.data.blockId]
  );

  // Reset changes when node changes
  useEffect(() => {
    setHasChanges(false);
  }, [selectedNode.id]);

  // Validate on mount and when settings change
  useEffect(() => {
    if (block) {
      const validation = validateNodeSettings(selectedNode, block);
      setValidationResult(selectedNode.id, validation);
    }
  }, [selectedNode, block, setValidationResult]);

  // Handle field change - updates node.data.settings
  const handleFieldChange = (fieldName: string, value: any) => {
    setHasChanges(true);
    setNodes(nodes =>
      nodes.map(n =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                settings: {
                  ...n.data.settings,
                  [fieldName]: value,
                },
              },
            }
          : n
      )
    );
  };

  // Handle save - показывает подтверждение (изменения уже применены)
  const handleSave = () => {
    if (block) {
      const validation = validateNodeSettings(selectedNode, block);
      setValidationResult(selectedNode.id, validation);

      if (validation.isValid) {
        showToast('Настройки блока сохранены', 'success');
        setHasChanges(false);
      } else {
        showToast('Исправьте ошибки перед сохранением', 'warning');
      }
    }
  };

  // Validate field
  const validateField = (field: BlockConfigField, value: any): string | undefined => {
    if (field.required && (value === null || value === undefined || value === '')) {
      return 'Обязательное поле';
    }
    return undefined;
  };

  // Handle inspect - logs settings to console
  const handleInspect = () => {
    console.group('🔍 Node Inspection');
    console.log('Node ID:', selectedNode.id);
    console.log('Block ID:', selectedNode.data.blockId);
    console.log('Block Title:', selectedNode.data.title);
    console.log('Settings:', selectedNode.data.settings);
    console.log('Full Node:', selectedNode);
    console.groupEnd();
  };

  if (!block) {
    return (
      <div
        style={{
          height: '100%',
          padding: 16,
          background: '#0b1b2a',
          color: '#e2e8f0',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>❌ Блок не найден</div>
        <div style={{ opacity: 0.7, marginBottom: 8 }}>
          ID блока: {selectedNode.data.blockId || 'не указан'}
        </div>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          Блок не найден в каталоге. Возможно, он был удалён или изменён.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0b1b2a',
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: 16, borderBottom: '1px solid #1f2937', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>{block.icon || '📦'}</span>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{block.title}</div>
            </div>
            <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.4, marginBottom: 4 }}>
              {block.description}
            </div>
            <div style={{ opacity: 0.5, fontSize: 11 }}>ID: {selectedNode.id}</div>
          </div>
          {/* Кнопка закрытия */}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: 20,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              borderRadius: 4,
            }}
            title="Закрыть панель"
            onMouseEnter={e => {
              e.currentTarget.style.background = '#252540';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {block.configSchema && block.configSchema.length > 0 ? (
          block.configSchema.map(field => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={selectedNode.data.settings?.[field.name] ?? field.default}
              onChange={v => handleFieldChange(field.name, v)}
              error={validateField(field, selectedNode.data.settings?.[field.name])}
            />
          ))
        ) : (
          <div
            style={{
              padding: 16,
              background: '#1a1a2e',
              borderRadius: 8,
              textAlign: 'center',
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: 13 }}>У этого блока нет настраиваемых параметров</div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          padding: 16,
          borderTop: '1px solid #1f2937',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {/* Кнопка Сохранить - всегда видна */}
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            minWidth: 120,
            padding: '10px 12px',
            borderRadius: 8,
            background: hasChanges ? '#22c55e' : '#374151',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'background 0.2s ease',
          }}
          title={hasChanges ? 'Сохранить изменения' : 'Настройки сохранены'}
        >
          <span>💾</span>
          <span>Сохранить</span>
        </button>

        {/* Кнопка Inspect */}
        <button
          onClick={handleInspect}
          style={{
            width: 44,
            borderRadius: 8,
            background: '#3b82f6',
            border: 'none',
            color: '#fff',
            fontWeight: 800,
            fontSize: 18,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Посмотреть данные блока в консоли"
        >
          🔍
        </button>

        {/* Кнопка Дублировать */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            style={{
              width: 44,
              borderRadius: 8,
              background: '#6366f1',
              border: 'none',
              color: '#fff',
              fontWeight: 800,
              fontSize: 18,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Дублировать блок"
          >
            📋
          </button>
        )}

        {/* Кнопка Удалить */}
        <button
          onClick={onDelete}
          style={{
            width: 44,
            borderRadius: 8,
            background: '#ef4444',
            border: 'none',
            color: '#fff',
            fontWeight: 800,
            fontSize: 18,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Удалить блок"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
