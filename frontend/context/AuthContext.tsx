import React, { createContext, useContext, useState, useEffect } from "react";
import { register as apiRegister, login as apiLogin, getMe } from "@/api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line
  }, [token]);

  const fetchCurrentUser = async () => {
    setLoading(true);
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem("token");
    } finally {
      setLoading(false);
    }
  };

  const login = async (data) => {
    const res = await apiLogin(data);
    setToken(res.access_token);
    localStorage.setItem("token", res.access_token);
    setUser(res);
    return res;
  };

  const register = async (data) => {
    const res = await apiRegister(data);
    setToken(res.access_token);
    localStorage.setItem("token", res.access_token);
    setUser(res);
    return res;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, fetchCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 