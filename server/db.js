import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { DEMO, ON_VERCEL } from './config.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Vercel functions can only write to /tmp, which is temporary — fine for the demo
const dataDir = process.env.DATA_DIR || (ON_VERCEL ? '/tmp/penta-kedarnath' : join(ROOT, 'data'));
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'hotel.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export const secret = loadSecret();

/** The key that signs logins. Every server instance must use the same one. */
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (ON_VERCEL) {
    const project = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'penta-kedarnath';
    return createHash('sha256').update(`penta-kedarnath:${project}`).digest('hex');
  }
  // Locally: persist a random key so logins survive server restarts
  const file = join(dataDir, 'secret.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString('hex'));
  return readFileSync(file, 'utf8').trim();
}

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => {
  const r = db.prepare(sql).run(...p);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};
export const tx = fn => {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

export const pruneActivity = () => {
  try {
    db.prepare("DELETE FROM activity WHERE created_at < datetime('now', 'localtime', '-7 days')").run();
  } catch (err) {
    console.error('Failed to prune old activity logs:', err.message);
  }
};

export const today = () => new Date().toLocaleDateString('en-CA');
export const log = (userId, action, details = '') => {
  pruneActivity();
  return run('INSERT INTO activity (user_id, action, details) VALUES (?, ?, ?)', userId, action, details);
};
