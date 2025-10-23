/**
 * Auth context for managing user authentication state
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  role: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetchUser = async () => {
    try {
      // Implement user fetching logic here
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    // Implement login logic here
    console.log('Login:', email, password);
  };

  const logout = async () => {
    // Implement logout logic here
    setUser(null);
  };

  useEffect(() => {
    refetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
