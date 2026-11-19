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

// API keys and the webhook address (which can carry a token) never leave the server.
// The browser only learns whether each one is set: it gets SECRET_MASK instead of the value,
// and sending SECRET_MASK back on save keeps the stored value unchanged.
const SECRET_KEYS = ['whatsapp_api_token', 'whatsapp_twilio_sid', 'whatsapp_twilio_token', 'whatsapp_webhook_url'];
export const SECRET_MASK = '••••••••';
const forBrowser = s => {
  const out = { ...s };
  for (const k of SECRET_KEYS) out[k] = s[k] ? SECRET_MASK : '';
  return out;
};

r.get('/', (req, res) => {
  res.json(forBrowser(getDBSettings()));
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
        if (SECRET_KEYS.includes(key) && body[key] === SECRET_MASK) continue; // unchanged secret
        let val = body[key];
        if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(val).trim());
      }
    }
  });
  log(req.user.id, 'settings updated', 'Updated property info & extra charges');
  res.json(forBrowser(getDBSettings()));
});
