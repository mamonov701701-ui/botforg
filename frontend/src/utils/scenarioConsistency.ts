/**
 * Консистентность сценария: переменные, теги (зарезервировано), рёбра, обязательные поля.
 * Коды диностик согласованы с продуктовым ТЗ редактора.
 */

import type { Edge, Node } from 'reactflow';
import type { BlockCatalogItem } from '../types/blocks';
import { extractPlaceholderKeys } from '../lib/templateRender';
import {
  getNormalizedInputSettings,
  validateInputVariableKey,
  migrateInputNodeSettings,
  validateInputBlockConfigFields,
} from './inputBlock';
import { validateNodeSettings } from './schemaValidation';

/** Поля профиля user.* — зеркало backend message_template/diagnostics USER_PROFILE_PLACEHOLDER_FIELDS */
const USER_PROFILE_PLACEHOLDER_FIELDS = new Set([
  'first_name',
  'last_name',
  'username',
  'phone',
  'email',
  'language_code',
  'avatar_url',
  'status',
  'channel',
  'external_user_id',
]);

export type ScenarioDiagnosticSeverity = 'error' | 'warning';

export type ScenarioDiagnosticCode =
  | 'InputVariableKeyInvalid'
  | 'InputVariableKeyMissing'
  | 'MessageUnknownPlaceholder'
  | 'ConditionUnknownVariable'
  | 'MissingOutgoingEdge'
  | 'RequiredFieldMissing';

