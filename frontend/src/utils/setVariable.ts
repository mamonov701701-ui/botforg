export type SetVariableValueType = 'string' | 'number' | 'boolean' | 'json';
export type SetVariableSettings = {
  key: string;
  value: unknown;
  value_type: SetVariableValueType;
  interpolation: boolean;
  overwrite: boolean;
};

export function normalizeSetVariableSettings(
  settings: Record<string, unknown>,
  blockCode = 'set_variable'
): SetVariableSettings | null {
  const isLegacyVariable = blockCode === 'variable';
  const isPureAction =
    blockCode === 'action' &&
    Boolean(settings.setVariable) &&
    !['mode', 'actionType', 'tag', 'status', 'message', 'text'].some(key => Boolean(settings[key]));
  if (blockCode !== 'set_variable' && !isLegacyVariable && !isPureAction) return null;
  const key = String(
    settings.key ?? (isLegacyVariable ? settings.name : settings.setVariable) ?? ''
  ).trim();
  const valueType = String(
    settings.value_type ?? (isLegacyVariable ? settings.type : 'string') ?? 'string'
  );
  if (!['string', 'number', 'boolean', 'json'].includes(valueType)) return null;
  return {
    key,
    value: settings.value ?? '',
    value_type: valueType as SetVariableValueType,
    interpolation: settings.interpolation === true,
    overwrite: settings.overwrite !== false,
  };
}

export function validateSetVariableSettings(settings: Record<string, unknown>): string | null {
  const normalized = normalizeSetVariableSettings(settings);
  if (!normalized || !/^[a-z][a-z0-9_]*$/.test(normalized.key))
    return 'Укажите имя переменной в lower_snake_case';
  try {
    convertSetVariableValue(normalized);
  } catch (error) {
    return error instanceof Error ? error.message : 'Некорректное значение';
  }
  return null;
}

export function convertSetVariableValue(
  settings: SetVariableSettings,
  interpolate?: (value: string) => string
): unknown {
  const raw =
    settings.interpolation && typeof settings.value === 'string' && interpolate
      ? interpolate(settings.value)
      : settings.value;
  if (settings.value_type === 'string') return typeof raw === 'string' ? raw : String(raw);
  if (settings.value_type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || String(raw).trim() === '')
      throw new Error('Введите корректное число');
    return n;
  }
  if (settings.value_type === 'boolean') {
    if (raw === true || raw === false) return raw;
    if (typeof raw === 'string' && /^(true|false)$/i.test(raw.trim()))
      return raw.trim().toLowerCase() === 'true';
    throw new Error('Для boolean используйте true или false');
  }
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Введите корректный JSON');
  }
}
