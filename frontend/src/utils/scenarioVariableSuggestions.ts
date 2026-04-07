import type { Node } from 'reactflow';
import type { VariableDefinitionItem } from '../api/botMessageTemplate';

export interface VariableSuggestionItem {
  key: string;
  label: string | null;
  data_type: string;
  is_system: boolean;
  scope: string | null;
  source: 'local' | 'backend';
}

function humanizeKey(key: string): string {
  const cleaned = key
    .replace(/^user_/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!cleaned) return 'Ответ пользователя';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function toUserVariableName(row: { key: string; label: string | null }): string {
  if (row.label && row.label.trim()) return row.label.trim();
  return humanizeKey(String(row.key || ''));
}

export function getVariableDisplayWithKey(row: { key: string; label: string | null }): string {
  return `${toUserVariableName(row)} → {{${row.key}}}`;
}

export function collectLocalInputVariables(nodes: Node[]): VariableSuggestionItem[] {
  const out: VariableSuggestionItem[] = [];
  for (const n of nodes) {
    const blockId = String((n.data as any)?.blockId || '').toLowerCase();
    if (blockId !== 'input') continue;
    const settings = ((n.data as any)?.settings || {}) as Record<string, unknown>;
    const key = String(settings.variable_key || '').trim();
    if (!key) continue;
    const labelRaw = String(settings.variable_label || '').trim();
    const dataType = String((settings.validation as any)?.type || 'string');
    out.push({
      key,
      label: labelRaw || null,
      data_type: dataType,
      is_system: false,
      scope: null,
      source: 'local',
    });
  }
  return out;
}

export function mergeVariableSuggestions(
  localItems: VariableSuggestionItem[],
  backendItems: VariableDefinitionItem[]
): VariableSuggestionItem[] {
  const byKey = new Map<string, VariableSuggestionItem>();

  for (const b of backendItems) {
    byKey.set(b.key, { ...b, source: 'backend' });
  }

  for (const l of localItems) {
    const prev = byKey.get(l.key);
    if (!prev) {
      byKey.set(l.key, l);
      continue;
    }
    byKey.set(l.key, {
      ...prev,
      label: l.label || prev.label || humanizeKey(l.key),
      data_type: l.data_type || prev.data_type || 'string',
      source: 'local',
    });
  }

  return [...byKey.values()]
    .map(row => ({ ...row, label: row.label || humanizeKey(row.key) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
