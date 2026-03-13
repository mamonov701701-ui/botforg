import React, { useEffect, useState, useMemo } from 'react';
import { X, PlayCircle } from 'lucide-react';
import { useScenarioStore } from '../../stores/scenarioStore';
import ChatPreview from './ChatPreview';
import {
  createInitialSimulatorState,
  stepFromCurrentNode,
  applyUserChoice,
  type SimulatorState,
} from './scenarioRunner';

interface BotSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
}

const BotSimulator: React.FC<BotSimulatorProps> = ({ isOpen, onClose }) => {
  const { currentState } = useScenarioStore();
  const [simState, setSimState] = useState<SimulatorState | null>(null);
  const [waitingForUser, setWaitingForUser] = useState(false);

  const graph = useMemo(
    () => ({
      nodes: currentState?.nodes || [],
      edges: currentState?.edges || [],
    }),
    [currentState]
  );

  useEffect(() => {
    if (!isOpen) return;
    const initial = createInitialSimulatorState(graph);
    const { state, waitingForUser: w } = stepFromCurrentNode(graph, initial);
    setSimState(state);
    setWaitingForUser(w);
  }, [isOpen, graph]);

  if (!isOpen || !currentState) return null;

  const handleContinue = () => {
    if (!simState) return;
    const { context, waitingForUser: w } = stepFromCurrentNode(graph, simState);
    setSimState({
      currentNodeId: context.currentNodeId,
      history: context.history,
      variables: context.variables,
      lastUserInput: context.lastUserInput,
    });
    setWaitingForUser(w);
  };

  const handleUserChoice = (payload: {
    label: string;
    sourceHandle?: string | null;
    buttonId?: string;
  }) => {
    if (!simState) return;
    const { context } = applyUserChoice(graph, simState, payload);
    const after = stepFromCurrentNode(graph, {
      currentNodeId: context.currentNodeId,
      history: context.history,
      variables: context.variables,
      lastUserInput: context.lastUserInput,
    });
    setSimState({
      currentNodeId: after.context.currentNodeId,
      history: after.context.history,
      variables: after.context.variables,
      lastUserInput: after.context.lastUserInput,
    });
    setWaitingForUser(after.waitingForUser);
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
              B
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Bot preview</div>
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
            disabled={waitingForUser}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: waitingForUser ? '#111827' : '#22c55e',
              color: waitingForUser ? '#6b7280' : '#022c22',
              fontSize: 13,
              fontWeight: 600,
              cursor: waitingForUser ? 'default' : 'pointer',
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
