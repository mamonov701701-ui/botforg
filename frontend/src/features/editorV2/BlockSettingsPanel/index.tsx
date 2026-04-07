import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
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
import {
  validateNodeSettings,
  isMessageBlockMediaValidationMessage,
} from '../../../utils/schemaValidation';
import {
  messageMediaListRowCompatibleWithDeclared,
  type MessageMediaKind,
} from '../../../utils/messageMedia';
import { FieldRenderer } from './FieldRenderer';
import { MessageBlockSettingsForm } from './MessageBlockSettingsForm';
import { InputBlockSettingsForm } from './InputBlockSettingsForm';
import { BlockConfigField } from '../../../types/blocks';
import { useScenarioStore } from '../../../stores/scenarioStore';
import {
  useScenarioDiagnosticsStore,
  SCENARIO_DIAGNOSTICS_EMPTY_NODE,
} from '../../../stores/scenarioDiagnosticsStore';
import { getScenarioDiagnosticUiModel } from '../../../utils/scenarioDiagnosticUi';
import type { ScenarioDiagnostic } from '../../../utils/scenarioConsistency';

interface Props {
  selectedNode: Node;
  onClose: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUpdateNode?: (nodeId: string, updates: Partial<Node>) => void;
  /** Демо-режим: только просмотр, без редактирования */
  isReadOnly?: boolean;
}

