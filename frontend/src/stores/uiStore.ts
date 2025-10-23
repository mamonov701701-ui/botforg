import { create } from 'zustand';

interface UiState {
  authModalOpen: boolean;
  nextPath: string | null;
  openAuth: (nextPath?: string) => void;
  closeAuth: () => void;
}

export const useUiStore = create<UiState>(set => ({
  authModalOpen: false,
  nextPath: null,
  openAuth: nextPath => set({ authModalOpen: true, nextPath: nextPath || null }),
  closeAuth: () => set({ authModalOpen: false, nextPath: null }),
}));
