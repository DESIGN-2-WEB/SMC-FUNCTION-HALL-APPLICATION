import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || join(ROOT, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'hotel.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Persist the JWT secret so logins survive server restarts
const secretFile = join(dataDir, 'secret.key');
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(48).toString('hex'));
export const secret = process.env.JWT_SECRET || readFileSync(secretFile, 'utf8').trim();

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

export const today = () => new Date().toLocaleDateString('en-CA');
export const log = (userId, action, details = '') =>
  run('INSERT INTO activity (user_id, action, details) VALUES (?, ?, ?)', userId, action, details);
