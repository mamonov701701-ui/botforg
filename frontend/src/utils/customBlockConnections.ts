const MACHINE_KEY_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const RESERVED_MACHINE_KEYS = new Set([
  'default',
  'terminal',
  '__proto__',
  'constructor',
  'prototype',
]);

const TRANSLITERATION: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const COMMON_ROUTE_KEYS: Record<string, string> = {
  успех: 'success',
  ошибка: 'error',
  да: 'yes',
  нет: 'no',
  найдено: 'found',
  'не найдено': 'not_found',
  повторить: 'retry',
};

export interface CustomBlockOutputPort {
  name: string;
  display_name: string;
  type?: string;
  [key: string]: unknown;
}

function isAvailableMachineKey(value: string, occupied: Set<string>): boolean {
  return (
    MACHINE_KEY_PATTERN.test(value) && !RESERVED_MACHINE_KEYS.has(value) && !occupied.has(value)
  );
}

export function outputMachineKey(displayName: string, occupiedKeys: string[] = []): string {
  const occupied = new Set(occupiedKeys);
  const normalizedDisplay = displayName.trim().toLowerCase();
  let base =
    COMMON_ROUTE_KEYS[normalizedDisplay] ||
    Array.from(normalizedDisplay)
      .map(char => TRANSLITERATION[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  if (!base) base = 'route';
  if (/^[0-9]/.test(base)) base = `route_${base}`;
  if (base.length < 3) base = `${base}_route`;
  base = base.slice(0, 64);
  if (isAvailableMachineKey(base, occupied)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const ending = `_${suffix}`;
    const candidate = `${base.slice(0, 64 - ending.length)}${ending}`;
    if (isAvailableMachineKey(candidate, occupied)) return candidate;
  }
}

export function normalizedOutputPorts(
  outputs: Record<string, unknown>[],
  count: number = outputs.length,
  occupiedKeys: string[] = []
): CustomBlockOutputPort[] {
  const wanted = Math.max(0, Math.min(32, count));
  const result: CustomBlockOutputPort[] = [];
  for (let index = 0; index < wanted; index += 1) {
    const port = outputs[index] || {};
    const displayName =
      String(port.display_name || port.name || `Выход ${index + 1}`).trim() || `Выход ${index + 1}`;
    const occupied = [...occupiedKeys, ...result.map(item => item.name)];
    const existingKey = String(port.name || '').trim();
    const name = isAvailableMachineKey(existingKey, new Set(occupied))
      ? existingKey
      : outputMachineKey(displayName, occupied);
    result.push({ ...port, name, display_name: displayName, type: String(port.type || 'json') });
  }
  return result;
}

export function normalizedInputPorts(
  inputs: Record<string, unknown>[],
  occupiedKeys: string[] = []
): CustomBlockOutputPort[] {
  const result: CustomBlockOutputPort[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const port = inputs[index] || {};
    const displayName =
      String(port.display_name || port.name || `Вход ${index + 1}`).trim() || `Вход ${index + 1}`;
    const occupied = [...occupiedKeys, ...result.map(item => item.name)];
    const existingKey = String(port.name || '').trim();
    const name = isAvailableMachineKey(existingKey, new Set(occupied))
      ? existingKey
      : outputMachineKey(displayName, occupied);
    result.push({ ...port, name, display_name: displayName, type: String(port.type || 'json') });
  }
  return result;
}

export function customBlockConnectionContract(passport: Record<string, any> | undefined): {
  inputCount: 0 | 1;
  outputs: CustomBlockOutputPort[];
} {
  const rules = passport?.connection_rules || {};
  const inputCount = Number(rules.input_count ?? 1) === 0 ? 0 : 1;
  const rawOutputs = Array.isArray(passport?.outputs) ? passport.outputs : [];
  if (rawOutputs.length > 0 || rules.output_count != null) {
    return { inputCount, outputs: normalizedOutputPorts(rawOutputs, rawOutputs.length) };
  }
  return {
    inputCount,
    outputs: [{ name: 'success', display_name: 'Успех', type: 'json' }],
  };
}
