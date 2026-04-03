/**
 * Безопасный рендер {{ token }} без eval (зеркало backend/services/template_render).
 * Для предпросмотра редактора и симулятора.
 *
 * Резерв: синтаксис фильтров (|date) пока не поддерживается — см. PLACEHOLDER_PATTERN.
 */

export const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/** Минимальный контракт состояния симулятора без циклического импорта. */
export interface SimulatorLikeForTemplate {
  variables: Record<string, unknown>;
  lastUserInput: string | null;
}

/** Ключи в порядке появления (возможны повторы). */
export function extractPlaceholderKeys(template: string): string[] {
  if (!template) return [];
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
  while ((m = re.exec(template)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

export interface TemplateContextShape {
  variables: Record<string, string>;
  userProfile: Record<string, string>;
  system: Record<string, string>;
}

export interface TemplateRenderResultShape {
  renderedText: string;
  usedKeys: string[];
  missingKeys: string[];
}

function resolveToken(token: string, ctx: TemplateContextShape): { value: string; ok: boolean } {
  const key = token.trim();
  if (!key) return { value: '', ok: false };

  if (key.includes('.')) {
    const dot = key.indexOf('.');
    const ns = key.slice(0, dot);
    const rest = key.slice(dot + 1).trim();
    if (!rest) return { value: '', ok: false };
    if (ns === 'user') {
      if (Object.prototype.hasOwnProperty.call(ctx.userProfile, rest)) {
        return { value: ctx.userProfile[rest] ?? '', ok: true };
      }
      return { value: '', ok: false };
    }
    if (ns === 'system') {
      if (Object.prototype.hasOwnProperty.call(ctx.system, rest)) {
        return { value: ctx.system[rest] ?? '', ok: true };
      }
      if (
        rest === 'last_input' &&
        Object.prototype.hasOwnProperty.call(ctx.variables, 'last_input')
      ) {
        return { value: ctx.variables.last_input ?? '', ok: true };
      }
      return { value: '', ok: false };
    }
    return { value: '', ok: false };
  }

  if (Object.prototype.hasOwnProperty.call(ctx.variables, key)) {
    return { value: ctx.variables[key] ?? '', ok: true };
  }
  return { value: '', ok: false };
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '';
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Собрать контекст из состояния симулятора (плоские variables + system.last_input). */
export function buildSimulatorTemplateContext(ctx: SimulatorLikeForTemplate): TemplateContextShape {
  const variables: Record<string, string> = {};
  for (const k of Object.keys(ctx.variables)) {
    variables[k] = stringify(ctx.variables[k]);
  }
  const system: Record<string, string> = {};
  const fromVars = ctx.variables['last_input'];
  if (fromVars != null && fromVars !== '') {
    system.last_input = stringify(fromVars);
  }
  if (ctx.lastUserInput != null && ctx.lastUserInput !== '') {
    system.last_input = String(ctx.lastUserInput);
  }
  return {
    variables,
    userProfile: {},
    system,
  };
}

export function renderTemplate(
  template: string,
  context: TemplateContextShape
): TemplateRenderResultShape {
  const usedOrdered: string[] = [];
  const missingOrdered: string[] = [];
  const seenUsed = new Set<string>();
  const seenMissing = new Set<string>();

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_m, token: string) => {
    const { value, ok } = resolveToken(token, context);
    if (ok) {
      if (!seenUsed.has(token)) {
        seenUsed.add(token);
        usedOrdered.push(token);
      }
      return value;
    }
    if (!seenMissing.has(token)) {
      seenMissing.add(token);
      missingOrdered.push(token);
    }
    return '';
  });

  if (missingOrdered.length > 0 && typeof console !== 'undefined' && console.warn) {
    console.warn('[templateRender] missing keys:', missingOrdered);
  }

  return {
    renderedText: rendered,
    usedKeys: usedOrdered,
    missingKeys: missingOrdered,
  };
}

export function renderForSimulator(
  template: string,
  runtime: SimulatorLikeForTemplate
): TemplateRenderResultShape {
  return renderTemplate(template, buildSimulatorTemplateContext(runtime));
}
