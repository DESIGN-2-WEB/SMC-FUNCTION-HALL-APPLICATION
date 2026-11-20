const KEY = 'pk_token';
export const getToken = () => localStorage.getItem(KEY);
// Last answer for each page's data, so a page opened before shows at once while it refreshes.
// Kept in memory only, and emptied whenever the sign-in changes.
export const apiCache = new Map();
export const setToken = t => {
  apiCache.clear();
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('pk:logout'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  // Any change (save, payment, delete...) can affect other pages' lists: drop their saved copies
  if (method !== 'GET') apiCache.clear();
  return data;
}
