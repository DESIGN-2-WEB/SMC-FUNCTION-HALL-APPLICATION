import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, apiCache, sessionGeneration } from './api.js';
import { useUI } from './components/ui.jsx';

/**
 * Fetch `path` on mount / when it changes. A page opened before shows its last data at once
 * (from apiCache) and is refreshed in the background; `loading` is only true while there is
 * nothing to show yet.
 */
export function useApi(path) {
  const [state, setState] = useState(() => {
    const cached = apiCache.get(path);
    return { data: cached ?? null, loading: cached === undefined, error: null };
  });
  const load = useCallback(async () => {
    const cached = apiCache.get(path);
    setState(s => (cached !== undefined ? { data: cached, loading: false, error: null } : { ...s, loading: s.data == null }));
    const gen = sessionGeneration();
    try {
      const data = await api(path);
      if (gen !== sessionGeneration()) return; // signed out or in as someone else meanwhile
      apiCache.set(path, data);
      setState({ data, loading: false, error: null });
    } catch (e) {
      if (gen !== sessionGeneration()) return;
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/**
 * Ref for a <table className="table-stack">: copies each column's heading onto its cells, so
 * on a phone every value is shown under its name. Runs after each render (rows change).
 */
export function useCellLabels() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const heads = [...table.querySelectorAll(':scope > thead th')].map(th => th.textContent.trim());
    for (const tr of table.querySelectorAll(':scope > tbody > tr')) {
      [...tr.children].forEach((td, i) => td.setAttribute('data-label', heads[i] || ''));
    }
  });
  return ref;
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Save handler for create/edit forms: POSTs to `path` (or PUTs to `path/id` when
 * editing), shows a toast and calls `onSaved` with the response.
 */
export function useSave(path, id, label, onSaved) {
  const { toast } = useUI();
  const [saving, setSaving] = useState(false);
  const save = async body => {
    setSaving(true);
    try {
      const saved = await api(id ? `${path}/${id}` : path, { method: id ? 'PUT' : 'POST', body });
      toast(`${label} ${id ? 'updated' : 'added'}`);
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };
  return [saving, save];
}

/** Confirm, DELETE `path`, toast, then call `onDone`. */
export function useRemove() {
  const { toast, confirm } = useUI();
  return async (path, { title, message, done, success = 'Deleted' }) => {
    if (!(await confirm({ title, message, danger: true, confirmText: 'Delete' }))) return false;
    try {
      await api(path, { method: 'DELETE' });
      toast(success);
      done?.();
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    }
  };
}
