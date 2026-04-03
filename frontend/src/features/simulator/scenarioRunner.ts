import type { Node, Edge } from 'reactflow';
import { normalizeScenarioEdges } from '../../utils/flowHandleCompatibility';
import {
  findMessageButtonByPayload,
  normalizeMessageButtonAction,
  type MessageButtonAction,
} from '../../utils/messageButton';
import {
  normalizeMessageMediaFromSettings,
  parseModeForSimulator,
  type MessageMediaItem,
} from '../../utils/messageMedia';
import { renderForSimulator } from '../../lib/templateRender';
import {
  getNormalizedInputSettings,
  migrateInputNodeSettings,
  validateInputAnswer,
} from '../../utils/inputBlock';

/**
 * Формальная модель исполнения сценария для симулятора.
 * Активный граф хранится в SimulatorState.graph (важно для go_to_scenario).
 */

export type SimulatorRole = 'bot' | 'user';

export type NodeKind =
  | 'start'
  | 'message'
  | 'input'
  | 'condition'
  | 'action'
  | 'go_to_scenario'
  | 'variable'
  | 'wait'
  | 'unknown';

export interface SimulatorMessage {
  id: string;
  from: SimulatorRole;
  text: string;
  /** Вложения блока «Сообщение» для предпросмотра */
  media?: MessageMediaItem[];
  /** Режим форматирования текста (предпросмотр) */
  parseMode?: 'Plain' | 'Markdown' | 'HTML';
  buttons?: {
    id: string;
    label: string;
    sourceHandle?: string | null;
    action?: MessageButtonAction;
  }[];
  meta?: {
    nodeId?: string;
    kind?: NodeKind;
    /** Системные подсказки и диагностика (не как обычное сообщение бота) */
    variant?: 'system' | 'error';
    /** Блок «Ввод»: подсказка и пустой ответ для предпросмотра */
    inputPlaceholder?: string;
    inputAllowEmpty?: boolean;
  };
}

export interface ScenarioGraph {
  nodes: Node[];
  edges: Edge[];
}

export interface RuntimeVariables {
  [key: string]: any;
}

export interface RuntimeContext {
  graph: ScenarioGraph;
  /** id сценария → граф (все сценарии текущего бота для предпросмотра переходов) */
  graphsByScenarioId: Record<number, ScenarioGraph>;
  scenarioTitlesById: Record<number, string>;
  activeScenarioId: number | null;
  currentNodeId: string | null;
  variables: RuntimeVariables;
  lastUserInput: string | null;
  history: SimulatorMessage[];
}

export interface SimulatorState {
  graph: ScenarioGraph;
  graphsByScenarioId: Record<number, ScenarioGraph>;
  scenarioTitlesById: Record<number, string>;
  activeScenarioId: number | null;
  currentNodeId: string | null;
  history: SimulatorMessage[];
  variables: RuntimeVariables;
  lastUserInput: string | null;
}

/** Результат шага: всегда `context`, не `state`. */
export interface RunStepResult {
  context: RuntimeContext;
  waitingForUser: boolean;
  deadEndFromStart?: boolean;
  /** Сработал лимит шагов при автопрокрутке (подозрение на цикл) */
  stalledMaxSteps?: boolean;
  /**
   * Раннер остановился на блоке «Ожидание»: UI показывает паузу `pendingWaitMs`, затем вызывает `completeWaitStep`.
   */
  pendingWaitMs?: number;
}

/** Верхняя граница реальной задержки в предпросмотре (часы/дни в сценарии не замирают на минуты). */
export const MAX_PREVIEW_WAIT_MS = 45_000;

/** Парсинг duration из настроек блока wait (`{ amount, unit }` из редактора). */
export function parseWaitDurationMs(raw: unknown): number {
  if (raw != null && typeof raw === 'object' && 'amount' in (raw as object)) {
    const o = raw as { amount?: unknown; unit?: unknown };
    const amount = Number(o.amount);
    const unit = String(o.unit || 'seconds');
    if (!Number.isFinite(amount) || amount < 0) return 1000;
    let mult = 1000;
    if (unit === 'minutes') mult = 60_000;
    else if (unit === 'hours') mult = 3_600_000;
    else if (unit === 'days') mult = 86_400_000;
    const ms = Math.round(amount * mult);
    return Math.min(Math.max(ms, 400), MAX_PREVIEW_WAIT_MS);
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(Math.max(Math.round(raw * 1000), 400), MAX_PREVIEW_WAIT_MS);
  }
  return 1200;
}

