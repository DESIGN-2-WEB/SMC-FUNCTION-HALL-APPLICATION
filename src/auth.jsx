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

  // Heartbeat ping to keep active session fresh while staff has app open
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      api('/auth/ping', { method: 'POST' }).catch(() => {});
    }, 60 * 1000); // every 60 seconds

    return () => clearInterval(interval);
  }, [user]);

  const login = async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    setUser(d.user);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors on logout
    } finally {
      setToken(null);
      setUser(null);
    }
  };
  const updateUser = nextUser => {
    setUser(prev => ({ ...prev, ...nextUser }));
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, updateUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
