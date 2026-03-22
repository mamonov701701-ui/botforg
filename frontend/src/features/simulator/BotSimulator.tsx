import React, { useEffect, useState, useMemo } from 'react';
import { X, PlayCircle } from 'lucide-react';
import { useScenarioStore } from '../../stores/scenarioStore';
import ChatPreview from './ChatPreview';
import {
  createInitialSimulatorState,
  stepFromCurrentNode,
  applyUserChoice,
  findStartNode,
  type SimulatorState,
  type RuntimeContext,
} from './scenarioRunner';
import { normalizeScenarioEdges, listInvalidFlowEdges } from '../../utils/flowHandleCompatibility';

interface BotSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Единый контракт: stepFromCurrentNode / applyUserChoice возвращают `context`, не `state`. */
function contextToSimulatorState(c: RuntimeContext): SimulatorState {
  return {
    currentNodeId: c.currentNodeId,
    history: Array.isArray(c.history) ? c.history : [],
    variables: c.variables && typeof c.variables === 'object' ? c.variables : {},
    lastUserInput: c.lastUserInput ?? null,
  };
}

const BotSimulator: React.FC<BotSimulatorProps> = ({ isOpen, onClose }) => {
  const { currentState } = useScenarioStore();
  const [simState, setSimState] = useState<SimulatorState | null>(null);
  const [waitingForUser, setWaitingForUser] = useState(false);
  const [fatalPreviewError, setFatalPreviewError] = useState<string | null>(null);
  const [handleCompatNotice, setHandleCompatNotice] = useState<string | null>(null);

  const graph = useMemo(() => {
    const nodes = currentState?.nodes || [];
    const edges = normalizeScenarioEdges(nodes, currentState?.edges || []);
    return { nodes, edges };
  }, [currentState]);

  useEffect(() => {
    if (!isOpen) {
      setFatalPreviewError(null);
      setHandleCompatNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      return;
    }
    if (!currentState) return;

    const nodes = currentState.nodes || [];
    const rawEdges = currentState.edges || [];

    if (nodes.length === 0) {
      setFatalPreviewError('Нет блоков в сценарии — добавьте блоки на холсте.');
      setHandleCompatNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      return;
    }

    const start = findStartNode(nodes);
    if (!start?.id) {
      setFatalPreviewError('Не удалось запустить предпросмотр: не найден стартовый блок.');
      setHandleCompatNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      return;
    }

    const handleIssues = listInvalidFlowEdges(nodes, rawEdges);
    const g = {
      nodes,
      edges: normalizeScenarioEdges(nodes, rawEdges),
    };

    const initial = createInitialSimulatorState(g);
    const stepResult = stepFromCurrentNode(g, initial);
    const ctx = stepResult?.context;

    if (!ctx) {
      setFatalPreviewError(
        'Не удалось запустить предпросмотр сценария: не удалось построить состояние выполнения.'
      );
      setHandleCompatNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      return;
    }

    const nextState = contextToSimulatorState(ctx);
    const w = Boolean(stepResult.waitingForUser);

    if (nextState.history.length === 0) {
      setFatalPreviewError(
        'Не удалось запустить предпросмотр: в сценарии есть некорректные связи или блоки. Проверьте соединения между блоками.'
      );
      setHandleCompatNotice(null);
      setSimState(nextState);
      setWaitingForUser(false);
      return;
    }

    setFatalPreviewError(null);
    setHandleCompatNotice(
      handleIssues.length > 0
        ? 'Часть связей была подстроена под текущий редактор (устаревшие точки подключения).'
        : null
    );
    setSimState(nextState);
    setWaitingForUser(w);
  }, [isOpen, currentState]);

  if (!isOpen || !currentState) return null;

  const handleContinue = () => {
    if (!simState) return;
    const stepResult = stepFromCurrentNode(graph, simState);
    const context = stepResult?.context;
    if (!context) {
      setFatalPreviewError(
        'Не удалось выполнить шаг симуляции. Закройте предпросмотр и попробуйте снова.'
      );
      return;
    }
    setSimState(contextToSimulatorState(context));
    setWaitingForUser(Boolean(stepResult.waitingForUser));
  };

  const handleUserChoice = (payload: {
    label: string;
    sourceHandle?: string | null;
    buttonId?: string;
  }) => {
    if (!simState) return;
    const choiceResult = applyUserChoice(graph, simState, payload);
    const afterChoice = choiceResult?.context;
    if (!afterChoice) {
      setFatalPreviewError(
        'Не удалось обработать выбор. Закройте предпросмотр и попробуйте снова.'
      );
      return;
    }
    const after = stepFromCurrentNode(graph, contextToSimulatorState(afterChoice));
    const ctx = after?.context;
    if (!ctx) {
      setFatalPreviewError('Не удалось продолжить сценарий после выбора.');
      return;
    }
    setSimState(contextToSimulatorState(ctx));
    setWaitingForUser(Boolean(after.waitingForUser));
  };

  const hasMessages = simState && simState.history.length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '95vw',
          height: 640,
          maxHeight: '95vh',
          background: '#020617',
          borderRadius: 24,
          border: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              'radial-gradient(circle at top left, rgba(56,189,248,0.25), transparent 55%), #020617',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '999px',
                background: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#022c22',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              Б
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Предпросмотр бота</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Симуляция сценария</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {fatalPreviewError && (
          <div
            style={{
              margin: '0 12px',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#fecaca',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {fatalPreviewError}
          </div>
        )}
        {handleCompatNotice && !fatalPreviewError && (
          <div
            style={{
              margin: '0 12px',
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59,130,246,0.35)',
              color: '#bfdbfe',
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            {handleCompatNotice}
          </div>
        )}

        <ChatPreview messages={simState?.history || []} onButtonClick={handleUserChoice} />

        <div
          style={{
            padding: 10,
            borderTop: '1px solid #1f2937',
            background: '#020617',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {waitingForUser
              ? 'Выберите ответ, чтобы продолжить'
              : hasMessages
                ? 'Продолжите сценарий'
                : 'Нажмите Старт, чтобы начать'}
          </div>
          <button
            onClick={handleContinue}
            disabled={waitingForUser || Boolean(fatalPreviewError)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: waitingForUser || fatalPreviewError ? '#111827' : '#22c55e',
              color: waitingForUser || fatalPreviewError ? '#6b7280' : '#022c22',
              fontSize: 13,
              fontWeight: 600,
              cursor: waitingForUser || fatalPreviewError ? 'default' : 'pointer',
            }}
          >
            <PlayCircle size={16} />
            {hasMessages ? 'Дальше' : 'Старт'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotSimulator;