/** Сравнение значения переменной с conditionValue на рёбрах (числа/строки/boolean). */
export function valuesEqualForConditionRoute(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na === nb) {
    return true;
  }
  return String(a).trim() === String(b).trim();
}

function ctxFromState(state: SimulatorState): RuntimeContext {
  return {
    graph: state.graph,
    graphsByScenarioId: state.graphsByScenarioId,
    scenarioTitlesById: state.scenarioTitlesById,
    activeScenarioId: state.activeScenarioId,
    currentNodeId: state.currentNodeId,
    variables: state.variables || {},
    lastUserInput: state.lastUserInput ?? null,
    history: state.history,
  };
}

export function findStartNode(nodes: Node[]): Node | null {
  const explicit = nodes.find(n => {
    const data: any = n.data || {};
    return data.blockId === 'start' || data.type === 'start';
  });
  if (explicit) return explicit;
  if (nodes.length === 0) return null;
  return nodes[0];
}

function getNodeKind(node?: Node | null): NodeKind {
  if (!node) return 'unknown';
  const data: any = node.data || {};
  const t = (data.type || data.blockId || '').toString().toLowerCase();
  if (t === 'start') return 'start';
  if (t === 'message') return 'message';
  if (t === 'input') return 'input';
  if (t === 'condition') return 'condition';
  if (t === 'action') return 'action';
  if (t === 'go_to_scenario') return 'go_to_scenario';
  if (t === 'variable') return 'variable';
  if (t === 'wait') return 'wait';
  return 'unknown';
}

function getOutgoingEdges(edges: Edge[], nodeId: string) {
  return edges.filter(e => e.source === nodeId);
}

function pickInputSuccessEdge(outgoing: Edge[]): Edge | null {
  if (outgoing.length === 0) return null;
  const bySuccess = outgoing.find(e => (e.sourceHandle || '') === 'success');
  if (bySuccess) return bySuccess;
  const nonError = outgoing.filter(e => (e.sourceHandle || '') !== 'error');
  if (nonError.length > 0) return nonError[0];
  return null;
}

function pickInputErrorEdge(outgoing: Edge[]): Edge | null {
  return outgoing.find(e => (e.sourceHandle || '') === 'error') ?? null;
}

