import { all, get, run, today } from '../db.js';

/*
 * Bill numbers printed on receipts and WhatsApp messages, e.g. "20-11-26-1R":
 * the day the booking was made (DD-MM-YY), the count for that day, and the kind:
 * R room, H banquet hall, S supplies, C combo, D decoration. The database id stays internal.
 */
const LETTER = { room_bookings: 'R', hall_bookings: 'H', supply_rentals: 'S', event_packages: 'C', decor_plans: 'D' };
export const BILL_TABLES = Object.keys(LETTER);

const dayPrefix = ymd => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(2, 4)}`;

/**
 * The next bill number of a kind for a day (YYYY-MM-DD, default today). A counter per day and
 * kind is kept in settings (internal "_bill:" keys), so a number stays used even after its
 * booking is deleted: a bill already printed or sent is never given to someone else.
 */
export function nextBillNo(table, ymd = today()) {
  const p = dayPrefix(ymd);
  const key = `_bill:${p}:${LETTER[table]}`;
  const { n: highest } = get(
    `SELECT MAX(CAST(substr(bill_no, 10, length(bill_no) - 10) AS INTEGER)) AS n FROM ${table} WHERE bill_no LIKE ?`,
    `${p}-%`,
  );
  const counted = Number(get('SELECT value FROM settings WHERE key = ?', key)?.value) || 0;
  const n = Math.max(highest || 0, counted) + 1;
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(n));
  return `${p}-${n}${LETTER[table]}`;
}

/** Counters of past days are no longer needed: keep the last 3 days only. */
export function pruneBillCounters() {
  const keep = new Set([0, 1, 2].map(d => dayPrefix(new Date(Date.now() - d * 864e5).toLocaleDateString('en-CA'))));
  for (const { key } of all("SELECT key FROM settings WHERE key LIKE '\\_bill:%' ESCAPE '\\'")) {
    if (!keep.has(key.split(':')[1])) run('DELETE FROM settings WHERE key = ?', key);
  }
}

/** Give a new row its bill number (or the one passed in, e.g. shared by a group of rentals). */
export function setBillNo(table, id, billNo = nextBillNo(table)) {
  run(`UPDATE ${table} SET bill_no = ? WHERE id = ?`, billNo, id);
  return billNo;
}

/** Number rows that have none yet, in the order they were made (rentals of one order share one). */
export function backfillBillNos() {
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