// Tooltip component
const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 40,
        left: rect.left + rect.width / 2,
      });
    }
  };

  const handleMouseEnter = () => {
    setShow(true);
    updatePosition();
  };

  return (
    <>
      <div
        ref={buttonRef}
        style={{ position: 'relative', display: 'inline-flex' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 6,
            fontSize: 12,
            color: '#e5e7eb',
            whiteSpace: 'nowrap',
            zIndex: 100000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
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
    </>
  );
};

export default function BlockSettingsPanel({
  selectedNode,
  onClose,
  onDelete,
  onDuplicate,
  onUpdateNode,
  isReadOnly = false,
}: Props) {
  const catalog = useEditorStore(state => state.catalog);
  const showToast = useEditorStore(state => state.showToast);
  const currentBotId = useScenarioStore(state => state.currentBotId);
  const setValidationResult = useValidationStore(state => state.setValidationResult);
  const [hasChanges, setHasChanges] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Find block definition from catalog
  const block = useMemo(
    () => catalog.find(b => b.id === selectedNode.data.blockId),
    [catalog, selectedNode.data.blockId]
  );

  // Reset local state when node changes
  useEffect(() => {
    setHasChanges(false);
    setShowHelp(false);
    setShowAdvanced(false);
    setShowDiagnostics(false);
  }, [selectedNode.id]);

  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const settingsJson = JSON.stringify(selectedNode.data?.settings ?? {});

  // Валидация: debounce + сравнение с предыдущим результатом, чтобы не писать в store на каждый символ
  // (это вызывало каскад обновлений validation → узлы → сценарий).
  useEffect(() => {
    if (!block) return;

    const t = window.setTimeout(() => {
      const node = selectedNodeRef.current;
      const validation = validateNodeSettings(node, block);
      const prev = useValidationStore.getState().getNodeValidation(node.id);
      const same =
        prev &&
        prev.isValid === validation.isValid &&
        prev.missingFields.length === validation.missingFields.length &&
        prev.missingFields.every((m, i) => m === validation.missingFields[i]);
      if (same) return;
      setValidationResult(node.id, validation);
    }, 60);

    return () => clearTimeout(t);
  }, [block, settingsJson, selectedNode.id, setValidationResult]);

  const nodeDiagPick = useCallback(
    (s: { byNodeId: Map<string, ScenarioDiagnostic[]> }) => s.byNodeId.get(selectedNode.id),
    [selectedNode.id]
  );
  const scenarioDiagnosticsRaw = useScenarioDiagnosticsStore(nodeDiagPick);
  const scenarioDiagnosticsForNode =
    scenarioDiagnosticsRaw === undefined ? SCENARIO_DIAGNOSTICS_EMPTY_NODE : scenarioDiagnosticsRaw;
  const scenarioDiagErrors = useMemo(
    () => scenarioDiagnosticsForNode.filter(d => d.severity === 'error'),
    [scenarioDiagnosticsForNode]
  );
  const scenarioDiagWarnings = useMemo(
    () => scenarioDiagnosticsForNode.filter(d => d.severity === 'warning'),
    [scenarioDiagnosticsForNode]
  );

  const initialSettings = selectedNode.data.settings || {};

  const liveMessageSchema = useMemo(() => {
    if (block?.id !== 'message' || !block) return null;
    return validateNodeSettings(selectedNode, block);
  }, [block, selectedNode.id, settingsJson]);

  const liveInputSchema = useMemo(() => {
    if (block?.id !== 'input' || !block) return null;
    return validateNodeSettings(selectedNode, block);
  }, [block, selectedNode.id, settingsJson]);

  const isFieldDirty = (fieldName: string, value: any) => {
    const initial = initialSettings?.[fieldName];
    return JSON.stringify(initial ?? null) !== JSON.stringify(value ?? null);
  };

  // Handle field change - updates node.data.settings
  const handleFieldChange = (fieldName: string, value: any) => {
    if (isReadOnly) return;

    // Смена типа медиа: один тип на весь блок — убираем несовместимые вложения и при «Без медиа» очищаем список.
    if (onUpdateNode && block?.id === 'message' && fieldName === 'mediaType') {
      const prev = selectedNode.data.settings || {};
      const oldType = prev.mediaType;
      const newType = value;

      const mediaLabels: Record<string, string> = {
        none: 'Без медиа',
        image: 'Картинка / фото',
        gif: 'GIF / анимация',
        video: 'Видео',
      };

      let nextSettings: Record<string, unknown> = { ...prev, mediaType: value };

      if (newType === 'none') {
        nextSettings = { ...nextSettings, mediaList: [], mediaUrl: '' };
        if (Array.isArray(prev.mediaList) && prev.mediaList.length > 0) {
          showToast('Тип «Без медиа»: список вложений очищен.', 'info');
        }
      } else if (newType !== 'none' && Array.isArray(prev.mediaList) && prev.mediaList.length > 0) {
        const declared = newType as MessageMediaKind;
        const filtered = prev.mediaList.filter((row: unknown) =>
          messageMediaListRowCompatibleWithDeclared(row, declared)
        );
        const removed = prev.mediaList.length - filtered.length;
        if (removed > 0) {
          const typeLabel = mediaLabels[String(newType)] ?? newType;
          const reason =
            oldType === newType
              ? 'не соответствовали выбранному типу медиа'
              : 'не соответствовали новому типу';
          showToast(
            `Тип медиа — ${typeLabel}. Удалено вложений: ${removed} (${reason}).`,
            'warning'
          );
          nextSettings = { ...nextSettings, mediaList: filtered };
        }
      }

      setHasChanges(true);
      onUpdateNode(selectedNode.id, {
        data: {
          ...selectedNode.data,
          settings: nextSettings,
        },
      });
      return;
    }

    if (!hasChanges && isFieldDirty(fieldName, value)) {
      setHasChanges(true);
    }

    // Используем переданный onUpdateNode если доступен (из React Flow),
    // иначе используем Zustand (для обратной совместимости)
    if (onUpdateNode) {
      onUpdateNode(selectedNode.id, {
        data: {
          ...selectedNode.data,
          settings: {
            [fieldName]: value,
          },
        },
      });
    } else {
      console.warn(
        'BlockSettingsPanel: передайте onUpdateNode (граф в scenarioStore / React Flow).'
      );
    }
  };

  // Handle title change - updates node.data.title (but keeps icon unchanged)
  const handleTitleChange = (newTitle: string) => {
    if (isReadOnly) return;
    setHasChanges(true);

    // Используем переданный onUpdateNode если доступен (из React Flow),
    // иначе используем Zustand (для обратной совместимости)
    if (onUpdateNode) {
      onUpdateNode(selectedNode.id, {
        data: {
          ...selectedNode.data,
          title: newTitle,
          // Иконка остается неизменной - не трогаем data.icon
        },
      });
    } else {
      console.warn(
        'BlockSettingsPanel: передайте onUpdateNode (граф в scenarioStore / React Flow).'
      );
    }
  };

  // Handle save - показывает подтверждение (изменения уже применены)
  const handleSave = async () => {
    if (block) {
      const validation = validateNodeSettings(selectedNode, block);
      setValidationResult(selectedNode.id, validation);

      if (validation.isValid) {
        let showedPlaceholderWarning = false;
        if (
          block.id === 'message' &&
          currentBotId &&
          typeof selectedNode.data.settings?.text === 'string' &&
          selectedNode.data.settings.text.includes('{{')
        ) {
          try {
            const { postMessageTemplateDiagnostics } = await import(
              '../../../api/botMessageTemplate'
            );
            const d = await postMessageTemplateDiagnostics(
              currentBotId,
              selectedNode.data.settings.text
            );
            if (d.ctor_bot_linked && d.unknown_keys?.length) {
              showToast(
                `Сохранено. Неизвестные плейсхолдеры: ${d.unknown_keys.join(', ')}`,
                'warning'
              );
              showedPlaceholderWarning = true;
            }
          } catch {
            /* нет сети или нет связки ctor */
          }
        }
        if (!showedPlaceholderWarning) {
          showToast('Настройки блока сохранены', 'success');
        }
        setHasChanges(false);
      } else {
        const parts = validation.missingFields;
        const detail =
          parts.length <= 4
            ? parts.join('; ')
            : `${parts.slice(0, 4).join('; ')}; … (+${parts.length - 4})`;
        showToast(`Исправьте ошибки перед сохранением: ${detail}`, 'warning');
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

  // Count validation errors (для «Сообщение» — полная схема, включая кнопки и медиа)
  const validationErrors = useMemo(() => {
    if (!block) return 0;
    if (block.id === 'input' && liveInputSchema) {
      return liveInputSchema.isValid ? 0 : liveInputSchema.missingFields.length;
    }
    if (!block.configSchema) return 0;
    if (block.id === 'message' && liveMessageSchema) {
      return liveMessageSchema.isValid ? 0 : liveMessageSchema.missingFields.length;
    }
    return block.configSchema.filter(field =>
      validateField(field, selectedNode.data.settings?.[field.name])
    ).length;
  }, [block, selectedNode.data.settings, liveMessageSchema, liveInputSchema]);

  const totalScenarioDiagIssues = scenarioDiagErrors.length + scenarioDiagWarnings.length;

  const getDiagnosticTargetLabel = (d: ScenarioDiagnostic): string | null => {
    switch (d.code) {
      case 'InputVariableKeyInvalid':
      case 'InputVariableKeyMissing':
        return 'Ключ переменной';
      case 'MessageUnknownPlaceholder':
      case 'RequiredFieldMissing':
        return 'Текст вопроса';
      case 'MissingOutgoingEdge':
        return 'Исходящая связь';
      case 'ConditionUnknownVariable':
        return 'Условие';
      default:
        return null;
    }
  };

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
              <span style={{ fontSize: 20 }}>{selectedNode.data.icon || block.icon || '📦'}</span>
              <div style={{ fontWeight: 800, fontSize: 18 }}>
                {selectedNode.data.title || block.title}
              </div>
              {/* Validation status badge */}
              {((block.configSchema && block.configSchema.length > 0) || block.id === 'input') && (
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
              {hasChanges && !isReadOnly && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    background: 'rgba(251, 191, 36, 0.15)',
                    color: '#fbbf24',
                    borderRadius: 999,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  Локальные изменения
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

      {(scenarioDiagErrors.length > 0 || scenarioDiagWarnings.length > 0) && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1f2937',
            background: 'rgba(30, 41, 59, 0.65)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: scenarioDiagErrors.length > 0 ? '#fecaca' : '#fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>
              {scenarioDiagErrors.length > 0
                ? `⚠ ${totalScenarioDiagIssues} ${totalScenarioDiagIssues === 1 ? 'ошибка' : 'ошибки'} в блоке`
                : `❗ ${totalScenarioDiagIssues} предупреждения в блоке`}
            </span>
            <button
              onClick={() => setShowDiagnostics(v => !v)}
              style={{
                border: '1px solid #334155',
                background: 'rgba(15, 23, 42, 0.45)',
                color: '#cbd5e1',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {showDiagnostics ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {showDiagnostics && (
            <div
              style={{
                marginTop: 8,
                maxHeight: 120,
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {[...scenarioDiagErrors, ...scenarioDiagWarnings].map((d, i) => {
                  const ui = getScenarioDiagnosticUiModel(d);
                  const isError = d.severity === 'error';
                  const targetLabel = getDiagnosticTargetLabel(d);
                  return (
                    <li
                      key={`${d.severity}-${d.code}-${i}`}
                      style={{
                        borderRadius: 6,
                        border: isError
                          ? '1px solid rgba(185, 28, 28, 0.45)'
                          : '1px solid rgba(180, 83, 9, 0.45)',
                        background: isError ? 'rgba(127, 29, 29, 0.2)' : 'rgba(120, 53, 15, 0.2)',
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ color: isError ? '#fca5a5' : '#fcd34d' }}>
                        {isError ? '⚠' : '❗'}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0' }}>{ui.title}</span>
                      {targetLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#93c5fd',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            borderRadius: 999,
                            padding: '2px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {targetLabel}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Form Fields */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {/* Поле для редактирования названия блока - всегда первое */}
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: 8,
            border: '1px solid transparent',
            transition: 'all 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e5e7eb' }}>Название блока</span>
          </div>
          <input
            type="text"
            value={selectedNode.data.title || block.title || ''}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder={block.title || 'Введите название'}
            readOnly={isReadOnly}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: isReadOnly ? '#0f1729' : '#1f2937',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#e5e7eb',
              fontSize: 14,
              outline: 'none',
              transition: 'all 0.2s ease',
              cursor: isReadOnly ? 'default' : 'text',
              opacity: isReadOnly ? 0.9 : 1,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.background = '#252540';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = '#374151';
              e.currentTarget.style.background = '#1f2937';
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: '#9ca3af',
              marginTop: 6,
              opacity: 0.7,
            }}
          >
            Иконка блока остаётся неизменной
          </div>
        </div>

        {block.id === 'input' ? (
          <>
            <InputBlockSettingsForm
              settings={(selectedNode.data.settings || {}) as Record<string, unknown>}
              onFieldChange={handleFieldChange}
              onSettingsPatch={patch => {
                if (isReadOnly || !onUpdateNode) return;
                setHasChanges(true);
                onUpdateNode(selectedNode.id, {
                  data: {
                    ...selectedNode.data,
                    settings: patch,
                  },
                });
              }}
              isReadOnly={isReadOnly}
            />
          </>
        ) : block.configSchema && block.configSchema.length > 0 ? (
          block.id === 'message' &&
          block.configSchema.some(f => f.name === 'text') &&
          block.configSchema.some(f => f.name === 'buttons') ? (
            <>
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: '#6b7280',
                }}
              >
                Содержимое сообщения
              </div>
              <MessageBlockSettingsForm
                settings={(selectedNode.data.settings || {}) as Record<string, unknown>}
                onFieldChange={handleFieldChange}
                isReadOnly={isReadOnly}
                textFieldConfig={
                  block.configSchema.find(f => f.name === 'text') as BlockConfigField
                }
                buttonsFieldConfig={
                  block.configSchema.find(f => f.name === 'buttons') as BlockConfigField
                }
                liveMessageSchema={liveMessageSchema}
                validateField={validateField}
                platformBotId={currentBotId}
              />
            </>
          ) : (
            <>
              {/* Основные настройки */}
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: '#6b7280',
                }}
              >
                Основные настройки
              </div>
              {block.configSchema
                .filter(f => !f.isAdvanced)
                .map(field => {
                  const mediaExtra =
                    block.id === 'message' && field.name === 'mediaList' && liveMessageSchema
                      ? liveMessageSchema.missingFields.filter(isMessageBlockMediaValidationMessage)
                      : [];
                  const baseErr = validateField(field, selectedNode.data.settings?.[field.name]);
                  const error =
                    mediaExtra.length > 0
                      ? [baseErr, ...mediaExtra].filter(Boolean).join(' · ')
                      : baseErr;
                  const isExpanded = expandedFields.has(field.name);

                  return (
                    <div
                      key={field.name}
                      style={{
                        marginBottom: 16,
                        padding: 12,
                        background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                        borderRadius: 8,
                        border: error
                          ? '1px solid rgba(239, 68, 68, 0.3)'
                          : '1px solid transparent',
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
                          {field.required && (
                            <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
                          )}
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
                        allSettings={selectedNode.data.settings}
                        isReadOnly={isReadOnly}
                        blockId={selectedNode.data.blockId}
                        onResetToDefault={
                          typeof field.default !== 'undefined'
                            ? () => handleFieldChange(field.name, field.default)
                            : undefined
                        }
                      />
                    </div>
                  );
                })}

              {/* Расширенные настройки */}
              {block.id !== 'message' && block.configSchema.some(f => f.isAdvanced) && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: showAdvanced ? '#1a1a2e' : 'transparent',
                      border: '1px solid #374151',
                      borderRadius: 8,
                      color: '#9ca3af',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#1a1a2e';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseLeave={e => {
                      if (!showAdvanced) e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = '#374151';
                    }}
                  >
                    <span>⚙️ Расширенные настройки</span>
                    <span
                      style={{
                        transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s',
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {showAdvanced && (
                    <div style={{ marginTop: 12, animation: 'fadeIn 0.2s ease' }}>
                      {block.configSchema
                        .filter(f => f.isAdvanced)
                        .map(field => {
                          const error = validateField(
                            field,
                            selectedNode.data.settings?.[field.name]
                          );
                          const isExpanded = expandedFields.has(field.name);

                          return (
                            <div
                              key={field.name}
                              style={{
                                marginBottom: 12,
                                padding: 12,
                                background: error
                                  ? 'rgba(239, 68, 68, 0.1)'
                                  : 'rgba(30, 41, 59, 0.5)',
                                borderRadius: 8,
                                border: error
                                  ? '1px solid rgba(239, 68, 68, 0.3)'
                                  : '1px solid transparent',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {/* Field header */}
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
                                  {field.required && (
                                    <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
                                  )}
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
                                allSettings={selectedNode.data.settings}
                                isReadOnly={isReadOnly}
                                blockId={selectedNode.data.blockId}
                                onResetToDefault={
                                  typeof field.default !== 'undefined'
                                    ? () => handleFieldChange(field.name, field.default)
                                    : undefined
                                }
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </>
          )
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
        {/* Save button — скрыт в read-only */}
        {!isReadOnly && (
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
        )}

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

        {onDelete && (
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
        )}
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