function systemLine(text: string, variant: 'system' | 'error' = 'system'): SimulatorMessage {
  return {
    id: `sys_${variant}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: 'bot',
    text,
    meta: { kind: 'unknown', variant },
  };
}

/** Старт без текста и без кнопок не показываем в чате (как в мессенджере: вход сразу в первый шаг). */
function shouldShowStartBubble(node: Node): boolean {
  const data: any = node.data || {};
  const settings: any = data.settings || {};
  const t = (settings.text || settings.title || '').toString().trim();
  if (t) return true;
  const buttons = settings.buttons;
  return Array.isArray(buttons) && buttons.length > 0;
}

function parseTargetScenarioId(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Выбор следующего ребра. Fallback: первое исходящее (без жёсткой привязки к handle).
 */
function resolveNextNodeId(
  context: RuntimeContext,
  fromNode: Node,
  opts?: { sourceHandle?: string | null; buttonId?: string | null }
): string | null {
  const outgoing = getOutgoingEdges(context.graph.edges, fromNode.id);
  if (outgoing.length === 0) return null;

  const data: any = fromNode.data || {};
  const kind = getNodeKind(fromNode);
  const hasButtonChoice = Boolean(opts?.buttonId || opts?.sourceHandle);

  if (opts?.buttonId) {
    const byButton = outgoing.find(e => (e.data as any)?.buttonId === opts.buttonId);
    if (byButton) return byButton.target;
  }

  if (opts?.sourceHandle) {
    const byHandle = outgoing.find(e => e.sourceHandle === opts.sourceHandle);
    if (byHandle) return byHandle.target;
    const m = /^button_(\d+)$/.exec(opts.sourceHandle);
    if (m && kind === 'message') {
      const idx = parseInt(m[1], 10);
      const same = outgoing.filter(e => e.sourceHandle === `button_${idx}`);
      if (same.length === 1) return same[0].target;
    }
  }

  if (kind === 'condition') {
    const settings: any = data.settings || {};
    const key: string | undefined = settings.conditionKey ?? settings.variable;
    if (key) {
      const value = context.variables[key] ?? context.lastUserInput ?? null;
      const byCondition = outgoing.find(e => {
        const cv = (e.data as any)?.conditionValue;
        if (cv === undefined) return false;
        return valuesEqualForConditionRoute(cv, value);
      });
      if (byCondition) return byCondition.target;
    }
  }

  /** Клик по кнопке message/start без подходящего ребра — не падать на «первое попавшееся». */
  if ((kind === 'message' || kind === 'start') && hasButtonChoice) {
    return null;
  }

  return outgoing[0].target;
}

function buildMessageFromNode(
  node: Node,
  kind: NodeKind,
  runtime?: RuntimeContext | null
): SimulatorMessage {
  const rawSettings = { ...((node.data?.settings || {}) as object) };
  const settings: any =
    kind === 'input'
      ? migrateInputNodeSettings(rawSettings as Record<string, unknown>)
      : rawSettings;
  const data: any = node.data || {};
  const rawText: string =
    kind === 'input'
      ? String(
          settings.question_text ??
            settings.text ??
            settings.title ??
            data.title ??
            data.label ??
            `Блок ${node.id}`
        )
      : settings.text || settings.title || data.title || data.label || `Блок ${node.id}`;
  const text = runtime ? renderForSimulator(rawText, runtime).renderedText : rawText;

  const buttons:
    | {
        id: string;
        label: string;
        sourceHandle?: string | null;
        action?: MessageButtonAction;
      }[]
    | undefined =
    Array.isArray(settings.buttons) && settings.buttons.length
      ? settings.buttons.map((btn: any, index: number) => {
          const rawLabel = btn?.label || `Вариант ${index + 1}`;
          const label = runtime
            ? renderForSimulator(String(rawLabel), runtime).renderedText
            : rawLabel;
          return {
            id: btn?.id || `btn_${index}`,
            label,
            sourceHandle: `button_${index}`,
            action: normalizeMessageButtonAction(btn?.action),
          };
        })
      : undefined;

  const mediaArr = normalizeMessageMediaFromSettings(settings as Record<string, unknown>);
  const media = mediaArr.length > 0 ? mediaArr : undefined;

  return {
    id: `msg_${node.id}_${Date.now()}`,
    from: 'bot',
    text,
    media,
    parseMode: parseModeForSimulator(settings.parseMode),
    buttons,
    meta: {
      nodeId: node.id,
      kind,
      ...(kind === 'input'
        ? {
            inputPlaceholder: settings.placeholder ? String(settings.placeholder) : undefined,
            inputAllowEmpty: settings.required === false,
          }
        : {}),
    },
  };
}

export function createInitialRuntimeContext(
  graph: ScenarioGraph,
  bundle?: {
    graphsByScenarioId?: Record<number, ScenarioGraph>;
    scenarioTitlesById?: Record<number, string>;
    activeScenarioId?: number | null;
  }
): RuntimeContext {
  const start = findStartNode(graph.nodes);
  return {
    graph,
    graphsByScenarioId: bundle?.graphsByScenarioId ?? {},
    scenarioTitlesById: bundle?.scenarioTitlesById ?? {},
    activeScenarioId: bundle?.activeScenarioId ?? null,
    currentNodeId: start?.id ?? null,
    variables: {},
    lastUserInput: null,
    history: [],
  };
}

export function createInitialSimulatorState(
  graph: ScenarioGraph,
  opts?: {
    graphsByScenarioId?: Record<number, ScenarioGraph>;
    scenarioTitlesById?: Record<number, string>;
    rootScenarioId?: number | null;
  }
): SimulatorState {
  const ctx = createInitialRuntimeContext(graph, {
    graphsByScenarioId: opts?.graphsByScenarioId,
    scenarioTitlesById: opts?.scenarioTitlesById,
    activeScenarioId: opts?.rootScenarioId ?? null,
  });
  return {
    graph: ctx.graph,
    graphsByScenarioId: ctx.graphsByScenarioId,
    scenarioTitlesById: ctx.scenarioTitlesById,
    activeScenarioId: ctx.activeScenarioId,
    currentNodeId: ctx.currentNodeId,
    history: ctx.history,
    variables: ctx.variables,
    lastUserInput: ctx.lastUserInput,
  };
}

export function stepFromCurrentNode(state: SimulatorState): RunStepResult {
  let context = ctxFromState(state);
  const graph = state.graph;

  if (!context.currentNodeId) {
    if (context.history.length > 0) {
      return { context, waitingForUser: false };
    }
    const start = findStartNode(graph.nodes);
    if (!start) {
      return { context, waitingForUser: false };
    }
    const kind = getNodeKind(start);
    const msg = buildMessageFromNode(start, kind, context);
    const hasButtons = !!msg.buttons?.length;
    const showStartBubble = shouldShowStartBubble(start);

    if (hasButtons) {
      const historyWithStart = [...context.history, msg];
      context = {
        ...context,
        currentNodeId: start.id,
        history: historyWithStart,
      };
      return { context, waitingForUser: true };
    }

    const historyForResolve = showStartBubble ? [...context.history, msg] : [...context.history];
    const ctxForResolve: RuntimeContext = {
      ...context,
      graph,
      currentNodeId: start.id,
      history: historyForResolve,
    };
    const nextId = resolveNextNodeId(ctxForResolve, start, {});
    let newHist = historyForResolve;
    if (nextId === null) {
      newHist = [
        ...newHist,
        systemLine(
          'В сценарии нет перехода из стартового блока. Подключите ребро от «Начало» к следующему блоку.',
          'error'
        ),
      ];
    }
    context = {
      ...context,
      history: newHist,
      currentNodeId: nextId,
    };
    return {
      context,
      waitingForUser: false,
      deadEndFromStart: nextId === null,
    };
  }

  const node = graph.nodes.find(n => n.id === context.currentNodeId);
  if (!node) {
    const badId = context.currentNodeId;
    return {
      context: {
        ...context,
        currentNodeId: null,
        history: [
          ...context.history,
          systemLine(
            `В графе нет блока с id «${badId}». Сохраните сценарий заново или уберите «битую» связь.`,
            'error'
          ),
        ],
      },
      waitingForUser: false,
    };
  }

  const kind = getNodeKind(node);

  switch (kind) {
    case 'message': {
      const msg = buildMessageFromNode(node, kind, context);
      const hasButtons = !!msg.buttons?.length;
      if (hasButtons) {
        context = {
          ...context,
          history: [...context.history, msg],
          currentNodeId: node.id,
        };
        return { context, waitingForUser: true };
      }
      const nextId = resolveNextNodeId(context, node, {});
      let hist = [...context.history, msg];
      if (nextId === null) {
        hist = [
          ...hist,
          systemLine(
            'В сценарии нет перехода из этого сообщения. Подключите исходящую связь от блока «Сообщение».',
            'error'
          ),
        ];
      }
      context = {
        ...context,
        history: hist,
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'input': {
      const msg = buildMessageFromNode(node, kind, context);
      context = {
        ...context,
        history: [...context.history, msg],
        currentNodeId: node.id,
      };
      return { context, waitingForUser: true };
    }

    case 'condition': {
      const outgoing = getOutgoingEdges(context.graph.edges, node.id);
      const settings: any = node.data?.settings || {};
      const key: string | undefined = settings.conditionKey ?? settings.variable;
      let nextId: string | null = null;
      const extra: SimulatorMessage[] = [];

      if (outgoing.length === 0) {
        extra.push(
          systemLine(
            'У блока «Условие» нет исходящих связей — добавьте ветки в редакторе.',
            'error'
          )
        );
      } else if (key) {
        const value = context.variables[key] ?? context.lastUserInput ?? null;
        const withCv = outgoing.filter(e => (e.data as any)?.conditionValue !== undefined);
        if (withCv.length > 0) {
          const match = outgoing.find(e => {
            const cv = (e.data as any)?.conditionValue;
            if (cv === undefined) return false;
            return valuesEqualForConditionRoute(cv, value);
          });
          if (match) {
            nextId = match.target;
          } else {
            extra.push(
              systemLine(
                `Условие: значение «${String(value)}» не совпало ни с одной подписанной веткой — выполняется запасной переход. Проверьте подписи на стрелках и переменную «${key}».`
              )
            );
            nextId = outgoing[0]?.target ?? null;
          }
        } else {
          nextId = outgoing[0]?.target ?? null;
        }
      } else {
        nextId = outgoing[0]?.target ?? null;
      }

      if (nextId === null && outgoing.length > 0) {
        extra.push(
          systemLine(
            'Не удалось выбрать ветку после «Условие». Проверьте переменную и связи.',
            'error'
          )
        );
      }

      context = {
        ...context,
        history: [...context.history, ...extra],
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'action': {
      const data: any = node.data || {};
      const settings: any = data.settings || {};
      const varName: string | undefined = settings.setVariable;
      let vars = context.variables;
      if (varName) {
        const raw = settings.value;
        let value = raw;
        if (raw === '$lastUserInput') {
          value = context.lastUserInput ?? null;
        }
        vars = {
          ...context.variables,
          [varName]: value,
        };
      }
      const userText = (settings.text || '').toString().trim();
      const nextId = resolveNextNodeId({ ...context, variables: vars }, node, {});
      let hist = context.history;
      if (userText) {
        hist = [
          ...hist,
          {
            id: `action_${node.id}_${Date.now()}`,
            from: 'bot' as const,
            text: userText,
            meta: { nodeId: node.id, kind: 'action' as const },
          },
        ];
      }
      if (nextId === null) {
        hist = [
          ...hist,
          systemLine(
            'В сценарии нет перехода после блока «Действие». Подключите исходящую связь.',
            'error'
          ),
        ];
      }
      context = {
        ...context,
        variables: vars,
        history: hist,
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'variable': {
      const data: any = node.data || {};
      const settings: any = data.settings || {};
      const varName: string | undefined = settings.name;
      const raw = settings.value;
      let value = raw;
      if (raw === '$lastUserInput') {
        value = context.lastUserInput ?? null;
      }
      let vars = context.variables;
      if (varName) {
        vars = {
          ...context.variables,
          [varName]: value,
        };
      }
      const nextId = resolveNextNodeId({ ...context, variables: vars }, node, {});
      let hist = context.history;
      if (nextId === null) {
        hist = [
          ...hist,
          systemLine(
            'В сценарии нет перехода после блока «Переменная». Подключите исходящую связь.',
            'error'
          ),
        ];
      }
      context = {
        ...context,
        variables: vars,
        history: hist,
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }

    case 'wait': {
      const settings: any = node.data?.settings || {};
      const delayMs = parseWaitDurationMs(settings.duration);
      context = {
        ...context,
        currentNodeId: node.id,
      };
      return {
        context,
        waitingForUser: false,
        pendingWaitMs: delayMs,
      };
    }

    case 'go_to_scenario': {
      const settings: any = node.data?.settings || {};
      const targetScenarioId = parseTargetScenarioId(settings.targetScenarioId);
      const startMode = settings.startMode === 'from_step' ? 'from_step' : 'from_start';
      const targetNodeId: string | undefined =
        typeof settings.targetNodeId === 'string' ? settings.targetNodeId : undefined;

      const title = context.scenarioTitlesById[targetScenarioId] || `сценарий #${targetScenarioId}`;
      const hopMsg: SimulatorMessage = {
        id: `hop_${Date.now()}`,
        from: 'bot',
        text: `↪ Переход в сценарий: ${title}`,
        meta: { nodeId: node.id, kind: 'go_to_scenario', variant: 'system' },
      };

      const rawTarget = context.graphsByScenarioId[targetScenarioId];
      const errTail = (): SimulatorMessage =>
        systemLine(
          'Не найден целевой сценарий. Сохраните все сценарии бота и проверьте поле «Куда перейти?».',
          'error'
        );

      if (!Number.isFinite(targetScenarioId) || !rawTarget?.nodes?.length) {
        const nextId = resolveNextNodeId(context, node, {});
        context = {
          ...context,
          history: [...context.history, hopMsg, errTail()],
          currentNodeId: nextId,
        };
        return { context, waitingForUser: false };
      }

      const normalizedTarget: ScenarioGraph = {
        nodes: rawTarget.nodes,
        edges: normalizeScenarioEdges(rawTarget.nodes, rawTarget.edges || []),
      };

      let entry: string | null = null;
      if (startMode === 'from_step' && targetNodeId) {
        entry = normalizedTarget.nodes.some(n => n.id === targetNodeId) ? targetNodeId : null;
      }
      if (!entry) {
        const st = findStartNode(normalizedTarget.nodes);
        entry = st?.id ?? null;
      }

      if (!entry) {
        const nextId = resolveNextNodeId(context, node, {});
        context = {
          ...context,
          history: [
            ...context.history,
            hopMsg,
            systemLine('Целевой сценарий пуст — нечего выполнять.', 'error'),
          ],
          currentNodeId: nextId,
        };
        return { context, waitingForUser: false };
      }

      context = {
        ...context,
        graph: normalizedTarget,
        history: [...context.history, hopMsg],
        currentNodeId: entry,
        activeScenarioId: targetScenarioId,
      };
      return { context, waitingForUser: false };
    }

    case 'start': {
      const msg = buildMessageFromNode(node, kind, context);
      const hasButtons = !!msg.buttons?.length;
      if (hasButtons) {
        context = {
          ...context,
          history: [...context.history, msg],
          currentNodeId: node.id,
        };
        return { context, waitingForUser: true };
      }
      const showBubble = shouldShowStartBubble(node);
      let hist = showBubble ? [...context.history, msg] : [...context.history];
      const ctxR = { ...context, history: hist };
      const nextId = resolveNextNodeId(ctxR, node, {});
      if (nextId === null) {
        hist = [
          ...hist,
          systemLine(
            'В сценарии нет перехода из стартового блока. Подключите ребро от «Начало» к следующему блоку.',
            'error'
          ),
        ];
      }
      context = {
        ...context,
        history: hist,
        currentNodeId: nextId,
      };
      return {
        context,
        waitingForUser: false,
        deadEndFromStart: nextId === null,
      };
    }

    case 'unknown':
    default: {
      const msg = buildMessageFromNode(node, kind, context);
      const nextId = resolveNextNodeId(context, node, {});
      let hist = [...context.history, msg];
      if (nextId === null) {
        hist = [
          ...hist,
          systemLine(
            'В сценарии нет перехода из этого блока. Подключите исходящую связь в редакторе.',
            'error'
          ),
        ];
      }
      context = {
        ...context,
        history: hist,
        currentNodeId: nextId,
      };
      return { context, waitingForUser: false };
    }
  }
}

