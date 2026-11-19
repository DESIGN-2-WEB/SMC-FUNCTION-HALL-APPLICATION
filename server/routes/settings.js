import { Router } from 'express';
import { all, log, run, tx } from '../db.js';
import { DEFAULT_SETTINGS } from '../schema.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { SYNC_ON } from '../mysql.js';

const r = Router();
export default r;

export function getDBSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!row.key.startsWith('_')) s[row.key] = row.value; // `_` keys are internal (sync marker)
  }
  return s;
}

r.get('/', (req, res) => {
  res.json(getDBSettings());
});

// Quick check after a deploy: reaching this means the database loaded (the sync step runs first)
r.get('/health', (req, res) => {
  res.json({ ok: true, database: SYNC_ON ? 'mysql' : 'local file', time: new Date().toISOString() });
});

r.put('/', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  tx(() => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (body[key] !== undefined) {
        let val = body[key];
        if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(val).trim());
      }
    }
  });
  log(req.user.id, 'settings updated', 'Updated property info & extra charges');
  res.json(getDBSettings());
});
