import React, { useMemo, useEffect, useState } from 'react';
import { Node } from 'reactflow';
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Info,
  Copy,
  Trash2,
  Eye,
  Save,
  X,
} from 'lucide-react';
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

// Tooltip component
const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 6,
            fontSize: 12,
            color: '#e5e7eb',
            whiteSpace: 'nowrap',
            zIndex: 100,
            marginBottom: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {text}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: 6,
              borderStyle: 'solid',
              borderColor: '#1f2937 transparent transparent transparent',
            }}
          />
        </div>
      )}
    </div>
  );
};

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
  const [showHelp, setShowHelp] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  // Find block definition from catalog
  const block = useMemo(
    () => catalog.find(b => b.id === selectedNode.data.blockId),
    [catalog, selectedNode.data.blockId]
  );

  // Reset changes when node changes
  useEffect(() => {
    setHasChanges(false);
    setShowHelp(false);
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
    showToast('Данные блока выведены в консоль (F12)', 'info');
  };

  // Toggle field expansion
  const toggleFieldExpand = (fieldName: string) => {
    setExpandedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return newSet;
    });
  };

  // Count validation errors
  const validationErrors = useMemo(() => {
    if (!block?.configSchema) return 0;
    return block.configSchema.filter(field =>
      validateField(field, selectedNode.data.settings?.[field.name])
    ).length;
  }, [block, selectedNode.data.settings]);

  // Специальная обработка для системного блока "start"
  if (!block) {
    // Если это блок "start" - показываем информацию о системном блоке
    if (selectedNode.data.blockId === 'start') {
      return (
        <div
          style={{
            height: '100%',
            padding: 16,
            background: '#0b1b2a',
            color: '#e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>▶️</span>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#10B981' }}>Начало</div>
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ opacity: 0.7, marginBottom: 12, fontSize: 14 }}>
            Системный блок - точка входа сценария
          </div>
          <div
            style={{
              padding: 12,
              background: '#1f2937',
              borderRadius: 8,
              fontSize: 13,
              opacity: 0.8,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Info size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
            <span>
              Это специальный системный блок, с которого начинается выполнение сценария. Он не
              требует настройки и создается автоматически.
            </span>
          </div>
        </div>
      );
    }

    // Для других блоков показываем ошибку
    return (
      <div
        style={{
          height: '100%',
          padding: 16,
          background: '#0b1b2a',
          color: '#e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertCircle size={24} color="#ef4444" />
          <div style={{ fontWeight: 800, fontSize: 18 }}>Блок не найден</div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ opacity: 0.7, marginBottom: 8 }}>
          ID блока:{' '}
          <code style={{ background: '#1f2937', padding: '2px 6px', borderRadius: 4 }}>
            {selectedNode.data.blockId || 'не указан'}
          </code>
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
              {/* Validation status badge */}
              {block.configSchema && block.configSchema.length > 0 && (
                <Tooltip
                  text={validationErrors > 0 ? `${validationErrors} ошибок` : 'Всё заполнено'}
                >
                  {validationErrors > 0 ? (
                    <AlertCircle size={16} color="#ef4444" />
                  ) : (
                    <CheckCircle size={16} color="#22c55e" />
                  )}
                </Tooltip>
              )}
            </div>
            <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.4, marginBottom: 4 }}>
              {block.description}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>ID: {selectedNode.id}</span>
              {hasChanges && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    background: 'rgba(251, 191, 36, 0.2)',
                    color: '#fbbf24',
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  Не сохранено
                </span>
              )}
            </div>
          </div>
          {/* Header buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <Tooltip text="Справка">
              <button
                onClick={() => setShowHelp(!showHelp)}
                style={{
                  background: showHelp ? '#3b82f6' : 'transparent',
                  border: 'none',
                  color: showHelp ? '#fff' : '#9ca3af',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 4,
                  display: 'flex',
                }}
              >
                <HelpCircle size={18} />
              </button>
            </Tooltip>
            <Tooltip text="Закрыть">
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 4,
                  display: 'flex',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#252540';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#9ca3af';
                }}
              >
                <X size={18} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Help panel */}
        {showHelp && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#1f2937',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#3b82f6' }}>
              💡 Как использовать этот блок
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, opacity: 0.9 }}>
              <li>Заполните все обязательные поля (отмечены *)</li>
              <li>Изменения сохраняются автоматически при вводе</li>
              <li>Нажмите «Сохранить» для проверки валидности</li>
              <li>Используйте 🔍 для отладки данных в консоли</li>
            </ul>
            {block.planAccess && (
              <div style={{ marginTop: 8, opacity: 0.7 }}>
                📋 Доступен в тарифах: {block.planAccess.join(', ')}
              </div>
            )}
          </div>
        )}
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
          block.configSchema.map(field => {
            const error = validateField(field, selectedNode.data.settings?.[field.name]);
            const isExpanded = expandedFields.has(field.name);

            return (
              <div
                key={field.name}
                style={{
                  marginBottom: 16,
                  padding: 12,
                  background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                  borderRadius: 8,
                  border: error ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Field header with description toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#e5e7eb' }}>
                    {field.label || field.name}
                    {field.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                  </span>
                  {field.description && (
                    <button
                      onClick={() => toggleFieldExpand(field.name)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                        padding: 2,
                        display: 'flex',
                      }}
                    >
                      <Info size={14} />
                    </button>
                  )}
                </div>

                {/* Field description */}
                {field.description && isExpanded && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                      marginBottom: 8,
                      padding: '6px 8px',
                      background: '#1f2937',
                      borderRadius: 4,
                      animation: 'fadeIn 0.2s ease',
                    }}
                  >
                    {field.description}
                  </div>
                )}

                {/* Field input */}
                <FieldRenderer
                  field={field}
                  value={selectedNode.data.settings?.[field.name] ?? field.default}
                  onChange={v => handleFieldChange(field.name, v)}
                  error={error}
                />
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: 24,
              background: '#1a1a2e',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <CheckCircle size={32} color="#22c55e" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Настройки не требуются
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>Этот блок работает автоматически</div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid #1f2937',
          display: 'flex',
          gap: 8,
        }}
      >
        {/* Save button */}
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            background: hasChanges ? '#22c55e' : '#374151',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            if (hasChanges) e.currentTarget.style.background = '#16a34a';
          }}
          onMouseLeave={e => {
            if (hasChanges) e.currentTarget.style.background = '#22c55e';
          }}
        >
          <Save size={16} />
          {hasChanges ? 'Сохранить' : 'Сохранено'}
        </button>

        {/* Action buttons */}
        <Tooltip text="Инспектор (консоль)">
          <button
            onClick={handleInspect}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#3b82f6',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#3b82f6')}
          >
            <Eye size={18} />
          </button>
        </Tooltip>

        {onDuplicate && (
          <Tooltip text="Дублировать">
            <button
              onClick={onDuplicate}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: '#6366f1',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
            >
              <Copy size={18} />
            </button>
          </Tooltip>
        )}

        <Tooltip text="Удалить">
          <button
            onClick={onDelete}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#ef4444',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.background = '#ef4444')}
          >
            <Trash2 size={18} />
          </button>
        </Tooltip>
      </div>

      {/* CSS for animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
}