/**
 * После реальной задержки в UI: добавить отметку о паузе и перейти к следующему узлу.
 */
export function completeWaitStep(state: SimulatorState): RunStepResult {
  const graph = state.graph;
  const node = graph.nodes.find(n => n.id === state.currentNodeId);
  if (!node || getNodeKind(node) !== 'wait') {
    return { context: ctxFromState(state), waitingForUser: false };
  }
  let context = ctxFromState(state);
  const settings: any = node.data?.settings || {};
  const dur = settings.duration;
  const label =
    dur != null && typeof dur === 'object' ? JSON.stringify(dur) : dur != null ? String(dur) : '';
  const nextId = resolveNextNodeId(context, node, {});
  const waitNote: SimulatorMessage = {
    id: `wait_${node.id}_${Date.now()}`,
    from: 'bot',
    text: label ? `Пауза в сценарии (${label}) пройдена.` : 'Пауза в сценарии пройдена.',
    meta: { nodeId: node.id, kind: 'wait', variant: 'system' },
  };
  let hist = [...context.history, waitNote];
  if (nextId === null) {
    hist = [
      ...hist,
      systemLine(
        'В сценарии нет перехода после блока «Ожидание». Подключите исходящую связь.',
        'error'
      ),
    ];
  }
  context = {
    ...context,
    history: hist,
    currentNodeId: nextId,
  };
  return { context, waitingForUser: false };
}

