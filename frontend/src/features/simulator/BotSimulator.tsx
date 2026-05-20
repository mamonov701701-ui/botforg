import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, PlayCircle, Database, RotateCcw, Send } from 'lucide-react';
import { useScenarioStore } from '../../stores/scenarioStore';
import ChatPreview from './ChatPreview';
import {
  createInitialSimulatorState,
  runUntilUserPauseOrEnd,
  applyUserChoice,
  completeWaitStep,
  findStartNode,
  PREVIEW_USER_FIELDS_VARIABLE,
  PREVIEW_USER_STATUS_VARIABLE,
  PREVIEW_USER_TAGS_VARIABLE,
  type SimulatorState,
  type RuntimeContext,
  type ScenarioGraph,
} from './scenarioRunner';
import { normalizeScenarioEdges, listInvalidFlowEdges } from '../../utils/flowHandleCompatibility';
import { getVisiblePreviewHistory } from './historyVisibility';
import { crmPreviewSync, validateTagKey } from '../../api/botCrm';
import { post, ApiError } from '../../api/client';
import { toast } from '../../utils/toast';

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
  const currentBotId = useScenarioStore(s => s.currentBotId);
  const [simState, setSimState] = useState<SimulatorState | null>(null);
  const [waitingForUser, setWaitingForUser] = useState(false);
  /** Лимит шагов: показать «Дальше», иначе автопрокрутка без лишних кликов */
  const [showManualContinue, setShowManualContinue] = useState(false);
  const [fatalPreviewError, setFatalPreviewError] = useState<string | null>(null);
  const [handleCompatNotice, setHandleCompatNotice] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<string | null>(null);
  /** Активная визуальная пауза блока wait (мс); по окончании — completeWaitStep + автопродолжение */
  const [waitDelayMs, setWaitDelayMs] = useState<number | null>(null);
  /** Сброс симуляции: перезапуск init useEffect без закрытия модалки */
  const [bootKey, setBootKey] = useState(0);
  const [showVarsPanel, setShowVarsPanel] = useState(false);
  const [channelTestOpen, setChannelTestOpen] = useState(false);
  const [channelTestChannel, setChannelTestChannel] = useState<'telegram' | 'max'>('telegram');
  const [channelTestChatId, setChannelTestChatId] = useState('test_user_1');
  const [channelTestMessages, setChannelTestMessages] = useState<
    { text?: string; buttons?: unknown[]; media_url?: string }[]
  >([]);
  const [channelTestBusy, setChannelTestBusy] = useState(false);
  const simRef = useRef<SimulatorState | null>(null);
  const isOpenRef = useRef(isOpen);
  const lastPreviewSyncSignatureRef = useRef<string>('');
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
      setStopReason(null);
      setShowVarsPanel(false);
      setChannelTestOpen(false);
      setChannelTestMessages([]);
      setChannelTestBusy(false);
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
      setStopReason(null);
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
      setStopReason(null);
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
      setStopReason(null);
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
    setStopReason(stepResult.stopReason ?? null);
  }, [isOpen, currentState, previewBundle, currentScenarioId, bootKey]);

  useEffect(() => {
    if (!isOpen || !simState || !currentBotId) return;
    const toStr = (v: unknown): string => (v == null ? '' : String(v));
    const rawVars = (simState.variables || {}) as Record<string, unknown>;
    const cleanVars: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawVars)) {
      if (!/^[a-z][a-z0-9_]*$/.test(k)) continue;
      if (k.startsWith('__preview_')) continue;
      cleanVars[k] = v;
    }
    const tagRaw = rawVars[PREVIEW_USER_TAGS_VARIABLE];
    const tags = Array.isArray(tagRaw)
      ? tagRaw.map(t => toStr(t).trim()).filter(t => validateTagKey(t) === undefined)
      : [];
    const statusKeyPresent = Object.prototype.hasOwnProperty.call(
      rawVars,
      PREVIEW_USER_STATUS_VARIABLE
    );
    const statusPatch = statusKeyPresent;
    const statusValue = statusKeyPresent
      ? toStr(rawVars[PREVIEW_USER_STATUS_VARIABLE] ?? '').trim()
      : undefined;
    const PROFILE_NAME_KEYS = [
      'imya',
      'name',
      'user_name',
      'first_name',
      'fio',
      'full_name',
    ] as const;
    let derivedFirstName: string | undefined;
    for (const k of PROFILE_NAME_KEYS) {
      const v = toStr(cleanVars[k]).trim();
      if (v) {
        derivedFirstName = v;
        break;
      }
    }
    const fieldsRaw = rawVars[PREVIEW_USER_FIELDS_VARIABLE];
    const fields =
      fieldsRaw && typeof fieldsRaw === 'object' && !Array.isArray(fieldsRaw)
        ? (fieldsRaw as Record<string, unknown>)
        : {};
    for (const [k, v] of Object.entries(fields)) {
      if (!/^[a-z][a-z0-9_]*$/.test(k)) continue;
      cleanVars[k] = v;
    }
    const lastInput = toStr(rawVars.last_input || simState.lastUserInput || '').trim() || undefined;
    const body = {
      external_user_id: `preview-bot-${currentBotId}`,
      channel: 'preview',
      ...(derivedFirstName ? { first_name: derivedFirstName } : {}),
      username: 'preview_user',
      last_input: lastInput,
      variables: cleanVars,
      tags,
      ...(statusPatch ? { status_patch: true as const, status_value: statusValue ?? '' } : {}),
    };
    const signature = JSON.stringify(body);
    if (signature === lastPreviewSyncSignatureRef.current) return;
    lastPreviewSyncSignatureRef.current = signature;
    const timer = window.setTimeout(() => {
      crmPreviewSync(currentBotId, body).catch(() => {
        toast.error('Не удалось сохранить тестовые данные CRM из предпросмотра');
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, simState, currentBotId]);

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
      const nextSim = contextToSimulatorState(cont.context);
      const nextPending = cont.pendingWaitMs ?? null;
      setSimState(nextSim);
      setWaitingForUser(Boolean(cont.waitingForUser));
      setShowManualContinue(Boolean(cont.stalledMaxSteps));
      // Сначала сбросить задержку: если снова тот же pendingWaitMs (ещё один wait),
      // React не перезапустит эффект с таймером — «Бот печатает…» зависает навсегда.
      setWaitDelayMs(null);
      if (nextPending != null) {
        window.setTimeout(() => {
          if (!isOpenRef.current) return;
          setWaitDelayMs(nextPending);
        }, 0);
      }
      if (cont.stalledMaxSteps) {
        setTransitionNotice('Выполнение остановлено: возможно зацикливание сценария.');
      } else if (cont.deadEndFromStart) {
        setTransitionNotice(
          'Сценарий не содержит перехода из стартового блока. Подключите ребро от блока «Начало» к следующему блоку.'
        );
      } else if (nextPending == null) {
        setTransitionNotice(null);
      }
      setStopReason(cont.stopReason ?? null);
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

  const visibleHistory = useMemo(
    () => getVisiblePreviewHistory(simState?.history || []),
    [simState?.history]
  );

  const hasAnyVariables = Boolean(simState && Object.keys(simState.variables || {}).length > 0);

  const formatVarValueForPanel = (val: unknown): string => {
    const trunc = (s: string) => (s.length <= 40 ? s : `${s.slice(0, 40)}...`);
    if (Array.isArray(val)) {
      const parts = val.map(el =>
        el !== null && typeof el === 'object' ? JSON.stringify(el) : String(el)
      );
      return trunc(parts.join(', '));
    }
    if (val !== null && typeof val === 'object') {
      return trunc(JSON.stringify(val));
    }
    if (typeof val === 'string' || typeof val === 'number') {
      return trunc(String(val));
    }
    if (val == null) return '';
    return trunc(String(val));
  };

  const renderVarsPanel = () => {
    if (!simState) return null;
    const raw = (simState.variables || {}) as Record<string, unknown>;
    const userKeys = Object.keys(raw)
      .filter(k => !k.startsWith('__preview_'))
      .sort();
    const sysKeys = Object.keys(raw)
      .filter(k => k.startsWith('__preview_'))
      .sort();

    const row = (name: string, valueKey: string) => (
      <div
        key={valueKey}
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            flexShrink: 0,
            maxWidth: '42%',
          }}
        >
          {name}
        </span>
        <span
          style={{ fontSize: 12, wordBreak: 'break-all', textAlign: 'right', minWidth: 0, flex: 1 }}
        >
          {formatVarValueForPanel(raw[valueKey])}
        </span>
      </div>
    );

    return (
      <div
        style={{
          width: 260,
          height: '100%',
          overflowY: 'auto',
          borderLeft: '1px solid var(--color-border-tertiary)',
          padding: 12,
          boxSizing: 'border-box',
          flexShrink: 0,
          background: '#020617',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Переменные</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, opacity: 0.9 }}>
            Пользовательские
          </div>
          {userKeys.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Пока нет</div>
          ) : (
            userKeys.map(k => row(k, k))
          )}
        </div>
        {sysKeys.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, opacity: 0.9 }}>
              Системные
            </div>
            {sysKeys.map(k => row(k.replace(/^__preview_/, ''), k))}
          </div>
        )}
      </div>
    );
  };

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
    setStopReason(stepResult.stopReason ?? null);
    if (stepResult.stalledMaxSteps) {
      setTransitionNotice('Выполнение остановлено: возможно зацикливание сценария.');
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
    setStopReason(after.stopReason ?? null);
    if (after.stalledMaxSteps) {
      setTransitionNotice('Выполнение остановлено: возможно зацикливание сценария.');
    } else {
      setTransitionNotice(null);
    }
  };

  const handleFreeText = (text: string) => {
    handleUserChoice({ label: text, sourceHandle: null, buttonId: undefined });
  };

  const sendChannelDevSimulate = async () => {
    const text = (simState?.lastUserInput ?? '').trim();
    if (!text) {
      toast.error('Нет сохранённого текста ввода. Сначала отправьте сообщение в симуляторе.');
      return;
    }
    if (!currentBotId) return;
    setChannelTestBusy(true);
    try {
      const data = await post(`/dev/bots/${currentBotId}/simulate-message`, {
        text,
        channel: channelTestChannel,
        chat_id: (channelTestChatId || 'test_user_1').trim(),
      });
      const arr = Array.isArray(data?.messages) ? data.messages : [];
      setChannelTestMessages(arr);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось выполнить тест канала';
      toast.error(msg);
      setChannelTestMessages([]);
    } finally {
      setChannelTestBusy(false);
    }
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
          width: showVarsPanel ? 'min(680px, 96vw)' : 420,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              title="Переменные"
              aria-label="Переменные"
              onClick={() => setShowVarsPanel(v => !v)}
              disabled={!simState}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: simState ? 'pointer' : 'default',
                opacity: hasAnyVariables ? 1 : 0.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 2,
              }}
            >
              <Database size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          style={{
            margin: '0 12px 8px',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: '#bfdbfe',
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          Данные предпросмотра сохраняются в CRM как тестовые (dev).
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
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <ChatPreview
              messages={visibleHistory}
              onButtonClick={handleUserChoice}
              showTextInput={showTextInput}
              onSubmitText={handleFreeText}
              textInputPlaceholder={lastInteractiveBot?.meta?.inputPlaceholder || 'Введите ответ…'}
              textInputAllowEmpty={Boolean(lastInteractiveBot?.meta?.inputAllowEmpty)}
              activeButtonMessageId={activeButtonMessageId}
              showTypingIndicator={Boolean(waitDelayMs != null && waitDelayMs > 0)}
              textInputAccessoryTop={
                showTextInput ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Сбросить симуляцию и начать заново?')) {
                            setSimState(null);
                            setWaitingForUser(false);
                            setStopReason(null);
                            setFatalPreviewError(null);
                            setShowVarsPanel(false);
                            setBootKey(k => k + 1);
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        <RotateCcw size={14} />
                        Сбросить
                      </button>
                      {import.meta.env.DEV && (
                        <button
                          type="button"
                          onClick={() => setChannelTestOpen(o => !o)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 12,
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <Send size={14} />
                          Тест через канал
                        </button>
                      )}
                    </div>
                    {import.meta.env.DEV && channelTestOpen && (
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #334155',
                          background: '#0f172a',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            alignItems: 'center',
                          }}
                        >
                          <label
                            style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 6 }}
                          >
                            Канал
                            <select
                              value={channelTestChannel}
                              onChange={e =>
                                setChannelTestChannel(e.target.value as 'telegram' | 'max')
                              }
                              style={{
                                fontSize: 12,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #475569',
                                background: '#020617',
                                color: '#e5e7eb',
                              }}
                            >
                              <option value="telegram">telegram</option>
                              <option value="max">max</option>
                            </select>
                          </label>
                          <label
                            style={{
                              fontSize: 12,
                              color: '#94a3b8',
                              display: 'flex',
                              gap: 6,
                              flex: 1,
                            }}
                          >
                            chat_id
                            <input
                              type="text"
                              value={channelTestChatId}
                              onChange={e => setChannelTestChatId(e.target.value)}
                              placeholder="test_user_1"
                              style={{
                                flex: 1,
                                minWidth: 120,
                                fontSize: 12,
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: '1px solid #475569',
                                background: '#020617',
                                color: '#e5e7eb',
                              }}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          disabled={channelTestBusy}
                          onClick={() => void sendChannelDevSimulate()}
                          style={{
                            alignSelf: 'flex-start',
                            fontSize: 12,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: channelTestBusy ? '#334155' : '#2563eb',
                            color: '#fff',
                            cursor: channelTestBusy ? 'default' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Отправить текущий ввод пользователя
                        </button>
                        {channelTestMessages.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                              Ответ канала (мок):
                            </div>
                            <ul
                              style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#e5e7eb' }}
                            >
                              {channelTestMessages.map((m, i) => (
                                <li key={i} style={{ marginBottom: 6 }}>
                                  {m.media_url ? (
                                    <>
                                      media:{' '}
                                      <span style={{ wordBreak: 'break-all' }}>{m.media_url}</span>
                                      {m.text ? ` — ${m.text}` : ''}
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ wordBreak: 'break-all' }}>
                                        {(m.text ?? '').trim() || '(пустой текст)'}
                                      </span>
                                      {Array.isArray(m.buttons) && m.buttons.length > 0
                                        ? ` [кнопок: ${m.buttons.length}]`
                                        : ''}
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : undefined
              }
            />
          </div>
          {showVarsPanel && renderVarsPanel()}
        </div>

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
                  ? stopReason ||
                    'Сценарий остановлен — дальше нет связанных шагов (см. сообщения выше).'
                  : showTextInput
                    ? 'Введите ответ и нажмите «Отправить» или Enter.'
                    : waitingForUser
                      ? stopReason || 'Выберите вариант под последним сообщением бота.'
                      : showManualContinue
                        ? stopReason ||
                          'Длинная цепочка без ввода — нажмите «Дальше», чтобы продолжить.'
                        : stopReason || 'Шаги без ввода выполняются автоматически.'}
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
