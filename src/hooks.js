import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useUI } from './components/ui.jsx';

/** Fetch `path` on mount / when it changes. Keeps old data while reloading. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await api(path);
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
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
