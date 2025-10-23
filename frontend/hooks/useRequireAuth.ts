/**
 * Hook to require authentication - redirects to login if not authenticated
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseRequireAuthResult {
  user: any;
  loading: boolean;
}

export function useRequireAuth(): UseRequireAuthResult {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    // This is a placeholder - you should implement proper auth check
    const checkAuth = async () => {
      try {
        setLoading(true);
        // Add your auth check logic here
        const isAuthenticated = true; // Placeholder

        if (!isAuthenticated) {
          navigate('/login');
        } else {
          setUser({ id: '1', email: 'user@example.com' }); // Placeholder
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  return { user, loading };
}
