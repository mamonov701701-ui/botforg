import { create } from 'zustand';

interface User {
  id: number;
  public_id?: number; // 8-значный публичный ID
  email: string;
  name: string | null;
  avatar: string | null;
  providers: string[];
  role: string;
  plan_code?: string; // free, pro, team, developer
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authStatus: 'unknown' | 'authenticated' | 'guest';
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
  setAuthStatus: (status: 'unknown' | 'authenticated' | 'guest') => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  loading: true,
  authStatus: 'unknown',
  setUser: user => set({ user, loading: false, authStatus: user ? 'authenticated' : 'guest' }),
  clearUser: () => set({ user: null, authStatus: 'guest', loading: false }),
  setLoading: loading => set({ loading }),
  setAuthStatus: authStatus => set({ authStatus }),
}));
