// Keeps the local SQLite working copy in step with the Supabase (PostgreSQL) database.
//
// Supabase is the source of truth. The server loads every table from Supabase on start,
// SQLite triggers record each row the app inserts, updates or deletes, and those rows are
// pushed to Supabase before the API answers. If the push fails, the request fails and the
// local copy is reloaded from Supabase, so nothing is ever shown as "saved" when it isn't.
//
// A version marker (settings key `_data_version`) changes on every push, so other server
// instances (Vercel runs several) notice and reload before serving stale data.
import { db, tx } from './db.js';
import { SYNC_ON, supabase } from './supabase.js';

export { SYNC_ON };

// Parents before children, so inserts satisfy foreign keys (deletes run in reverse)
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
  ['user_sessions', 'id'],
  ['activity', 'id'],
];
const PK = Object.fromEntries(TABLES);

// Column types that differ between SQLite (all TEXT) and PostgreSQL
const TIMESTAMP_COLS = new Set(['created_at', 'login_time', 'last_active_at', 'logout_time']);
const DATE_COLS = new Set([
  'event_date', 'check_in_date', 'check_out_date', 'check_in', 'check_out',
  'paid_on', 'rent_date', 'expected_return_date', 'return_date',
]);

export const VERSION_KEY = '_data_version';
const PAGE = 1000;
const CHUNK = 500;
const READ_CHECK_MS = 3000;

const columns = {};
let localVersion = null;
let lastCheck = 0;
let stale = true;
const failures = [];

// One sync operation at a time (pushes and reloads must not interleave)
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

export const lastSeq = () =>
  SYNC_ON ? db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM _sync_log').get().s : 0;
export const isStale = () => stale;

const check = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const pad = n => String(n).padStart(2, '0');
const sqliteTime = d =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

/** Supabase value -> SQLite value */
function fromRemote(v, col) {
  if (v === null || v === undefined) {
    if (!col.notnull) return null;
    return /INT|REAL|NUM/i.test(col.type) ? 0 : '';
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  if (TIMESTAMP_COLS.has(col.name) && typeof v === 'string' && v.includes('T')) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return sqliteTime(d);
  }
  return v;
}

/** SQLite value -> Supabase value. Times are stored exactly as the app wrote them. */
function toRemote(v, name) {
  if (v === '' && (DATE_COLS.has(name) || TIMESTAMP_COLS.has(name))) return null;
  if (TIMESTAMP_COLS.has(name) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v))
    return `${v.replace(' ', 'T')}Z`;
  return v;
}

async function remoteVersion() {
  const data = check(
    await supabase.from('settings').select('value').eq('key', VERSION_KEY).maybeSingle(),
    'Reading data version',
  );
  return data?.value ?? null;
}

async function fetchAll(t, pk) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = check(
      await supabase.from(t).select('*').order(pk, { ascending: true }).range(from, from + PAGE - 1),
      `Loading ${t}`,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function pullInner() {
  if (lastSeq()) {
    try {
      await flushInner();
    } catch {
      // recorded in `failures`; the reload below restores the true state
    }
  }
  const version = await remoteVersion(); // read first: a write landing mid-load just triggers another reload
  const data = await Promise.all(TABLES.map(([t, pk]) => fetchAll(t, pk)));
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
      const rows = db
        .prepare(`SELECT * FROM ${t} WHERE ${pk} IN (${part.map(() => '?').join(', ')})`)
        .all(...part);
      for (const row of rows)
        out.push(Object.fromEntries(Object.entries(row).map(([c, v]) => [c, toRemote(v, c)])));
    }
    return out;
  };

  try {
    const before = await remoteVersion();
    for (const [t, pk] of TABLES) {
      // New rows use a plain insert: if another server already used that id, this fails
      // loudly instead of overwriting someone else's booking.
      const ins = inserts[t] ? readRows(t, inserts[t]) : [];
      for (let i = 0; i < ins.length; i += CHUNK)
        check(await supabase.from(t).insert(ins.slice(i, i + CHUNK)), `Saving ${t}`);
      const ups = upserts[t] ? readRows(t, upserts[t]) : [];
      for (let i = 0; i < ups.length; i += CHUNK)
        check(await supabase.from(t).upsert(ups.slice(i, i + CHUNK), { onConflict: pk }), `Saving ${t}`);
    }
    for (const [t, pk] of [...TABLES].reverse()) {
      const keys = deletes[t] || [];
      for (let i = 0; i < keys.length; i += CHUNK)
        check(await supabase.from(t).delete().in(pk, keys.slice(i, i + CHUNK)), `Deleting from ${t}`);
    }
    const version = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    check(
      await supabase.from('settings').upsert({ key: VERSION_KEY, value: version }, { onConflict: 'key' }),
      'Updating data version',
    );
    db.prepare('DELETE FROM _sync_log WHERE seq <= ?').run(to);
    // Someone else wrote between our last check and this push: reload to pick up their rows
    stale = before !== localVersion;
    localVersion = version;
    lastCheck = Date.now();
  } catch (err) {
    console.error('[sync] push to Supabase failed:', err.message);
    failures.push({ from, to, message: err.message });
    if (failures.length > 100) failures.shift();
    db.prepare('DELETE FROM _sync_log WHERE seq <= ?').run(to);
    stale = true;
    throw err;
  }
}

/** Loads everything from Supabase into the local copy. */
export const pullAll = () => (SYNC_ON ? locked(pullInner) : Promise.resolve());

/** Make sure the local copy matches Supabase before handling a request. */
export async function ensureFresh(isWrite) {
  if (!SYNC_ON) return;
  if (!stale && !isWrite && Date.now() - lastCheck < READ_CHECK_MS) return;
  await locked(async () => {
    if (stale) return pullInner();
    const v = await remoteVersion();
    lastCheck = Date.now();
    if (v !== localVersion) await pullInner();
  });
}

/** Push pending changes. Throws if any change numbered in (startSeq, endSeq] failed to save. */
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

/** Express middleware: fresh data in, changes saved to Supabase before the response goes out. */
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
      console.error('[sync] could not load from Supabase:', err.message);
      res.status(503).json({ error: 'Cannot reach the database right now. Check the internet connection and try again.' });
    });
}
