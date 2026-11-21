// Keeps the local SQLite working copy in step with the permanent MySQL database.
//
// MySQL is the source of truth. The server loads every table from MySQL on start,
// SQLite triggers record each row the app inserts, updates or deletes, and those rows are
// written to MySQL in one transaction before the API answers. If that fails, the request
// fails and the local copy is reloaded from MySQL, so nothing is ever shown as "saved"
// when it isn't.
//
// A version marker (settings key `_data_version`) changes on every save, so another server
// process notices and reloads before serving old data.
import { db, tx } from './db.js';
import { SYNC_ON, ensureMysqlSchema, pool, q } from './mysql.js';

export { SYNC_ON };

// Parents before children (deletes run in reverse)
const TABLES = [
  ['users', 'id'],
  ['rooms', 'id'],
  ['halls', 'id'],
  ['supplies', 'id'],
  ['settings', 'key'],
  ['event_packages', 'id'],
  ['hall_bookings', 'id'],
  ['room_bookings', 'id'],
  ['payments', 'id'],
  ['stock_moves', 'id'],
  ['supply_rentals', 'id'],
  ['decor_items', 'id'],
  ['decor_plans', 'id'],
  ['band_bookings', 'id'],
  ['user_sessions', 'id'],
  ['activity', 'id'],
];
const PK = Object.fromEntries(TABLES);

export const VERSION_KEY = '_data_version';
const CHUNK = 500;
const READ_CHECK_MS = 3000; // re-check MySQL when the last check is older than this

const columns = {};
let schemaReady = false;
let localVersion = null;
let lastCheck = 0;
let stale = true;
const failures = [];

// One sync operation at a time (saves and reloads must not interleave)
let chain = Promise.resolve();
const locked = fn => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
};

export function installSyncTriggers() {
  for (const [t] of TABLES)
    for (const op of ['ins', 'upd', 'del']) db.exec(`DROP TRIGGER IF EXISTS _sync_${t}_${op}`);
  if (!SYNC_ON) {
    db.exec('DROP TABLE IF EXISTS _sync_log');
    return;
  }
  db.exec(`CREATE TABLE IF NOT EXISTS _sync_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, pk TEXT NOT NULL, op TEXT NOT NULL)`);
  for (const [t, pk] of TABLES) {
    columns[t] = db.prepare(`PRAGMA table_info(${t})`).all();
    db.exec(`
      CREATE TRIGGER _sync_${t}_ins AFTER INSERT ON ${t} BEGIN
        INSERT INTO _sync_log (tbl, pk, op) VALUES ('${t}', NEW.${pk}, 'i');
      END;
      CREATE TRIGGER _sync_${t}_upd AFTER UPDATE ON ${t} BEGIN
        INSERT INTO _sync_log (tbl, pk, op) SELECT '${t}', OLD.${pk}, 'd' WHERE OLD.${pk} IS NOT NEW.${pk};
        INSERT INTO _sync_log (tbl, pk, op)
          VALUES ('${t}', NEW.${pk}, CASE WHEN OLD.${pk} IS NOT NEW.${pk} THEN 'i' ELSE 'u' END);
      END;
      CREATE TRIGGER _sync_${t}_del AFTER DELETE ON ${t} BEGIN
        INSERT INTO _sync_log (tbl, pk, op) VALUES ('${t}', OLD.${pk}, 'd');
      END;
    `);
  }
}

/** Column lists of the synced tables (used to create the MySQL tables and the import file). */
export const syncedColumns = () => Object.fromEntries(TABLES.map(([t]) => [t, columns[t]]));

export const lastSeq = () =>
  SYNC_ON ? db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM _sync_log').get().s : 0;
export const isStale = () => stale;

/** MySQL value -> SQLite value */
function fromRemote(v, col) {
  if (v === null || v === undefined) {
    if (!col.notnull) return null;
    return /INT|REAL|NUM/i.test(col.type) ? 0 : '';
  }
  if (typeof v === 'bigint') return Number(v);
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return v;
}

const readVersion = async (conn, forUpdate = false) => {
  const [rows] = await conn.query(
    `SELECT value FROM settings WHERE ${q('key')} = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [VERSION_KEY],
  );
  return rows[0]?.value ?? null;
};

async function ensureSchema() {
  if (schemaReady) return;
  await ensureMysqlSchema(syncedColumns());
  schemaReady = true;
}

async function pullInner() {
  if (lastSeq()) {
    try {
      await flushInner();
    } catch {
      // recorded in `failures`; the reload below restores the true state
    }
  }
  await ensureSchema();
  const conn = await pool.getConnection();
  let version;
  const data = [];
  try {
    // One consistent snapshot: the version and every table as of the same moment
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    version = await readVersion(conn);
    for (const [t, pk] of TABLES) {
      const [rows] = await conn.query(`SELECT * FROM ${q(t)} ORDER BY ${q(pk)}`);
      data.push(rows);
    }
    await conn.query('COMMIT');
  } finally {
    conn.release();
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    tx(() => {
      for (const [t] of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
      TABLES.forEach(([t], i) => {
        const cols = columns[t];
        const stmt = db.prepare(
          `INSERT INTO ${t} (${cols.map(c => c.name).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        );
        for (const row of data[i]) stmt.run(...cols.map(c => fromRemote(row[c.name], c)));
      });
      db.exec('DELETE FROM _sync_log');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  localVersion = version;
  stale = false;
  lastCheck = Date.now();
}

