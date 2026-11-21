import { useRef, useState } from 'react';
import { Download, FileUp, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { today } from '../utils.js';
import { Button, useUI } from './ui.jsx';

const LABELS = {
  users: 'Logins', rooms: 'Rooms', halls: 'Halls', supplies: 'Supplies', settings: 'Settings',
  event_packages: 'Combos', hall_bookings: 'Hall bookings', room_bookings: 'Room bookings',
  payments: 'Payments', stock_moves: 'Stock moves', supply_rentals: 'Supply rentals',
  decor_items: 'Decoration items', decor_plans: 'Decoration plans',
};

/** Admin: download all data as one file, or replace all data with such a file. */
export default function BackupRestore() {
  const { toast, confirm } = useUI();
  const fileRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [backup, setBackup] = useState(null); // { name, body }
  const [restoring, setRestoring] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const body = await api('/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `smc-backup-${today()}.json` });
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const pick = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const body = JSON.parse(await file.text());
      if (body?.app !== 'smc-function-hall' || !body.data) throw new Error('bad file');
      setBackup({ name: file.name, body });
    } catch {
      setBackup(null);
      toast('This is not a SMC Function Hall backup file', 'error');
    }
  };

  const restore = async () => {
    const ok = await confirm({
      title: 'Replace all data with this backup?',
      message: 'Everything in the app now (bookings, payments, supplies, logins, the activity log) is replaced by the backup. '
        + 'Everyone, including you, is signed out and must sign in with a login from the backup. This cannot be undone.',
      danger: true,
      confirmText: 'Replace all data',
    });
    if (!ok) return;
    setRestoring(true);
    try {
      await api('/backup/restore', { method: 'POST', body: backup.body });
      toast('Backup restored. Please sign in again.');
      setTimeout(() => window.location.assign('/'), 1500);
    } catch (e) {
      toast(e.message, 'error');
      setRestoring(false);
    }
  };

  const counts = backup ? Object.entries(backup.body.data).filter(([, v]) => Array.isArray(v)) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
        <div>
          <p className="text-sm font-semibold text-ink-900">Download a backup</p>
          <p className="text-xs text-stone-500">All bookings, payments, supplies, rooms, halls, settings and logins in one file. Keep it private.</p>
        </div>
        <Button type="button" variant="outline" icon={Download} loading={downloading} onClick={download}>Download backup</Button>
      </div>

      <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-900">Restore from a backup</p>
            <p className="text-xs text-stone-500">Replaces all data in the app with the backup file. Everyone signs in again afterwards.</p>
          </div>
          <Button type="button" variant="outline" icon={FileUp} onClick={() => fileRef.current?.click()}>Choose backup file</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={pick} />
        </div>
        {backup && (
          <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-600">
              <b className="text-ink-900">{backup.name}</b>
              {backup.body.created_at && <> · made {new Date(backup.body.created_at).toLocaleString('en-IN')}</>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {counts.map(([t, list]) => (
                <span key={t} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {LABELS[t] || t}: {list.length}
                </span>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setBackup(null)}>Cancel</Button>
              <Button type="button" size="sm" variant="danger-soft" icon={RotateCcw} loading={restoring} onClick={restore}>Restore this backup</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
