import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { IS_PRODUCTION } from './config.js';
import { SYNC_ON } from './mysql.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || join(ROOT, 'data');
mkdirSync(dataDir, { recursive: true });

// With MySQL configured, all data comes from MySQL: the working copy lives only in
// memory and is reloaded from MySQL on every start, so no old data is ever kept on disk.
// (SQLITE_MEMORY=1 also forces memory, for tools that only need the table layout.)
export const db = new DatabaseSync(SYNC_ON || process.env.SQLITE_MEMORY === '1' ? ':memory:' : join(dataDir, 'hotel.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export const secret = loadSecret();

/** The key that signs logins. Every server instance must use the same one. */
function loadSecret() {
  if (process.env.JWT_SECRET) {
    if (IS_PRODUCTION && process.env.JWT_SECRET.length < 32)
      console.warn('[auth] JWT_SECRET is short. Use at least 32 random characters.');
    return process.env.JWT_SECRET;
  }
  if (IS_PRODUCTION) console.warn('[auth] JWT_SECRET is not set: using a key file, so logins may reset on redeploy.');
  // Persist a random key so logins survive server restarts
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
