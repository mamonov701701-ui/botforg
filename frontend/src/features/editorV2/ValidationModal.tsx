import React, { useMemo } from 'react';
import { useValidationStore } from '../../stores/validationStore';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useScenarioDiagnosticsStore } from '../../stores/scenarioDiagnosticsStore';
import { getScenarioDiagnosticUiModel } from '../../utils/scenarioDiagnosticUi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Центрировать канвас на узле и открыть панель настроек */
  onNavigateToNode?: (nodeId: string) => void;
}

const rowStyle: React.CSSProperties = {
  background: '#0f1729',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: 16,
  cursor: 'pointer',
  textAlign: 'left' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
};

// Inner component that only renders when modal is open
const ValidationModalContent: React.FC<{
  onClose: () => void;
  onNavigateToNode?: (id: string) => void;
}> = ({ onClose, onNavigateToNode }) => {
  const validationResults = useValidationStore(state => state.validationResults);
  const invalidNodes = useMemo(
    () => Array.from(validationResults.values()).filter(r => !r.isValid),
    [validationResults]
  );

  const diagnostics = useScenarioDiagnosticsStore(state => state.list);
  const errorDiagnostics = useMemo(
    () => diagnostics.filter(d => d.severity === 'error'),
    [diagnostics]
  );
  const warningDiagnostics = useMemo(
    () => diagnostics.filter(d => d.severity === 'warning'),
    [diagnostics]
  );

  const scenarioNodes = useScenarioStore(state => state.currentState?.nodes);
  const nodes = useMemo(() => scenarioNodes ?? [], [scenarioNodes]);

  const nodeTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) {
      const t = (n.data as { title?: string })?.title || (n.data as { blockId?: string })?.blockId;
      if (t) m.set(n.id, String(t));
    }
    return m;
  }, [nodes]);

  const focusNode = (nodeId: string) => {
    onNavigateToNode?.(nodeId);
  };

  const hasSchemaErrors = invalidNodes.length > 0;
  const hasConsistencyErrors = errorDiagnostics.length > 0;
  const hasWarnings = warningDiagnostics.length > 0;
  const allClear = !hasSchemaErrors && !hasConsistencyErrors && !hasWarnings;

  const errorNodeIds = useMemo(() => {
    const s = new Set<string>();
    invalidNodes.forEach(n => s.add(n.nodeId));
    errorDiagnostics.forEach(d => s.add(d.blockId));
    return s.size;
  }, [invalidNodes, errorDiagnostics]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 12,
          padding: 24,
          maxWidth: 640,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: '2px solid #374151',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
            Проверка сценария
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {allClear ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: '#22c55e',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Ошибок и предупреждений не найдено</div>
          </div>
        ) : (
          <>
            {(hasSchemaErrors || hasConsistencyErrors) && (
              <div
                style={{
                  color: '#ef4444',
                  marginBottom: 16,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Ошибки: узлов с проблемами — {errorNodeIds}
              </div>
            )}

            {hasSchemaErrors && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Схема блоков (обязательные поля)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {invalidNodes.map(validation => (
                    <button
                      type="button"
                      key={validation.nodeId}
                      style={{ ...rowStyle, borderColor: '#7f1d1d' }}
                      onClick={() => focusNode(validation.nodeId)}
                      title={onNavigateToNode ? 'Перейти к блоку на схеме' : undefined}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                          {validation.blockTitle || nodeTitleById.get(validation.nodeId) || 'Узел'}
                        </div>
                        {onNavigateToNode && (
                          <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>
                            На схему →
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>
                        Идентификатор: {validation.nodeId}
                      </div>
                      <div style={{ color: '#ef4444', fontSize: 13 }}>Не заполнены поля:</div>
                      <ul
                        style={{
                          margin: '4px 0 0 20px',
                          padding: 0,
                          color: '#f87171',
                          fontSize: 13,
                        }}
                      >
                        {validation.missingFields.map((field, idx) => (
                          <li key={`${field}-${idx}`}>{field}</li>
                        ))}
                      </ul>
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>
                        Подсказка: откройте блок и заполните отмеченные поля в панели справа.
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasConsistencyErrors && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Консистентность (переменные, связи, плейсхолдеры)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {errorDiagnostics.map((d, idx) => {
                    const ui = getScenarioDiagnosticUiModel(d);
                    return (
                      <button
                        type="button"
                        key={`${d.blockId}-${d.code}-${idx}`}
                        style={{ ...rowStyle, borderColor: '#7f1d1d' }}
                        onClick={() => focusNode(d.blockId)}
                        title={onNavigateToNode ? 'Перейти к блоку на схеме' : undefined}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ color: '#fecaca', fontSize: 13, fontWeight: 700 }}>
                            {ui.title}
                          </div>
                          {onNavigateToNode && (
                            <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>
                              На схему →
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>
                          Блок: {nodeTitleById.get(d.blockId) || d.blockId}
                        </div>
                        <div
                          style={{
                            color: '#fff',
                            fontSize: 14,
                            marginBottom: ui.actionHint ? 8 : 0,
                          }}
                        >
                          {ui.body}
                        </div>
                        {ui.actionHint && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#93c5fd',
                              lineHeight: 1.45,
                              padding: '8px 10px',
                              background: 'rgba(30, 58, 138, 0.35)',
                              borderRadius: 6,
                            }}
                          >
                            {ui.actionHint}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hasWarnings && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Предупреждения ({warningDiagnostics.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {warningDiagnostics.map((d, idx) => {
                    const ui = getScenarioDiagnosticUiModel(d);
                    return (
                      <button
                        type="button"
                        key={`w-${d.blockId}-${d.code}-${idx}`}
                        style={{ ...rowStyle, borderColor: '#92400e' }}
                        onClick={() => focusNode(d.blockId)}
                        title={onNavigateToNode ? 'Перейти к блоку на схеме' : undefined}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ color: '#fcd34d', fontSize: 13, fontWeight: 700 }}>
                            {ui.title}
                          </div>
                          {onNavigateToNode && (
                            <span style={{ color: '#fdba74', fontSize: 12, fontWeight: 600 }}>
                              На схему →
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>
                          Блок: {nodeTitleById.get(d.blockId) || d.blockId}
                        </div>
                        <div
                          style={{
                            color: '#fef3c7',
                            fontSize: 14,
                            marginBottom: ui.actionHint ? 8 : 0,
                          }}
                        >
                          {ui.body}
                        </div>
                        {ui.actionHint && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#fde68a',
                              lineHeight: 1.45,
                              padding: '8px 10px',
                              background: 'rgba(120, 53, 15, 0.35)',
                              borderRadius: 6,
                            }}
                          >
                            {ui.actionHint}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

const ValidationModal: React.FC<Props> = ({ isOpen, onClose, onNavigateToNode }) => {
  if (!isOpen) {
    return null;
  }

  return <ValidationModalContent onClose={onClose} onNavigateToNode={onNavigateToNode} />;
};

export default ValidationModal;
