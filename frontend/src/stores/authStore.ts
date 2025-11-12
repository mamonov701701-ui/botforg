import { create } from 'zustand';

interface User {
  id: number;
  public_id?: number; // 8-значный публичный ID
  email: string;
  name: string | null;
  avatar: string | null;
  providers: string[];
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  loading: true,
  setUser: user => set({ user, loading: false }),
  clearUser: () => set({ user: null }),
  setLoading: loading => set({ loading }),
}));
