import type { Node } from 'reactflow';

/** Кнопка блока message в сценарии (editor + preview). */
export type MessageButtonAction = 'next' | 'url';

export interface MessageFlowButton {
  id: string;
  label: string;
  action: MessageButtonAction;
  url?: string;
}

/** Совместимость: branch и устаревшие значения → next; только 'url' остаётся url. */
export function normalizeMessageButtonAction(raw: unknown): MessageButtonAction {
  if (raw === 'url') return 'url';
  return 'next';
}

export function findMessageButtonByPayload(
  node: Node | undefined | null,
  payload: { sourceHandle?: string | null; buttonId?: string | null }
): Record<string, unknown> | null {
  if (!node) return null;
  const settings = (node.data as any)?.settings || {};
  const buttons = settings.buttons;
  if (!Array.isArray(buttons)) return null;
  if (payload.buttonId) {
    const found = buttons.find((b: any) => String(b?.id ?? '') === String(payload.buttonId));
    if (found) return found as Record<string, unknown>;
  }
  const m = /^button_(\d+)$/.exec(payload.sourceHandle || '');
  if (m) {
    const idx = parseInt(m[1], 10);
    const b = buttons[idx];
    return b != null ? (b as Record<string, unknown>) : null;
  }
  return null;
}