/**
 * Выполняет шаги подряд, пока не потребуется ввод пользователя (кнопка / текст)
 * или не закончится граф (currentNodeId === null).
 * Убирает лишние клики «Дальше» между start / condition / variable / wait / message без кнопок.
 */
export function runUntilUserPauseOrEnd(
  state: SimulatorState,
  opts?: { maxSteps?: number }
): RunStepResult {
  const maxSteps = opts?.maxSteps ?? 50;
  let sim: SimulatorState = {
    graph: state.graph,
    graphsByScenarioId: state.graphsByScenarioId,
    scenarioTitlesById: state.scenarioTitlesById,
    activeScenarioId: state.activeScenarioId,
    currentNodeId: state.currentNodeId,
    history: state.history,
    variables: { ...state.variables },
    lastUserInput: state.lastUserInput,
  };

  let last: RunStepResult = { context: ctxFromState(sim), waitingForUser: false };

  for (let i = 0; i < maxSteps; i++) {
    // Повторный step при currentNodeId === null затирает deadEndFromStart и лишний раз дергает раннер
    if (!sim.currentNodeId && sim.history.length > 0) {
      return last;
    }

    last = stepFromCurrentNode(sim);
    const c = last.context;
    sim = {
      graph: c.graph,
      graphsByScenarioId: c.graphsByScenarioId,
      scenarioTitlesById: c.scenarioTitlesById,
      activeScenarioId: c.activeScenarioId,
      currentNodeId: c.currentNodeId,
      history: c.history,
      variables: c.variables,
      lastUserInput: c.lastUserInput,
    };
    if (last.waitingForUser) {
      return { ...last, context: c };
    }
    if (last.pendingWaitMs != null) {
      return { ...last, context: c };
    }
    if (c.currentNodeId == null) {
      return { ...last, context: c };
    }
  }

  return {
    context: ctxFromState(sim),
    waitingForUser: false,
    stalledMaxSteps: true,
  };
}

