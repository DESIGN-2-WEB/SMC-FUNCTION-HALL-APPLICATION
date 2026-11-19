// Connection to the permanent MySQL database (GoDaddy Node.js Hosting's managed MySQL).
//
// The connection details are read from environment variables. GoDaddy provides them for the
// app's database; several common names are accepted so the exact naming doesn't matter:
//   DATABASE_URL or MYSQL_URL                 mysql://user:password@host:3306/database
//   or separately (any of these names):
//   host:      MYSQL_HOST, DB_HOST, DATABASE_HOST
//   port:      MYSQL_PORT, DB_PORT, DATABASE_PORT          (default 3306)
//   user:      MYSQL_USER, DB_USER, DB_USERNAME, DATABASE_USER, DATABASE_USERNAME
//   password:  MYSQL_PASSWORD, DB_PASSWORD, DATABASE_PASSWORD
//   database:  MYSQL_DATABASE, DB_NAME, DB_DATABASE, DATABASE_NAME
// Set MYSQL_SSL=true if the server requires TLS.
import './config.js'; // loads .env first
import mysql from 'mysql2/promise';

const pick = (...names) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
};

function readConfig() {
  const url = pick('DATABASE_URL', 'MYSQL_URL');
  if (url && /^mysql:\/\//i.test(url)) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    };
  }
  const host = pick('MYSQL_HOST', 'DB_HOST', 'DATABASE_HOST');
  const database = pick('MYSQL_DATABASE', 'DB_NAME', 'DB_DATABASE', 'DATABASE_NAME');
  if (!host || !database) return null;
  return {
    host,
    port: Number(pick('MYSQL_PORT', 'DB_PORT', 'DATABASE_PORT')) || 3306,
    user: pick('MYSQL_USER', 'DB_USER', 'DB_USERNAME', 'DATABASE_USER', 'DATABASE_USERNAME'),
    password: pick('MYSQL_PASSWORD', 'DB_PASSWORD', 'DATABASE_PASSWORD'),
    database,
  };
}

const cfg = readConfig();

/** True when a MySQL database is configured: it is then the permanent store. */
export const SYNC_ON = !!cfg && process.env.DB_SYNC !== 'off';

export const pool = SYNC_ON
  ? mysql.createPool({
      ...cfg,
      charset: 'utf8mb4', // Telugu item names and ₹ need full Unicode
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
      supportBigNumbers: true,
      ...(process.env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    })
  : null;

if (SYNC_ON) console.log(`[mysql] Using database "${cfg.database}" on ${cfg.host}:${cfg.port} as ${cfg.user}`);

export const q = id => `\`${String(id).replace(/`/g, '``')}\``;

/**
 * MySQL table definition mirroring a SQLite table. MySQL is a durable copy of the
 * app's tables: SQLite enforces the rules, so here only the primary key matters.
 * Values are stored exactly as the app writes them (dates and times as text).
 */
export function mysqlTableDDL(table, columns) {
  const col = c => {
    const t = String(c.type).toUpperCase();
    let type;
    if (c.pk) type = /INT/.test(t) ? 'BIGINT' : 'VARCHAR(191)';
    else if (/INT/.test(t)) type = 'BIGINT';
    else if (/REAL|FLOA|DOUB|NUM/.test(t)) type = 'DOUBLE';
    else type = 'LONGTEXT';
    return `${q(c.name)} ${type}${c.pk ? ' NOT NULL' : ' NULL'}`;
  };
  const pk = columns.find(c => c.pk);
  return `CREATE TABLE IF NOT EXISTS ${q(table)} (\n  ${columns.map(col).join(',\n  ')},\n  PRIMARY KEY (${q(pk.name)})\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

/** Create missing tables and add missing columns (never drops or changes anything). */
export async function ensureMysqlSchema(tables) {
  for (const [table, columns] of Object.entries(tables)) {
    await pool.query(mysqlTableDDL(table, columns));
    const [existing] = await pool.query(
      'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table],
    );
    const have = new Set(existing.map(r => r.name));
    for (const c of columns) {
      if (have.has(c.name)) continue;
      const line = mysqlTableDDL(table, [c, ...columns.filter(x => x.pk && x !== c)])
        .split('\n')[1].trim().replace(/,$/, '');
      await pool.query(`ALTER TABLE ${q(table)} ADD COLUMN ${line}`);
      console.log(`[mysql] Added column ${table}.${c.name}`);
    }
  }
}
