/**
 * Блок «Ввод»: нормализация настроек (миграция), валидация ключа и ответа пользователя.
 * Используется симулятором и может совпадать по правилам с backend scenario_flow.input_block.
 */

export const INPUT_VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export type InputValidationType = 'string' | 'number' | 'email' | 'phone' | 'date';

export interface InputValidationRules {
  type: InputValidationType;
  min_length?: number;
  max_length?: number;
  regex?: string;
}

export interface NormalizedInputSettings {
  question_text: string;
  variable_key: string;
  variable_label?: string;
  variable_key_manual?: boolean;
  separate_error_branch?: boolean;
  placeholder?: string;
  required: boolean;
  trim: boolean;
  validation: InputValidationRules;
  error_message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const CYR_MAP: Record<string, string> = {
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
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function generateInputVariableKeyFromLabel(label: string): string {
  const low = (label || '').toLowerCase().trim();
  if (!low) return '';
  let out = '';
  for (const ch of low) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      continue;
    }
    if (CYR_MAP[ch] !== undefined) {
      out += CYR_MAP[ch];
      continue;
    }
    out += '_';
  }
  out = out
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!out) out = 'answer';
  if (!/^[a-z]/.test(out)) out = `v_${out}`;
  if (out.endsWith('_')) out = out.replace(/_+$/g, '');
  if (!out) out = 'answer';
  return out;
}

/** Миграция legacy: text → question_text, variableName|name → variable_key */
export function migrateInputNodeSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };

  if (
    (next.question_text === undefined || next.question_text === '') &&
    typeof next.text === 'string'
  ) {
    next.question_text = next.text;
  }

  if (
    (next.variable_key === undefined || next.variable_key === '') &&
    typeof next.variableName === 'string'
  ) {
    next.variable_key = next.variableName;
  }
  if (
    (next.variable_key === undefined || next.variable_key === '') &&
    typeof next.name === 'string'
  ) {
    next.variable_key = next.name;
  }

  if (next.required === undefined) next.required = true;
  if (next.trim === undefined) next.trim = true;
  if (next.separate_error_branch === undefined) next.separate_error_branch = true;

  let v = asRecord(next.validation);
  const t = v.type;
  if (t !== 'string' && t !== 'number' && t !== 'email' && t !== 'phone' && t !== 'date') {
    v = { ...v, type: 'string' };
  }
  next.validation = v;

  return next;
}

export function getNormalizedInputSettings(raw: Record<string, unknown>): NormalizedInputSettings {
  const m = migrateInputNodeSettings(raw);
  const v = asRecord(m.validation);
  const typ = v.type as InputValidationType;
  const validation: InputValidationRules = {
    type: typ === 'number' || typ === 'email' || typ === 'phone' || typ === 'date' ? typ : 'string',
    min_length:
      typeof v.min_length === 'number' && Number.isFinite(v.min_length) ? v.min_length : undefined,
    max_length:
      typeof v.max_length === 'number' && Number.isFinite(v.max_length) ? v.max_length : undefined,
    regex: typeof v.regex === 'string' && v.regex.trim() !== '' ? v.regex : undefined,
  };

  return {
    question_text: typeof m.question_text === 'string' ? m.question_text : '',
    variable_key: typeof m.variable_key === 'string' ? m.variable_key : '',
    variable_label: typeof m.variable_label === 'string' ? m.variable_label : undefined,
    variable_key_manual: m.variable_key_manual === true,
    separate_error_branch: m.separate_error_branch !== false,
    placeholder: typeof m.placeholder === 'string' ? m.placeholder : undefined,
    required: m.required !== false,
    trim: m.trim !== false,
    validation,
    error_message: typeof m.error_message === 'string' ? m.error_message : undefined,
  };
}

export function validateInputVariableKey(key: string): string | undefined {
  const k = (key || '').trim();
  if (!k) return 'Укажите, как сохранить ответ пользователя';
  if (!INPUT_VARIABLE_KEY_PATTERN.test(k)) {
    return 'Используйте короткое имя латиницей: только буквы, цифры и _';
  }
  if (k.endsWith('_')) return 'Название не должно заканчиваться на _';
  return undefined;
}

