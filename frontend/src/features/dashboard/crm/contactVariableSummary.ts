import type { CrmUserVariable, CrmVariableDef } from '../../../api/botCrm';

function formatVariableValueLong(val: unknown, maxLen = 480): string {
  if (val == null) return '';
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return '';
    return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    const s = JSON.stringify(val);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  } catch {
    return String(val);
  }
}

function isEmptyValue(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === 'string') return !val.trim();
  if (typeof val === 'boolean' || typeof val === 'number') return false;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val as object).length === 0;
  return false;
}

/** Человекочитаемый ключ из snake_case (например user_name → User Name). */
export function humanizeVariableKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Левая часть строки в popover: подпись поля или нормализованный ключ. */
export type ContactFieldLine = { keyLabel: string; value: string };

/**
 * Компактный счётчик полей с данными + полный список для popover («ключ: значение»).
 */
export function buildContactFieldsTableCell(
  variables: CrmUserVariable[],
  defs: CrmVariableDef[]
): { count: number; lines: ContactFieldLine[] } {
  const byKey = new Map(variables.map(v => [v.key, v]));
  const orderedDefs = defs.filter(d => !d.is_archived);
  const lines: ContactFieldLine[] = [];
  const usedKeys = new Set<string>();

  const push = (key: string, keyLabel: string, val: unknown) => {
    if (isEmptyValue(val)) return;
    const text = formatVariableValueLong(val);
    if (!text) return;
    lines.push({ keyLabel, value: text });
    usedKeys.add(key);
  };

  for (const def of orderedDefs) {
    const row = byKey.get(def.key);
    if (!row) continue;
    const keyLabel = (def.label && def.label.trim()) || humanizeVariableKey(def.key);
    push(def.key, keyLabel, row.value);
  }

  const rest = [...variables]
    .filter(v => !usedKeys.has(v.key) && !isEmptyValue(v.value))
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const v of rest) {
    push(v.key, humanizeVariableKey(v.key), v.value);
  }

  return { count: lines.length, lines };
}
