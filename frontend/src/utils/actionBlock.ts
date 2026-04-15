export type UserDataMode = 'tag' | 'status' | 'field';
export type TagAction = 'add' | 'remove';
export type StatusAction = 'set' | 'clear';
export type FieldAction = 'set' | 'clear';

export interface NormalizedActionSettings {
  mode: UserDataMode | null;
  tagAction: TagAction | null;
  tag: string;
  statusAction: StatusAction | null;
  status: string;
  fieldAction: FieldAction | null;
  fieldKey: string;
  fieldValue: string;
  message: string;
}

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Совместимость: читает новую схему и legacy-настройки старого блока "Действие". */
export function normalizeActionSettings(
  settings: Record<string, unknown>
): NormalizedActionSettings {
  const modeRaw = asTrimmedString(settings.mode);
  const mode: UserDataMode | null =
    modeRaw === 'tag' || modeRaw === 'status' || modeRaw === 'field' ? modeRaw : null;

  const out: NormalizedActionSettings = {
    mode,
    tagAction: null,
    tag: asTrimmedString(settings.tag),
    statusAction: null,
    status: asTrimmedString(settings.status),
    fieldAction: null,
    fieldKey: asTrimmedString(settings.fieldKey),
    fieldValue: typeof settings.fieldValue === 'string' ? settings.fieldValue : '',
    message:
      typeof settings.message === 'string'
        ? settings.message
        : typeof settings.text === 'string'
          ? settings.text
          : '',
  };

  if (mode === 'tag') {
    const a = asTrimmedString(settings.tagAction);
    out.tagAction = a === 'add' || a === 'remove' ? a : null;
    return out;
  }

  if (mode === 'status') {
    const a = asTrimmedString(settings.statusAction);
    out.statusAction = a === 'set' || a === 'clear' ? a : null;
    return out;
  }

  if (mode === 'field') {
    const a = asTrimmedString(settings.fieldAction);
    out.fieldAction = a === 'set' || a === 'clear' ? a : null;
    return out;
  }

  // legacy: actionType + tag
  const oldActionType = asTrimmedString(settings.actionType);
  if (oldActionType === 'add_tag' || oldActionType === 'remove_tag') {
    out.mode = 'tag';
    out.tagAction = oldActionType === 'add_tag' ? 'add' : 'remove';
    return out;
  }

  // legacy: setVariable + value (+ optional text)
  const oldVar = asTrimmedString(settings.setVariable);
  if (oldVar) {
    out.mode = 'field';
    out.fieldAction = 'set';
    out.fieldKey = oldVar;
    out.fieldValue =
      typeof settings.value === 'string' ? settings.value : String(settings.value ?? '');
    return out;
  }

  return out;
}

export function actionSummaryText(s: NormalizedActionSettings): string {
  if (s.mode === 'tag') {
    if (!s.tagAction) return 'не настроено';
    if (!s.tag) return 'укажите тег';
    if (s.tagAction === 'remove') return `удалить тег ${s.tag}`;
    if (s.tagAction === 'add') return `добавить тег ${s.tag}`;
    return 'не настроено';
  }
  if (s.mode === 'status') {
    if (!s.statusAction) return 'не настроено';
    if (s.statusAction === 'clear') return 'сбросить статус';
    if (s.statusAction === 'set')
      return s.status ? `установить статус ${s.status}` : 'укажите статус';
    return 'не настроено';
  }
  if (s.mode === 'field') {
    if (!s.fieldAction) return 'не настроено';
    if (!s.fieldKey) return 'укажите поле';
    if (s.fieldAction === 'clear') return `${s.fieldKey} очищается`;
    if (s.fieldAction === 'set' && s.fieldValue.trim())
      return `${s.fieldKey} ← ${s.fieldValue.trim()}`;
    if (s.fieldAction === 'set') return 'укажите значение';
    return 'не настроено';
  }
  return 'не настроено';
}

export function canonicalizeActionSettings(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const s = normalizeActionSettings(settings);
  const out: Record<string, unknown> = {};
  const hasMessageKey =
    Object.prototype.hasOwnProperty.call(settings, 'message') ||
    Object.prototype.hasOwnProperty.call(settings, 'text');
  if (s.mode) out.mode = s.mode;
  if (s.mode === 'tag') {
    if (s.tagAction) out.tagAction = s.tagAction;
    if (s.tag) out.tag = s.tag;
    // ВАЖНО: backend runtime пока ожидает legacy actionType для тегов.
    if (s.tagAction === 'add') out.actionType = 'add_tag';
    if (s.tagAction === 'remove') out.actionType = 'remove_tag';
  }
  if (s.mode === 'status') {
    if (s.statusAction) out.statusAction = s.statusAction;
    if (s.statusAction === 'set' && s.status) out.status = s.status;
  }
  if (s.mode === 'field') {
    if (s.fieldAction) out.fieldAction = s.fieldAction;
    if (s.fieldKey) out.fieldKey = s.fieldKey;
    if (s.fieldAction === 'set' && s.fieldValue.trim()) out.fieldValue = s.fieldValue;
  }
  const trimmedMessage = s.message.trim();
  if (trimmedMessage) {
    out.message = trimmedMessage;
    // legacy совместимость: старый runtime мог читать текст из text.
    out.text = trimmedMessage;
  } else if (hasMessageKey) {
    // Явно фиксируем очистку, иначе merge в onUpdateNode оставляет старое значение.
    out.message = '';
    out.text = '';
  }
  return out;
}
