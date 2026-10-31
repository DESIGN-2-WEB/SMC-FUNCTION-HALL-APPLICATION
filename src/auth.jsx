import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('pk:logout', onLogout);
    if (getToken()) {
      api('/auth/me')
        .then(d => setUser(d.user))
        .catch(() => {})
        .finally(() => setReady(true));
    }
    return () => window.removeEventListener('pk:logout', onLogout);
  }, []);

  const login = async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    setUser(d.user);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
