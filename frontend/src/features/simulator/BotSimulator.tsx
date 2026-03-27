import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, PlayCircle } from 'lucide-react';
import { useScenarioStore } from '../../stores/scenarioStore';
import ChatPreview from './ChatPreview';
import {
  createInitialSimulatorState,
  runUntilUserPauseOrEnd,
  applyUserChoice,
  completeWaitStep,
  findStartNode,
  type SimulatorState,
  type RuntimeContext,
  type ScenarioGraph,
} from './scenarioRunner';
import { normalizeScenarioEdges, listInvalidFlowEdges } from '../../utils/flowHandleCompatibility';

interface BotSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Единый контракт: stepFromCurrentNode / applyUserChoice возвращают `context`, не `state`. */
function contextToSimulatorState(c: RuntimeContext): SimulatorState {
  return {
    graph: c.graph,
    graphsByScenarioId: c.graphsByScenarioId,
    scenarioTitlesById: c.scenarioTitlesById,
    activeScenarioId: c.activeScenarioId,
    currentNodeId: c.currentNodeId,
    history: Array.isArray(c.history) ? c.history : [],
    variables: c.variables && typeof c.variables === 'object' ? c.variables : {},
    lastUserInput: c.lastUserInput ?? null,
  };
}

const BotSimulator: React.FC<BotSimulatorProps> = ({ isOpen, onClose }) => {
  const currentState = useScenarioStore(s => s.currentState);
  const scenarios = useScenarioStore(s => s.scenarios);
  const currentScenarioId = useScenarioStore(s => s.currentScenarioId);
  const [simState, setSimState] = useState<SimulatorState | null>(null);
  const [waitingForUser, setWaitingForUser] = useState(false);
  /** Лимит шагов: показать «Дальше», иначе автопрокрутка без лишних кликов */
  const [showManualContinue, setShowManualContinue] = useState(false);
  const [fatalPreviewError, setFatalPreviewError] = useState<string | null>(null);
  const [handleCompatNotice, setHandleCompatNotice] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  /** Активная визуальная пауза блока wait (мс); по окончании — completeWaitStep + автопродолжение */
  const [waitDelayMs, setWaitDelayMs] = useState<number | null>(null);
  const simRef = useRef<SimulatorState | null>(null);
  const isOpenRef = useRef(isOpen);
  simRef.current = simState;
  isOpenRef.current = isOpen;

  const previewBundle = useMemo(() => {
    const graphsByScenarioId: Record<number, ScenarioGraph> = {};
    const scenarioTitlesById: Record<number, string> = {};
    for (const sc of scenarios) {
      const n = sc.content?.nodes || [];
      const e = normalizeScenarioEdges(n, sc.content?.edges || []);
      graphsByScenarioId[sc.id] = { nodes: n, edges: e };
      scenarioTitlesById[sc.id] = sc.name;
    }
    return { graphsByScenarioId, scenarioTitlesById };
  }, [scenarios]);

  useEffect(() => {
    if (!isOpen) {
      setFatalPreviewError(null);
      setHandleCompatNotice(null);
      setTransitionNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      setShowManualContinue(false);
      setWaitDelayMs(null);
      return;
    }
    if (!currentState) return;

    const nodes = currentState.nodes || [];
    const rawEdges = currentState.edges || [];

    if (nodes.length === 0) {
      setFatalPreviewError('Нет блоков в сценарии — добавьте блоки на холсте.');
      setHandleCompatNotice(null);
      setTransitionNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      setShowManualContinue(false);
      setWaitDelayMs(null);
      return;
    }

    const start = findStartNode(nodes);
    if (!start?.id) {
      setFatalPreviewError('Не удалось запустить предпросмотр: не найден стартовый блок.');
      setHandleCompatNotice(null);
      setTransitionNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      setShowManualContinue(false);
      setWaitDelayMs(null);
      return;
    }

    const handleIssues = listInvalidFlowEdges(nodes, rawEdges);
    const g = {
      nodes,
      edges: normalizeScenarioEdges(nodes, rawEdges),
    };

    const initial = createInitialSimulatorState(g, {
      graphsByScenarioId: previewBundle.graphsByScenarioId,
      scenarioTitlesById: previewBundle.scenarioTitlesById,
      rootScenarioId: currentScenarioId,
    });
    const stepResult = runUntilUserPauseOrEnd(initial);
    const ctx = stepResult?.context;

    if (!ctx) {
      setFatalPreviewError(
        'Не удалось запустить предпросмотр сценария: не удалось построить состояние выполнения.'
      );
      setHandleCompatNotice(null);
      setTransitionNotice(null);
      setSimState(null);
      setWaitingForUser(false);
      setShowManualContinue(false);
      setWaitDelayMs(null);
      return;
    }

    const nextState = contextToSimulatorState(ctx);
    const w = Boolean(stepResult.waitingForUser);
    setShowManualContinue(Boolean(stepResult.stalledMaxSteps));

    if (nextState.history.length === 0) {
      setFatalPreviewError(
        'Не удалось запустить предпросмотр: в сценарии есть некорректные связи или блоки. Проверьте соединения между блоками.'
      );
      setHandleCompatNotice(null);
      setTransitionNotice(null);
      setSimState(nextState);
      setWaitingForUser(false);
      setShowManualContinue(false);
      setWaitDelayMs(null);
      return;
    }

    setFatalPreviewError(null);
    setHandleCompatNotice(
      handleIssues.length > 0
        ? 'Часть связей была подстроена под текущий редактор (устаревшие точки подключения).'
        : null
    );
    setTransitionNotice(
      stepResult.stalledMaxSteps
        ? 'Слишком много шагов подряд — проверьте сценарий на зацикливание (цепочка без ввода пользователя).'
        : stepResult.deadEndFromStart
          ? 'Сценарий не содержит перехода из стартового блока. Подключите ребро от блока «Начало» к следующему блоку.'
          : null
    );
    setSimState(nextState);
    setWaitingForUser(w);
    setWaitDelayMs(stepResult.pendingWaitMs ?? null);
  }, [isOpen, currentState, previewBundle, currentScenarioId]);

  useEffect(() => {
    if (!isOpen || waitDelayMs == null) return;
    const ms = waitDelayMs;
    const id = window.setTimeout(() => {
      if (!isOpenRef.current) return;
      const prev = simRef.current;
      if (!prev) return;
      const done = completeWaitStep(prev);
      const cont = runUntilUserPauseOrEnd(contextToSimulatorState(done.context));
      if (!cont.context) return;
      setSimState(contextToSimulatorState(cont.context));
      setWaitingForUser(Boolean(cont.waitingForUser));
      setShowManualContinue(Boolean(cont.stalledMaxSteps));
      setWaitDelayMs(cont.pendingWaitMs ?? null);
      if (cont.stalledMaxSteps) {
        setTransitionNotice(
          'Слишком много шагов подряд — проверьте сценарий на зацикливание (цепочка без ввода пользователя).'
        );
      } else if (cont.deadEndFromStart) {
        setTransitionNotice(
          'Сценарий не содержит перехода из стартового блока. Подключите ребро от блока «Начало» к следующему блоку.'
        );
      } else if (cont.pendingWaitMs == null) {
        setTransitionNotice(null);
      }
    }, ms);
    return () => window.clearTimeout(id);
  }, [isOpen, waitDelayMs]);

  /** Все хуки — только до любого return. Иначе при !isOpen / !currentState раньше вызывалось меньше хуков → краш React. */
  const lastInteractiveBot = useMemo(() => {
    const h = simState?.history || [];
    for (let i = h.length - 1; i >= 0; i--) {
      const m = h[i];
      if (m.from !== 'bot') continue;
      if (m.meta?.variant === 'system' || m.meta?.variant === 'error') continue;
      return m;
    }
    return null;
  }, [simState?.history]);

  const activeButtonMessageId = useMemo(() => {
    if (!waitingForUser || fatalPreviewError || waitDelayMs != null) return null;
    const h = simState?.history || [];
    for (let i = h.length - 1; i >= 0; i--) {
      const m = h[i];
      if (m.from !== 'bot') continue;
      if (m.meta?.variant === 'system' || m.meta?.variant === 'error') continue;
      return m.buttons?.length ? m.id : null;
    }
    return null;
  }, [waitingForUser, fatalPreviewError, waitDelayMs, simState?.history]);

  const showTextInput = Boolean(
    waitingForUser &&
      !fatalPreviewError &&
      waitDelayMs == null &&
      lastInteractiveBot?.meta?.kind === 'input'
  );

  if (!isOpen || !currentState) return null;

  /** Нет активного узла, но история уже есть — дальше шагать некуда (тупик или нет перехода со старта). */
  const atGraphDeadEnd = Boolean(
    simState && simState.currentNodeId == null && simState.history.length > 0 && !waitingForUser
  );

  const handleContinue = () => {
    if (!simState || atGraphDeadEnd) return;
    const stepResult = runUntilUserPauseOrEnd(simState);
    const context = stepResult?.context;
    if (!context) {
      setFatalPreviewError(
        'Не удалось выполнить шаг симуляции. Закройте предпросмотр и попробуйте снова.'
      );
      return;
    }
    setSimState(contextToSimulatorState(context));
    setWaitingForUser(Boolean(stepResult.waitingForUser));
    setShowManualContinue(Boolean(stepResult.stalledMaxSteps));
    setWaitDelayMs(stepResult.pendingWaitMs ?? null);
    if (stepResult.stalledMaxSteps) {
      setTransitionNotice(
        'Слишком много шагов подряд — проверьте сценарий на зацикливание (цепочка без ввода пользователя).'
      );
    } else if (stepResult.deadEndFromStart) {
      setTransitionNotice(
        'Сценарий не содержит перехода из стартового блока. Подключите ребро от блока «Начало» к следующему блоку.'
      );
    } else {
      setTransitionNotice(null);
    }
  };

  const handleUserChoice = (payload: {
    label: string;
    sourceHandle?: string | null;
    buttonId?: string;
  }) => {
    if (!simState) return;
    const choiceResult = applyUserChoice(simState, payload);
    const afterChoice = choiceResult?.context;
    if (!afterChoice) {
      setFatalPreviewError(
        'Не удалось обработать выбор. Закройте предпросмотр и попробуйте снова.'
      );
      return;
    }
    const after = runUntilUserPauseOrEnd(contextToSimulatorState(afterChoice));
    const ctx = after?.context;
    if (!ctx) {
      setFatalPreviewError('Не удалось продолжить сценарий после выбора.');
      return;
    }
    setSimState(contextToSimulatorState(ctx));
    setWaitingForUser(Boolean(after.waitingForUser));
    setShowManualContinue(Boolean(after.stalledMaxSteps));
    setWaitDelayMs(after.pendingWaitMs ?? null);
    if (after.stalledMaxSteps) {
      setTransitionNotice(
        'Слишком много шагов подряд — проверьте сценарий на зацикливание (цепочка без ввода пользователя).'
      );
    } else {
      setTransitionNotice(null);
    }
  };

  const handleFreeText = (text: string) => {
    handleUserChoice({ label: text, sourceHandle: null, buttonId: undefined });
  };

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
        {transitionNotice && !fatalPreviewError && (
          <div
            style={{
              margin: '0 12px',
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245,158,11,0.35)',
              color: '#fcd34d',
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            {transitionNotice}
          </div>
        )}

        <ChatPreview
          messages={simState?.history || []}
          onButtonClick={handleUserChoice}
          showTextInput={showTextInput}
          onSubmitText={handleFreeText}
          activeButtonMessageId={activeButtonMessageId}
          showTypingIndicator={Boolean(waitDelayMs != null && waitDelayMs > 0)}
        />

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
          <div style={{ fontSize: 11, color: '#6b7280', flex: 1, minWidth: 0 }}>
            {fatalPreviewError
              ? ''
              : waitDelayMs != null
                ? 'Пауза сценария — подождите, диалог продолжится сам.'
                : atGraphDeadEnd
                  ? 'Сценарий остановлен — дальше нет связанных шагов (см. сообщения выше).'
                  : showTextInput
                    ? 'Введите ответ и нажмите «Отправить» или Enter.'
                    : waitingForUser
                      ? 'Выберите вариант под последним сообщением бота.'
                      : showManualContinue
                        ? 'Длинная цепочка без ввода — нажмите «Дальше», чтобы продолжить.'
                        : 'Шаги без ввода выполняются автоматически.'}
          </div>
          {showManualContinue && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={Boolean(fatalPreviewError)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 999,
                border: 'none',
                background: fatalPreviewError ? '#111827' : '#22c55e',
                color: fatalPreviewError ? '#6b7280' : '#022c22',
                fontSize: 13,
                fontWeight: 600,
                cursor: fatalPreviewError ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              <PlayCircle size={16} />
              Дальше
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BotSimulator;