export interface ScenarioDiagnostic {
  severity: ScenarioDiagnosticSeverity;
  /** React Flow node id */
  blockId: string;
  code: ScenarioDiagnosticCode;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ScenarioConsistencyOptions {
  /** Ключи ctor_bot_variable_definitions (и прочие известные плоские ключи) */
  definedVariableKeys?: string[];
  /** Подмножество system.* (обычно is_system из определений) */
  systemVariableKeys?: string[];
  /** Для go_to_scenario — как в validateNodeSettings */
  scenariosForGoTo?: Array<{ id: number; name: string }>;
  /**
   * Если true: неизвестные плейсхолдеры всегда error (даже без списка определений).
   * По умолчанию: без списка определений — warning, с непустым списком — error.
   */
  strictPlaceholders?: boolean;
}

function tokenIsKnown(token: string, flatVarKeys: Set<string>, systemSubset: Set<string>): boolean {
  const key = token.trim();
  if (!key) return true;
  if (key.includes('.')) {
    const [ns, restRaw] = key.split('.', 2);
    const rest = (restRaw || '').trim();
    if (!rest) return false;
    if (ns === 'user') return USER_PROFILE_PLACEHOLDER_FIELDS.has(rest);
    if (ns === 'system') return systemSubset.has(rest);
    return false;
  }
  return flatVarKeys.has(key);
}

function getOutgoingEdges(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter(e => e.source === nodeId);
}

/** Как в scenarioRunner.pickInputSuccessEdge */
function pickInputSuccessEdge(outgoing: Edge[]): Edge | null {
  if (outgoing.length === 0) return null;
  const bySuccess = outgoing.find(e => (e.sourceHandle || '') === 'success');
  if (bySuccess) return bySuccess;
  const nonError = outgoing.filter(e => (e.sourceHandle || '') !== 'error');
  if (nonError.length > 0) return nonError[0];
  return null;
}

function collectMessageTemplateStrings(settings: Record<string, unknown>): string[] {
  const out: string[] = [];
  const text = settings.text;
  if (typeof text === 'string' && text) out.push(text);
  const buttons = settings.buttons;
  if (Array.isArray(buttons)) {
    for (const b of buttons) {
      if (b && typeof b === 'object' && typeof (b as { label?: unknown }).label === 'string') {
        out.push(String((b as { label: string }).label));
      }
    }
  }
  return out;
}

function placeholderSeverity(opts: ScenarioConsistencyOptions): ScenarioDiagnosticSeverity {
  if (opts.strictPlaceholders) return 'error';
  const keys = opts.definedVariableKeys;
  if (keys && keys.length > 0) return 'error';
  return 'warning';
}

/**
 * Проверяет весь граф сценария. Не ходит в сеть.
 */
export function validateScenarioConsistency(
  nodes: Node[],
  edges: Edge[],
  catalog: BlockCatalogItem[],
  options: ScenarioConsistencyOptions = {}
): ScenarioDiagnostic[] {
  const diags: ScenarioDiagnostic[] = [];
  const flatVarKeys = new Set(options.definedVariableKeys ?? []);
  const systemSubset = new Set(options.systemVariableKeys ?? []);
  const phSeverity = placeholderSeverity(options);

  const blockByNodeId = new Map<string, BlockCatalogItem | undefined>();
  for (const node of nodes) {
    const bid = node.data?.blockId as string | undefined;
    blockByNodeId.set(node.id, bid ? catalog.find(b => b.id === bid) : undefined);
  }

  for (const node of nodes) {
    const blockId = node.data?.blockId as string | undefined;
    const block = blockByNodeId.get(node.id);
    const settings = (node.data?.settings || {}) as Record<string, unknown>;
    const title = (node.data?.title as string) || block?.title || blockId || node.id;

    if (blockId === 'input') {
      const migrated = migrateInputNodeSettings({ ...settings });
      const norm = getNormalizedInputSettings(migrated);
      const vk = norm.variable_key?.trim() || '';
      if (!vk) {
        diags.push({
          severity: 'error',
          blockId: node.id,
          code: 'InputVariableKeyMissing',
          message: `Блок «${title}»: не указан ключ переменной (variable_key)`,
          meta: { blockTitle: title },
        });
      } else {
        const inv = validateInputVariableKey(vk);
        if (inv) {
          diags.push({
            severity: 'error',
            blockId: node.id,
            code: 'InputVariableKeyInvalid',
            message: `Блок «${title}»: ${inv}`,
            meta: { key: vk },
          });
        }
      }
      const outgoing = getOutgoingEdges(edges, node.id);
      if (pickInputSuccessEdge(outgoing) === null) {
        diags.push({
          severity: 'error',
          blockId: node.id,
          code: 'MissingOutgoingEdge',
          message: `Блок «${title}»: нет исходящей связи успеха (подключите выход после ввода)`,
          meta: { expected: 'success_or_non_error' },
        });
      }
      const vkCombinedErr = validateInputVariableKey(norm.variable_key || '');
      for (const msg of validateInputBlockConfigFields(migrated)) {
        if (vkCombinedErr && msg === vkCombinedErr) continue;
        diags.push({
          severity: 'error',
          blockId: node.id,
          code: 'RequiredFieldMissing',
          message: `Блок «${title}»: ${msg}`,
          meta: { fieldLabel: msg },
        });
      }
    }

    if (blockId === 'message') {
      for (const chunk of collectMessageTemplateStrings(settings)) {
        for (const token of extractPlaceholderKeys(chunk)) {
          if (!tokenIsKnown(token, flatVarKeys, systemSubset)) {
            diags.push({
              severity: phSeverity,
              blockId: node.id,
              code: 'MessageUnknownPlaceholder',
              message: `Сообщение «${title}»: неизвестный плейсхолдер {{${token}}}`,
              meta: { token },
            });
          }
        }
      }
    }

    if (blockId === 'condition') {
      const rawVar = settings.variable;
      const varStr = typeof rawVar === 'string' ? rawVar.trim() : '';
      if (varStr && !tokenIsKnown(varStr, flatVarKeys, systemSubset)) {
        diags.push({
          severity: phSeverity,
          blockId: node.id,
          code: 'ConditionUnknownVariable',
          message: `Условие «${title}»: переменная «${varStr}» не найдена в определениях и не является допустимой user.* / system.*`,
          meta: { variable: varStr },
        });
      }
    }

    if (blockId !== 'input') {
      const schemaResult = validateNodeSettings(node, block, options.scenariosForGoTo);
      if (!schemaResult.isValid) {
        for (const fieldLabel of schemaResult.missingFields) {
          diags.push({
            severity: 'error',
            blockId: node.id,
            code: 'RequiredFieldMissing',
            message: `Блок «${title}»: не заполнено обязательное поле «${fieldLabel}»`,
            meta: { fieldLabel, schemaMessage: fieldLabel },
          });
        }
      }
    }
  }

  return diags;
}

export function hasScenarioErrors(diags: ScenarioDiagnostic[]): boolean {
  return diags.some(d => d.severity === 'error');
}

export function hasScenarioWarnings(diags: ScenarioDiagnostic[]): boolean {
  return diags.some(d => d.severity === 'warning');
}