export function validateRegexPattern(pattern: string): string | undefined {
  try {
    new RegExp(pattern);
    return undefined;
  } catch {
    return 'Некорректное регулярное выражение';
  }
}

/** Проверки полей настроек блока (для панели редактирования). */
export function validateInputBlockConfigFields(settings: Record<string, unknown>): string[] {
  const s = getNormalizedInputSettings(settings);
  const errs: string[] = [];
  if (!s.question_text.trim()) errs.push('Текст вопроса');
  const vk = validateInputVariableKey(s.variable_key);
  if (vk) errs.push(vk);

  const { min_length: minL, max_length: maxL, regex: rx } = s.validation;
  if (minL != null && maxL != null && minL > maxL) {
    errs.push('Мин. длина не может быть больше макс.');
  }
  if (rx) {
    const reErr = validateRegexPattern(rx);
    if (reErr) errs.push(reErr);
  }
  return errs;
}

export type InputAnswerResult =
  | { ok: true; storedValue: unknown; lastInputText: string }
  | { ok: false; message: string };

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Валидация ответа пользователя по настройкам блока.
 * rawAnswer — как введено в поле (trim выполняется если trim=true в настройках).
 */
export function validateInputAnswer(
  settings: Record<string, unknown>,
  rawAnswer: string
): InputAnswerResult {
  const s = getNormalizedInputSettings(settings);
  let text = rawAnswer ?? '';
  if (s.trim) text = text.trim();

  if (!text && !s.required) {
    return { ok: true, storedValue: '', lastInputText: '' };
  }

  if (!text && s.required) {
    return {
      ok: false,
      message: s.error_message?.trim() || 'Это обязательное поле',
    };
  }

  const { min_length: minL, max_length: maxL, regex: rx, type: vt } = s.validation;

  if (minL != null && text.length < minL) {
    return {
      ok: false,
      message: s.error_message?.trim() || `Минимальная длина: ${minL}`,
    };
  }
  if (maxL != null && text.length > maxL) {
    return {
      ok: false,
      message: s.error_message?.trim() || `Максимальная длина: ${maxL}`,
    };
  }

  if (rx) {
    let re: RegExp;
    try {
      re = new RegExp(rx);
    } catch {
      return { ok: false, message: s.error_message?.trim() || 'Ошибка правил валидации сценария' };
    }
    if (!re.test(text)) {
      return {
        ok: false,
        message: s.error_message?.trim() || 'Значение не подходит под заданный шаблон',
      };
    }
  }

  switch (vt) {
    case 'number': {
      if (!/^\d+$/.test(text)) {
        return { ok: false, message: s.error_message?.trim() || 'Введите только цифры' };
      }
      const n = Number(text);
      return { ok: true, storedValue: n, lastInputText: text };
    }
    case 'email': {
      if (!EMAIL_RE.test(text)) {
        return { ok: false, message: s.error_message?.trim() || 'Некорректный email' };
      }
      return { ok: true, storedValue: text, lastInputText: text };
    }
    case 'phone': {
      const d = digitsOnly(text);
      if (d.length < 10) {
        return {
          ok: false,
          message: s.error_message?.trim() || 'Укажите телефон (не менее 10 цифр)',
        };
      }
      return { ok: true, storedValue: text, lastInputText: text };
    }
    case 'date': {
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      if (!iso) {
        return {
          ok: false,
          message: s.error_message?.trim() || 'Укажите дату в формате ГГГГ-ММ-ДД',
        };
      }
      const y = Number(iso[1]);
      const mo = Number(iso[2]);
      const da = Number(iso[3]);
      const dt = new Date(Date.UTC(y, mo - 1, da));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) {
        return { ok: false, message: s.error_message?.trim() || 'Некорректная дата' };
      }
      return { ok: true, storedValue: text, lastInputText: text };
    }
    default:
      return { ok: true, storedValue: text, lastInputText: text };
  }
}
