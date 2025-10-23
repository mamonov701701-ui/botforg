/**
 * Global toast utility
 * Thin wrapper around editorStore.showToast for easy access
 */

import { useEditorStore } from '../stores/editorStore';

export const toast = {
  success: (msg: string) => useEditorStore.getState().showToast(msg, 'success'),
  error: (msg: string) => useEditorStore.getState().showToast(msg, 'error'),
  warning: (msg: string) => useEditorStore.getState().showToast(msg, 'warning'),
  info: (msg: string) => useEditorStore.getState().showToast(msg, 'info'),
};
