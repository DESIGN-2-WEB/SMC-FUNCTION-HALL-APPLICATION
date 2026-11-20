import express, { Router } from 'express';
import { all, db, log, run, tx } from '../db.js';
import { fail } from '../lib/http.js';
import { applyDefaults } from '../schema.js';

/*
 * Backup & restore (admin only).
 * GET  /api/backup          -> the app's data as one JSON file
 * POST /api/backup/restore  -> replace the app's data with such a file
 *
 * Restore wipes everything first, including bookings, payments, the activity log and every
 * sign-in, so all logins (also the admin doing the restore) must sign in again afterwards.
 * Activity and sign-in sessions are never part of a backup.
 */
const r = Router();
export default r;

// Parents before children: inserted in this order, deleted in reverse
const DATA_TABLES = [
  'users', 'rooms', 'halls', 'supplies', 'settings',
  'event_packages', 'hall_bookings', 'room_bookings', 'payments', 'stock_moves', 'supply_rentals',
];
const LOG_TABLES = ['activity', 'user_sessions'];
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const columnsOf = table => all(`PRAGMA table_info(${table})`).map(c => c.name);
const isInternalSetting = key => String(key).startsWith('_'); // e.g. the database sync marker

r.get('/', (req, res) => {
  const data = {};
  for (const t of DATA_TABLES) {
    data[t] = t === 'settings'
      ? all('SELECT key, value FROM settings').filter(s => !isInternalSetting(s.key))
      : all(`SELECT * FROM ${t}`);
  }
  log(req.user.id, 'backup downloaded', DATA_TABLES.map(t => `${t} ${data[t].length}`).join(' · '));
  res.json({ app: 'smc-function-hall', version: 1, created_at: new Date().toISOString(), data });
});

// Mounted behind requireAuth + requireAdmin, so only the admin's upload is ever read
r.post('/restore', express.json({ limit: '25mb' }), (req, res) => {
  const body = req.body || {};
  const data = body.data;
  if (body.app !== 'smc-function-hall' || body.version !== 1 || !data || typeof data !== 'object')
    fail('This is not a SMC Function Hall backup file');

  const rows = {};
  for (const t of DATA_TABLES) {
    const list = data[t] ?? [];
    if (!Array.isArray(list)) fail(`The backup's ${t} list is damaged`);
    rows[t] = list.filter(x => x && typeof x === 'object');
  }

  // Never lock everyone out: there must be a working admin login in the file
  const users = rows.users;
  if (!users.some(u => u.role === 'admin' && Number(u.active) === 1)) fail('The backup has no active admin login');
  for (const u of users) {
    if (!u.username || !BCRYPT.test(String(u.password_hash || ''))) fail(`The login "${u.username || '?'}" in the backup is damaged`);
    if (!['admin', 'staff'].includes(u.role)) fail(`The login "${u.username}" has an unknown role`);
  }

  const counts = {};
  // Rows go in table by table, so links between them are checked only once all are in
  // (same as the database sync); a broken file still rolls back as a whole
  db.exec('PRAGMA foreign_keys = OFF');
  try { tx(() => {
    for (const t of [...LOG_TABLES, ...[...DATA_TABLES].reverse()]) {
      if (t === 'settings') run("DELETE FROM settings WHERE substr(key, 1, 1) <> '_'");
      else run(`DELETE FROM ${t}`);
    }
    for (const t of DATA_TABLES) {
      const cols = columnsOf(t);
      let n = 0;
      for (const row of rows[t]) {
        if (t === 'settings' && isInternalSetting(row.key)) continue;
        const use = cols.filter(c => row[c] !== undefined);
        if (!use.length) continue;
        db.prepare(`INSERT INTO ${t} (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`)
          .run(...use.map(c => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c])));
        n++;
      }
      counts[t] = n;
    }
    applyDefaults(); // fill in settings added since the backup was made
  }); } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  log(null, 'data restored from backup',Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(' · '));
  res.json({ ok: true, counts });
});
