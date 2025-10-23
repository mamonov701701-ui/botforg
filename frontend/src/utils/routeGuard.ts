import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function useRouteGuard() {
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();

  const requireAuth = (callback: () => void, nextPath?: string) => {
    if (user) {
      callback();
    } else {
      openAuth(nextPath);
    }
  };

  return { requireAuth };
}
