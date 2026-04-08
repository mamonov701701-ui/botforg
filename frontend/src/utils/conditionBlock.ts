import type { Edge, Node } from 'reactflow';

/** Ветка блока «Условие»: хранится в edge.data (React Flow), в snapshot — в routing. */
export type ConditionBranchRole = 'true' | 'false';

/** Стабильный порядок рёбер (fallback при отсутствии явных веток). */
export function orderConditionOutgoingEdges(outgoing: Edge[]): Edge[] {
  return [...outgoing].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function getEdgeConditionBranch(edge: Edge): ConditionBranchRole | undefined {
  const v = (edge.data as { conditionBranch?: unknown } | undefined)?.conditionBranch;
  return v === 'true' || v === 'false' ? v : undefined;
}

/**
 * Явные «Да»/«Нет»: по data.conditionBranch.
 * Если нет пары true+false — fallback: 1-е и 2-е ребро в порядке id (как раньше).
 */
export function resolveConditionYesNoEdges(outgoing: Edge[]): {
  yes: Edge | null;
  no: Edge | null;
} {
  const yesList = outgoing.filter(e => getEdgeConditionBranch(e) === 'true');
  const noList = outgoing.filter(e => getEdgeConditionBranch(e) === 'false');
  if (yesList.length > 0 && noList.length > 0) {
    return {
      yes: orderConditionOutgoingEdges(yesList)[0] ?? null,
      no: orderConditionOutgoingEdges(noList)[0] ?? null,
    };
  }
  const sorted = orderConditionOutgoingEdges(outgoing);
  return {
    yes: sorted[0] ?? null,
    no: sorted[1] ?? null,
  };
}

/**
 * Проставить conditionBranch у исходящих от «Условие», если ещё не задано (обратная совместимость).
 */
export function ensureConditionEdgeBranches(edges: Edge[], nodes: Node[]): Edge[] {
  const conditionIds = new Set(
    nodes
      .filter(n => String((n.data as { blockId?: string })?.blockId) === 'condition')
      .map(n => n.id)
  );
  if (conditionIds.size === 0) return edges;

  const bySource = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!conditionIds.has(e.source)) continue;
    const arr = bySource.get(e.source) || [];
    arr.push(e);
    bySource.set(e.source, arr);
  }

  let changed = false;
  const next = edges.map(edge => {
    if (!conditionIds.has(edge.source)) return edge;
    const prev = getEdgeConditionBranch(edge);
    if (prev === 'true' || prev === 'false') return edge;

    // 1) Приоритет: реальный sourceHandle от узла условия.
    if (edge.sourceHandle === 'condition_yes') {
      changed = true;
      const d = { ...(edge.data as object), conditionBranch: 'true' as const };
      return { ...edge, data: d };
    }
    if (edge.sourceHandle === 'condition_no') {
      changed = true;
      const d = { ...(edge.data as object), conditionBranch: 'false' as const };
      return { ...edge, data: d };
    }

    // 2) Fallback для legacy-данных: стабильное назначение по id.
    const group = bySource.get(edge.source) || [];
    const sorted = orderConditionOutgoingEdges(group);
    const idx = sorted.findIndex(x => x.id === edge.id);
    if (idx === 0) {
      changed = true;
      const d = { ...(edge.data as object), conditionBranch: 'true' as const };
      return { ...edge, data: d, sourceHandle: 'condition_yes' };
    }
    if (idx === 1) {
      changed = true;
      const d = { ...(edge.data as object), conditionBranch: 'false' as const };
      return { ...edge, data: d, sourceHandle: 'condition_no' };
    }
    return edge;
  });
  return changed ? next : edges;
}

function strTrim(v: unknown): string {
  return String(v ?? '').trim();
}

/** Как в scenarioRunner.valuesEqualForConditionRoute — для operator equals / notEquals */
function valuesEqualConditionOperands(a: unknown, b: unknown): boolean {
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
  return strTrim(a) === strTrim(b);
}

export function isConditionallyEmpty(v: unknown): boolean {
  return v == null || strTrim(v) === '';
}

/**
 * Вычисляет результат условия блока «Условие» по settings (каталог: variable, operator, value, conditionKey).
 * Значение берётся заранее (variables[key] ?? lastUserInput), key = conditionKey ?? variable.
 */
export function evaluateConditionSettings(
  settings: Record<string, unknown>,
  actual: unknown
): boolean {
  const op = String(settings.operator || 'equals');

  switch (op) {
    case 'equals':
      return valuesEqualConditionOperands(actual, settings.value);
    case 'notEquals':
      return !valuesEqualConditionOperands(actual, settings.value);
    case 'contains':
      return strTrim(actual).includes(strTrim(settings.value));
    case 'greaterThan': {
      const a = Number(actual);
      const b = Number(settings.value);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a > b;
      return strTrim(actual) > strTrim(settings.value);
    }
    case 'lessThan': {
      const a = Number(actual);
      const b = Number(settings.value);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a < b;
      return strTrim(actual) < strTrim(settings.value);
    }
    case 'isEmpty':
      return isConditionallyEmpty(actual);
    case 'isNotEmpty':
      return !isConditionallyEmpty(actual);
    default:
      return Boolean(actual);
  }
}
