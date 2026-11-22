import { Router } from 'express';
import { all, log, run, tx } from '../db.js';
import { DEFAULT_SETTINGS } from '../schema.js';
import { requireAdmin, requireAuth, userOf } from '../middleware/auth.js';
import { SYNC_ON } from '../mysql.js';

const r = Router();
export default r;

export function getDBSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  // Only known settings: internal `_` keys (sync marker) and leftovers such as the removed
  // WhatsApp API keys are never returned, even before startup has cleared them from the database
  for (const row of rows) {
    if (Object.hasOwn(DEFAULT_SETTINGS, row.key)) s[row.key] = row.value;
  }
  return s;
}

// Settings the login page has no need for: only signed-in users get them. The Sannai Melam
// parties hold each party's phone and the internal party price (what the hall pays them).
const PRIVATE_SETTINGS = ['sannai_parties'];

// Public, so the login page can show the hall's name and logo before anyone signs in
r.get('/', (req, res) => {
  const s = getDBSettings();
  if (!userOf(req)) for (const key of PRIVATE_SETTINGS) delete s[key];
  res.json(s);
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