async function flushInner() {
  const log = db.prepare('SELECT seq, tbl, pk, op FROM _sync_log ORDER BY seq').all();
  if (!log.length) return;
  const from = log[0].seq;
  const to = log.at(-1).seq;

  // Collapse to the net change per row
  const net = new Map();
  for (const e of log) {
    const k = `${e.tbl}\u0000${e.pk}`;
    const s = net.get(k);
    if (s) s.last = e.op;
    else net.set(k, { tbl: e.tbl, pk: e.pk, first: e.op, last: e.op });
  }
  const inserts = {};
  const upserts = {};
  const deletes = {};
  for (const s of net.values()) {
    const key = PK[s.tbl] === 'id' ? Number(s.pk) : s.pk;
    if (s.last === 'd') {
      if (s.first !== 'i') (deletes[s.tbl] ||= []).push(key);
    } else if (s.first === 'i' && PK[s.tbl] === 'id') {
      (inserts[s.tbl] ||= []).push(key);
    } else {
      (upserts[s.tbl] ||= []).push(key);
    }
  }

  const readRows = (t, keys) => {
    const pk = PK[t];
    const out = [];
    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = keys.slice(i, i + CHUNK);
      out.push(...db.prepare(`SELECT * FROM ${t} WHERE ${pk} IN (${part.map(() => '?').join(', ')})`).all(...part));
    }
    return out;
  };

  let conn;
  try {
    await ensureSchema();
    conn = await pool.getConnection();
    await conn.beginTransaction();
    // Lock the version row: saves from other processes wait their turn
    const before = await readVersion(conn, true);
    for (const [t, pk] of TABLES) {
      const names = columns[t].map(c => c.name);
      const colList = names.map(q).join(', ');
      const values = rows => rows.map(r => names.map(n => r[n]));
      // New rows use a plain insert: if another process already used that id, this fails
      // loudly instead of overwriting someone else's booking.
      const ins = inserts[t] ? readRows(t, inserts[t]) : [];
      for (let i = 0; i < ins.length; i += CHUNK)
        await conn.query(`INSERT INTO ${q(t)} (${colList}) VALUES ?`, [values(ins.slice(i, i + CHUNK))]);
      const ups = upserts[t] ? readRows(t, upserts[t]) : [];
      const update = names.filter(n => n !== pk).map(n => `${q(n)} = VALUES(${q(n)})`).join(', ');
      for (let i = 0; i < ups.length; i += CHUNK)
        await conn.query(
          `INSERT INTO ${q(t)} (${colList}) VALUES ? ON DUPLICATE KEY UPDATE ${update}`,
          [values(ups.slice(i, i + CHUNK))],
        );
    }
    for (const [t, pk] of [...TABLES].reverse()) {
      const keys = deletes[t] || [];
      for (let i = 0; i < keys.length; i += CHUNK)
        await conn.query(`DELETE FROM ${q(t)} WHERE ${q(pk)} IN (?)`, [keys.slice(i, i + CHUNK)]);
    }
    const version = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await conn.query(
      `INSERT INTO settings (${q('key')}, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [VERSION_KEY, version],
    );
    await conn.commit();
    db.prepare('DELETE FROM _sync_log WHERE seq <= ?').run(to);
    // Someone else saved between our last check and this save: reload to pick up their rows
    stale = before !== localVersion;
    localVersion = version;
    lastCheck = Date.now();
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('[sync] save to MySQL failed:', err.message);
    failures.push({ from, to, message: err.message });
    if (failures.length > 100) failures.shift();
    db.prepare('DELETE FROM _sync_log WHERE seq <= ?').run(to);
    stale = true;
    throw err;
  } finally {
    conn?.release();
  }
}

/** Loads everything from MySQL into the local copy. */
export const pullAll = () => (SYNC_ON ? locked(pullInner) : Promise.resolve());

// One check at a time: requests that arrive together (a page loads several) share it
let checking = null;
function checkRemote() {
  if (!checking) {
    checking = locked(async () => {
      if (stale) return pullInner();
      const v = await readVersion(pool);
      lastCheck = Date.now();
      if (v !== localVersion) await pullInner();
    }).finally(() => {
      checking = null;
    });
  }
  return checking;
}

/**
 * Keep the local copy in step with MySQL before handling a request:
 * - saves always check first;
 * - other requests check when the last check is over 3 seconds old.
 * Requests arriving together share a single check.
 */
export async function ensureFresh(isWrite) {
  if (!SYNC_ON) return;
  if (isWrite || stale || Date.now() - lastCheck >= READ_CHECK_MS) return checkRemote();
}

/** Save pending changes. Throws if any change numbered in (startSeq, endSeq] failed to save. */
export async function commit(startSeq, endSeq) {
  if (!SYNC_ON) return;
  await locked(async () => {
    try {
      await flushInner();
    } catch {
      // checked below
    }
  });
  const f = failures.find(x => x.to > startSeq && x.from <= endSeq);
  if (f) throw new Error(f.message);
}

/** Express middleware: fresh data in, changes saved to MySQL before the response goes out. */
export function syncMiddleware(req, res, next) {
  if (!SYNC_ON) return next();
  ensureFresh(req.method !== 'GET')
    .then(() => {
      const startSeq = lastSeq();
      const json = res.json.bind(res);
      res.json = body => {
        const endSeq = lastSeq();
        if (endSeq <= startSeq) return json(body);
        commit(startSeq, endSeq)
          .then(() => json(body))
          .catch(err => {
            res.status(503);
            json({ error: `Not saved to the database (${err.message}). Please try again.` });
          });
        return res;
      };
      next();
    })
    .catch(err => {
      console.error('[sync] could not load from MySQL:', err.message);
      res.status(503).json({ error: 'Cannot reach the database right now. Please try again in a moment.' });
    });
}
