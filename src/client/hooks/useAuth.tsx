import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, authApi } from '../api/client';

interface AuthContextType {
  token: string | null;
  username: string | null;
  role: string | null;
  isAdmin: boolean;
  login: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token');
  });
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('username');
  });
  const [role, setRole] = useState<string | null>(() => {
    return localStorage.getItem('role');
  });

  // 初始化时设置 axios header（页面刷新时）
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }
  }, []);

  const login = (newToken: string, newUsername: string) => {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUsername);
    // 立即设置 axios header，避免后续请求 401
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    setRole(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    // 立即清除 axios header
    delete api.defaults.headers.common['Authorization'];
  };

  // 设置 axios 默认 token
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      authApi.getMe()
        .then((res) => {
          const data = res.data.data;
          if (data?.username) {
            setUsername(data.username);
            localStorage.setItem('username', data.username);
          }
          if (data?.role) {
            setRole(data.role);
            localStorage.setItem('role', data.role);
          }
        })
        .catch(() => {});
    } else {
      delete api.defaults.headers.common['Authorization'];
      setRole(null);
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, username, role, isAdmin: role === 'admin', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
