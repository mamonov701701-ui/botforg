/** Единые правила типов медиа для блока «Сообщение» (редактор + валидация + симулятор). */

export type MessageMediaKind = 'image' | 'gif' | 'video';

export const MESSAGE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MESSAGE_GIF_MIMES = ['image/gif'] as const;
export const MESSAGE_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/mpeg',
] as const;

export function allowedMimeTypesForMessageMedia(kind: MessageMediaKind): readonly string[] {
  switch (kind) {
    case 'image':
      return MESSAGE_IMAGE_MIMES;
    case 'gif':
      return MESSAGE_GIF_MIMES;
    case 'video':
      return MESSAGE_VIDEO_MIMES;
  }
}

export function fileInputAcceptForMessageMedia(kind: MessageMediaKind | 'none'): string {
  if (kind === 'none') return '';
  return allowedMimeTypesForMessageMedia(kind).join(',');
}

export function inferMessageMediaKindFromFile(file: File): MessageMediaKind {
  if (MESSAGE_GIF_MIMES.includes(file.type as (typeof MESSAGE_GIF_MIMES)[number])) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

/** Эвристика по пути URL (после снятия query). */
export function inferMessageMediaKindFromUrl(url: string): MessageMediaKind {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.gif') || path.includes('.gif')) return 'gif';
  if (/\.(mp4|webm|mov|mpe?g)(\b|\/|$)/.test(path)) return 'video';
  return 'image';
}

export function fileMatchesDeclaredMessageMedia(
  declared: MessageMediaKind | 'none' | undefined,
  file: File
): boolean {
  if (!declared || declared === 'none') return true;
  const t = file.type;
  return (allowedMimeTypesForMessageMedia(declared) as readonly string[]).includes(t);
}

/** Соответствие элемента медиа выбранному в селекте типу (image / gif / video). */
export function messageMediaItemMatchesDeclared(
  declared: MessageMediaKind | 'none' | undefined,
  itemKind: MessageMediaKind
): boolean {
  if (!declared || declared === 'none') return true;
  return declared === itemKind;
}

/**
 * Совместимость одной строки `mediaList` с типом блока (как в schemaValidation).
 */
export function messageMediaListRowCompatibleWithDeclared(
  raw: unknown,
  declared: MessageMediaKind
): boolean {
  const row = raw as Record<string, unknown>;
  const url = String(row?.url ?? '').trim();
  if (!url) return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  const inferred = inferMessageMediaKindFromUrl(url);
  const stored =
    row?.type === 'gif' || row?.type === 'video' || row?.type === 'image' ? row.type : null;
  return (
    messageMediaItemMatchesDeclared(declared, inferred) ||
    (stored != null && messageMediaItemMatchesDeclared(declared, stored))
  );
}

export interface MessageMediaItem {
  url: string;
  type: MessageMediaKind;
}

/** Данные для предпросмотра и согласованность с legacy `mediaUrl`. */
export function normalizeMessageMediaFromSettings(
  settings: Record<string, unknown>
): MessageMediaItem[] {
  const list = settings.mediaList;
  if (Array.isArray(list) && list.length > 0) {
    const out: MessageMediaItem[] = [];
    for (const raw of list) {
      const item = raw as { url?: unknown; type?: unknown };
      const url = String(item?.url ?? '').trim();
      if (!url) continue;
      let type: MessageMediaKind =
        item?.type === 'gif' || item?.type === 'video' || item?.type === 'image'
          ? item.type
          : inferMessageMediaKindFromUrl(url);
      out.push({ url, type });
    }
    return out;
  }
  const legacy = String((settings as { mediaUrl?: unknown }).mediaUrl ?? '').trim();
  if (legacy) {
    const mt = settings.mediaType as string | undefined;
    const type: MessageMediaKind =
      mt === 'gif' ? 'gif' : mt === 'video' ? 'video' : inferMessageMediaKindFromUrl(legacy);
    return [{ url: legacy, type }];
  }
  return [];
}

export function parseModeForSimulator(raw: unknown): 'Plain' | 'Markdown' | 'HTML' {
  if (raw === 'Markdown' || raw === 'HTML' || raw === 'Plain') return raw;
  return 'Plain';
}
