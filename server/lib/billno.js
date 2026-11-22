import { randomInt } from 'node:crypto';
import { all, get, run } from '../db.js';

/*
 * Bill numbers printed on receipts, e.g. "SMC-7K4Q9-H". Discreet: it shows no date, no count
 * and no word, so a customer can't tell from it when it was made or how many bookings there are.
 * Staff read it like this:
 *   SMC     the hall's code
 *   7K4Q9   5 random characters, the bill's own code
 *   H       the last letter is the kind of bill: H hall, R room, C combined bill (a hall and its
 *           add-ons), S supplies, D decoration, M Sannai Melam
 * The random part comes from the system's secure random source and uses only letters and digits
 * that can't be mixed up when read out or typed (no 0/O, 1/I/L, U): 30 characters, so there are
 * about 24 million codes for each kind. Every new number is checked against all bills of every
 * kind and drawn again if it is already used, so no two bills ever have the same number.
 * Bills numbered before this format keep their number. The database id stays internal.
 */
const LETTER = { hall_bookings: 'H', room_bookings: 'R', event_packages: 'C', supply_rentals: 'S', decor_plans: 'D', band_bookings: 'M' };
const BILL_TABLES = Object.keys(LETTER);

const CODE = 'SMC';
const CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const C = '[2-9A-Z]';
// SQLite GLOB patterns of the numbers kept as they are: this format and the ones before it
const KEPT_FORMATS = [
  `${CODE}-${C}${C}${C}${C}${C}-[A-Z]`,
  `[A-Z]*-[0-9][0-9][0-9][0-9][0-9][0-9]-${C}${C}${C}`,
  `${CODE}-${C}${C}${C}${C}-${C}${C}${C}${C}`,
  `${CODE}-[A-Z]-[0-9][0-9]-[0-9][0-9][0-9][0-9]*`,
  `${CODE}-[0-9][0-9]-[A-Z]-[0-9][0-9][0-9][0-9]*`,
];
// Internal counters of the older, counted formats (no longer needed)
const COUNTERS = String.raw`SELECT key FROM settings WHERE key LIKE '\_bill%' ESCAPE '\'`;

const randomPart = n => Array.from({ length: n }, () => CHARS[randomInt(CHARS.length)]).join('');
const inUse = billNo => BILL_TABLES.some(t => get(`SELECT 1 FROM ${t} WHERE bill_no = ? LIMIT 1`, billNo));

/** A new bill number for a kind that no bill has. */
function nextBillNo(table) {
  for (;;) {
    const billNo = `${CODE}-${randomPart(5)}-${LETTER[table]}`;
    if (!inUse(billNo)) return billNo;
  }
}

/** Give a new row its bill number (or the one passed in, e.g. shared by a group of rentals). */
export function setBillNo(table, id, billNo = nextBillNo(table)) {
  run(`UPDATE ${table} SET bill_no = ? WHERE id = ?`, billNo, id);
  return billNo;
}

/** Number rows that have none yet, in the order they were made (rentals of one order share one). */
export function backfillBillNos() {
  // Only the very first, date-based numbers ("21-11-26-1R") mean renumber all, also when an old
  // backup is restored later. Numbers in this format or the ones before it are kept.
  const notKept = KEPT_FORMATS.map(() => 'bill_no NOT GLOB ?').join(' AND ');
  const oldFormat = BILL_TABLES.some(t => get(`SELECT 1 FROM ${t} WHERE bill_no <> '' AND ${notKept} LIMIT 1`, ...KEPT_FORMATS));
  if (oldFormat) for (const table of BILL_TABLES) run(`UPDATE ${table} SET bill_no = ''`);
  // Band Melam was renamed Sannai Melam: its older bills move from "B" to "M", keeping their numbers
  run("UPDATE band_bookings SET bill_no = 'SMC-M-' || substr(bill_no, 7) WHERE bill_no LIKE 'SMC-B-%'");
  for (const table of BILL_TABLES) {
    const grouped = table === 'supply_rentals';
    const rows = all(`SELECT id${grouped ? ', rental_group_id, package_id' : ''} FROM ${table}
                      WHERE bill_no IS NULL OR bill_no = '' ORDER BY created_at, id`);
    const shared = {};
    for (const r of rows) {
      const key = grouped && (r.rental_group_id || (r.package_id ? `pkg${r.package_id}` : null));
      if (key && shared[key]) { setBillNo(table, r.id, shared[key]); continue; }
      const billNo = setBillNo(table, r.id);
      if (key) shared[key] = billNo;
    }
  }
  for (const { key } of all(COUNTERS)) run('DELETE FROM settings WHERE key = ?', key);
}