export function applyUserChoice(
  state: SimulatorState,
  payload: { label: string; sourceHandle?: string | null; buttonId?: string | null }
): RunStepResult {
  if (!state.currentNodeId) {
    return {
      context: ctxFromState(state),
      waitingForUser: false,
    };
  }

  /** Клик по inline-кнопке (message/start и т.п.): только переход, без пузыря пользователя в чате. Свободный ввод (input) — без buttonId/sourceHandle, пузырь оставляем. */
  const isButtonChoice = Boolean(payload.sourceHandle || payload.buttonId);

  const userMessage: SimulatorMessage = {
    id: `user_${Date.now()}`,
    from: 'user',
    text: payload.label,
  };

  const graph = state.graph;
  const baseVariables = state.variables || {};
  const node = graph.nodes.find(n => n.id === state.currentNodeId);

  if (!node) {
    return {
      context: {
        ...ctxFromState(state),
        currentNodeId: null,
        history: [
          ...state.history,
          ...(isButtonChoice ? [] : [userMessage]),
          systemLine(
            'Предпросмотр: активный блок не найден в графе. Сохраните сценарий и откройте предпросмотр снова.',
            'error'
          ),
        ],
      },
      waitingForUser: false,
    };
  }

  const kind = getNodeKind(node);

  const historyAfterChoice = isButtonChoice ? state.history : [...state.history, userMessage];

  if (kind === 'input') {
    const settings = migrateInputNodeSettings({ ...((node.data as any)?.settings || {}) });
    const outgoing = getOutgoingEdges(graph.edges, node.id);
    const errEdge = pickInputErrorEdge(outgoing);
    const ans = validateInputAnswer(settings, payload.label);

    if (!ans.ok) {
      const errHist = [...historyAfterChoice, systemLine(ans.message, 'error')];
      if (errEdge) {
        return {
          context: {
            ...ctxFromState(state),
            variables: { ...baseVariables },
            lastUserInput: payload.label,
            history: errHist,
            currentNodeId: errEdge.target,
          },
          waitingForUser: false,
        };
      }
      return {
        context: {
          ...ctxFromState(state),
          variables: { ...baseVariables },
          lastUserInput: payload.label,
          history: errHist,
          currentNodeId: state.currentNodeId,
        },
        waitingForUser: true,
      };
    }

    const norm = getNormalizedInputSettings(settings);
    const varKey = norm.variable_key.trim();
    let updatedVariables = { ...baseVariables };
    if (varKey) {
      updatedVariables[varKey] = ans.storedValue;
    }
    updatedVariables.last_input = ans.lastInputText;

    const succ = pickInputSuccessEdge(outgoing);
    let nextNodeId = succ?.target ?? null;
    let historyAfter = historyAfterChoice;
    if (nextNodeId === null) {
      historyAfter = [
        ...historyAfter,
        systemLine(
          'В сценарии нет перехода из блока «Ввод». Подключите исходящую связь «Успех» после ввода текста.',
          'error'
        ),
      ];
    }

    return {
      context: {
        ...ctxFromState(state),
        variables: updatedVariables,
        lastUserInput: ans.lastInputText,
        history: historyAfter,
        currentNodeId: nextNodeId,
      },
      waitingForUser: false,
    };
  }

  let updatedVariables = { ...baseVariables };

  if (kind === 'message' && isButtonChoice) {
    const btn = findMessageButtonByPayload(node, payload);
    const act = normalizeMessageButtonAction(btn?.action);
    if (act === 'url') {
      const rawUrl = String(btn?.url ?? '').trim();
      if (!rawUrl) {
        return {
          context: {
            ...ctxFromState(state),
            variables: updatedVariables,
            lastUserInput: payload.label,
            history: [
              ...state.history,
              systemLine(
                'У кнопки с действием «Перейти по ссылке» не задан URL. Укажите ссылку в настройках блока.',
                'error'
              ),
            ],
            currentNodeId: state.currentNodeId,
          },
          waitingForUser: true,
        };
      }
      try {
        if (typeof window !== 'undefined') {
          window.open(rawUrl, '_blank', 'noopener,noreferrer');
        }
      } catch {
        /* игнорируем блокировку popup / среду без window */
      }
      return {
        context: {
          ...ctxFromState(state),
          variables: updatedVariables,
          lastUserInput: payload.label,
          history: state.history,
          currentNodeId: state.currentNodeId,
        },
        waitingForUser: true,
      };
    }
  }

  const graphContext: RuntimeContext = {
    ...ctxFromState(state),
    variables: updatedVariables,
    lastUserInput: payload.label,
    history: historyAfterChoice,
  };

  const nextNodeId = resolveNextNodeId(graphContext, node, {
    sourceHandle: payload.sourceHandle ?? null,
    buttonId: payload.buttonId ?? null,
  });

  let historyAfter = graphContext.history;
  if (nextNodeId === null) {
    const settings: any = node.data?.settings || {};
    const hasMsgButtons =
      kind === 'message' && Array.isArray(settings.buttons) && settings.buttons.length > 0;
    const clickedButton = Boolean(payload.sourceHandle || payload.buttonId);

    if (hasMsgButtons && clickedButton) {
      const btn = findMessageButtonByPayload(node, payload);
      const act = normalizeMessageButtonAction(btn?.action);
      const isNext = act === 'next';
      historyAfter = [
        ...historyAfter,
        systemLine(
          isNext
            ? 'Для кнопки «Продолжить сценарий» нет исходящей связи на холсте. Проведите ребро от этого выхода кнопки к следующему блоку.'
            : 'Нет перехода к следующему шагу. Проверьте связи блока «Сообщение».',
          'error'
        ),
      ];
    } else if (kind === 'input') {
      historyAfter = [
        ...historyAfter,
        systemLine(
          'В сценарии нет перехода из блока «Ввод». Подключите исходящую связь после ввода текста.',
          'error'
        ),
      ];
    } else {
      historyAfter = [
        ...historyAfter,
        systemLine('Дальнейших шагов нет — проверьте связи блоков в редакторе.', 'error'),
      ];
    }
  }

  const updatedContext: RuntimeContext = {
    ...graphContext,
    history: historyAfter,
    currentNodeId: nextNodeId,
  };

  return {
    context: updatedContext,
    waitingForUser: false,
  };
}
