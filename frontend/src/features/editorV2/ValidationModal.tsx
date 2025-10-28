import React from 'react';
import { useValidationStore } from '../../stores/validationStore';
import { useEditorStore } from '../../stores/editorStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Inner component that only renders when modal is open
const ValidationModalContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Only subscribe when this component is rendered (modal is open)
  const invalidNodes = useValidationStore(state => {
    const results = Array.from(state.validationResults.values());
    return results.filter(r => !r.isValid);
  });

  const nodes = useEditorStore(state => state.nodes);

  const handleNavigateToNode = (nodeId: string) => {
    // Find node and highlight it
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      // Log for debugging - could be enhanced with React Flow API methods
      console.log('Navigate to node:', nodeId, node);
      // TODO: Use setCenter or fitView from useReactFlow to focus on node
    }
  };

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
          maxWidth: 600,
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

        {invalidNodes.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: '#22c55e',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Все узлы настроены правильно</div>
          </div>
        ) : (
          <>
            <div
              style={{
                color: '#ef4444',
                marginBottom: 16,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Найдено ошибок: {invalidNodes.length}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {invalidNodes.map(validation => (
                <div
                  key={validation.nodeId}
                  style={{
                    background: '#0f1729',
                    border: '1px solid #374151',
                    borderRadius: 8,
                    padding: 16,
                  }}
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
                      {validation.blockTitle || 'Узел'}
                    </div>
                    <button
                      onClick={() => handleNavigateToNode(validation.nodeId)}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Перейти
                    </button>
                  </div>

                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>
                    ID: {validation.nodeId}
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
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button
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

const ValidationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  // Don't render content when closed - this prevents store subscriptions
  if (!isOpen) {
    return null;
  }

  return <ValidationModalContent onClose={onClose} />;
};

export default ValidationModal;
