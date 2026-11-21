import { all, get, run, today } from '../db.js';

/*
 * Bill numbers printed on receipts and WhatsApp messages, e.g. "SMC-R-26-0001":
 * the hall code, the kind (R room, H banquet hall, S supplies, C combo, D decoration), the
 * year the booking was made (26 = 2026) and a running number for that kind in that year.
 * The number has no day or month in it, so it is never mistaken for a date. The database id
 * stays internal.
 */
const LETTER = { room_bookings: 'R', hall_bookings: 'H', supply_rentals: 'S', event_packages: 'C', decor_plans: 'D' };
export const BILL_TABLES = Object.keys(LETTER);

const CODE = 'SMC';
const PATTERN = `${CODE}-[A-Z]-[0-9][0-9]-[0-9][0-9][0-9][0-9]*`; // SQLite GLOB for this format
const yearOf = ymd => String(ymd).slice(2, 4);
const prefix = (table, yy) => `${CODE}-${LETTER[table]}-${yy}-`;

/**
 * The next bill number of a kind for a year (from YYYY-MM-DD, default today). A counter per
 * year and kind is kept in settings (internal "_bill:" keys), so a number stays used even after
 * its booking is deleted: a bill already printed or sent is never given to someone else.
 */
export function nextBillNo(table, ymd = today()) {
  const yy = yearOf(ymd);
  const p = prefix(table, yy);
  const key = `_bill:${yy}:${LETTER[table]}`;
  const { n: highest } = get(
    `SELECT MAX(CAST(substr(bill_no, ?) AS INTEGER)) AS n FROM ${table} WHERE bill_no LIKE ?`,
    p.length + 1, `${p}%`,
  );
  const counted = Number(get('SELECT value FROM settings WHERE key = ?', key)?.value) || 0;
  const n = Math.max(highest || 0, counted) + 1;
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(n));
  return `${p}${String(n).padStart(4, '0')}`;
}

/** Only this year's and last year's counters are needed (also clears counters of the old format). */
export function pruneBillCounters() {
  const yy = Number(yearOf(today()));
  const keep = new Set([yy, (yy + 99) % 100].map(y => String(y).padStart(2, '0')));
  for (const { key } of all("SELECT key FROM settings WHERE key LIKE '\\_bill:%' ESCAPE '\\'")) {
    if (!keep.has(key.split(':')[1])) run('DELETE FROM settings WHERE key = ?', key);
  }
}

/** Give a new row its bill number (or the one passed in, e.g. shared by a group of rentals). */
export function setBillNo(table, id, billNo = nextBillNo(table)) {
  run(`UPDATE ${table} SET bill_no = ? WHERE id = ?`, billNo, id);
  return billNo;
}

/**
 * Number rows that have none yet, in the order they were made (rentals of one order share one).
 * The first time this format is used, every older number (the date-based "21-11-26-1R" kind)
 * is cleared first, so all bills are renumbered in order from 0001.
 */
export function backfillBillNos() {
  // Also catches an older backup restored later: any number not in this format means renumber all
  const oldFormat = BILL_TABLES.some(t => get(`SELECT 1 FROM ${t} WHERE bill_no <> '' AND bill_no NOT GLOB ? LIMIT 1`, PATTERN));
  if (oldFormat) {
    for (const table of BILL_TABLES) run(`UPDATE ${table} SET bill_no = ''`);
    run("DELETE FROM settings WHERE key LIKE '\\_bill:%' ESCAPE '\\'");
  }
  for (const table of BILL_TABLES) {
    const grouped = table === 'supply_rentals';
    const rows = all(`SELECT id, created_at${grouped ? ', rental_group_id, package_id' : ''} FROM ${table}
                      WHERE bill_no IS NULL OR bill_no = '' ORDER BY created_at, id`);
    const shared = {};
    for (const r of rows) {
      const key = grouped && (r.rental_group_id || (r.package_id ? `pkg${r.package_id}` : null));
      if (key && shared[key]) { setBillNo(table, r.id, shared[key]); continue; }
      const ymd = /^\d{4}-\d{2}-\d{2}/.test(String(r.created_at)) ? String(r.created_at).slice(0, 10) : today();
      const billNo = setBillNo(table, r.id, nextBillNo(table, ymd));
      if (key) shared[key] = billNo;
    }
  }
  pruneBillCounters();
}
