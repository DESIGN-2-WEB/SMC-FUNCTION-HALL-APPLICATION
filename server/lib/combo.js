import { all, get, run, today } from '../db.js';
import { setBillNo } from './billno.js';

/*
 * A combo (event_packages row) has one bill and one balance. Its money can sit in the payments
 * table in a few ways: the combo's own advance and payments (found by their note), and older
 * payments taken directly on the combo's hall or room bookings. All of them count towards the
 * combo, once each. event_packages.advance_paid is kept equal to that sum.
 */

/**
 * A note typed by hand must never look like the combo's own payment notes, or that payment
 * would be counted on a combo it doesn't belong to.
 */
export const safeNote = note => String(note || '').replace(/^\s*Package\s+(Advance|Payment)\s+for\s+#/i, 'Re: Package $1 #');

/** SQL condition (on payments, alias-free) for every payment that belongs to a combo, plus its arguments. */
export function comboPaymentsWhere(pkg) {
  const rooms = all('SELECT id FROM room_bookings WHERE package_id = ?', pkg.id).map(r => r.id);
  const sql = [
    "(kind = 'hall' AND (note LIKE ? OR note LIKE ? OR note = ?))",
    '(kind = \'hall\' AND booking_id > 0 AND booking_id = ?)',
    rooms.length ? `(kind = 'room' AND booking_id IN (${rooms.map(() => '?').join(', ')}))` : null,
  ].filter(Boolean).join(' OR ');
  const args = [
    `Package Advance for #${pkg.id} ·%`, `Package Payment for #${pkg.id} ·%`, `Package Payment for #${pkg.id}`,
    pkg.hall_booking_id || 0, ...rooms,
  ];
  return { sql: `(${sql})`, args };
}

/** Total received for a combo, from the payments themselves. */
export function comboPaid(pkg) {
  const w = comboPaymentsWhere(pkg);
  return get(`SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE ${w.sql}`, ...w.args).v;
}

/** Bring a combo's stored paid amount in line with its payments (writes only when it differs). */
export function syncComboPaid(pkgId) {
  const pkg = pkgId && get('SELECT id, hall_booking_id, advance_paid FROM event_packages WHERE id = ?', pkgId);
  if (!pkg) return;
  const paid = comboPaid(pkg);
  if (Math.abs((Number(pkg.advance_paid) || 0) - paid) > 0.001) run('UPDATE event_packages SET advance_paid = ? WHERE id = ?', paid, pkg.id);
}

/**
 * The combined bill of a hall booking. A plain hall booking becomes a combo, with the hall rent
 * as its first line (its earlier payments count towards it). Call inside a transaction.
 */
export function comboForHall(hb, userId) {
  if (hb.package_id) return hb.package_id;
  const hallAmount = Math.max(0, (Number(hb.total) || 0) - (Number(hb.power_amount) || 0) - (Number(hb.generator_amount) || 0));
  const next = new Date(`${hb.event_date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const { id } = run(`INSERT INTO event_packages (package_name, customer_name, phone, event_type, event_date, check_in_date, check_out_date, slot,
                        hall_booking_id, hall_amount, rooms_amount, supplies_amount, total_amount, advance_paid, payment_method, notes, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 'Cash', ?, ?)`,
    `${hb.customer_name}'s ${hb.event_type || 'Function'} Package`, hb.customer_name, hb.phone || '', hb.event_type || '', hb.event_date,
    hb.event_date, next.toISOString().slice(0, 10), hb.slot, hb.id, hallAmount, hallAmount, hb.notes || '', userId);
  setBillNo('event_packages', id);
  run('UPDATE hall_bookings SET package_id = ? WHERE id = ?', id, hb.id);
  return id;
}

/**
 * For Sannai Melam or decoration booked on its own page against a hall booking: the combined
 * bill it goes on (made if needed), or null when it has no hall booking or that booking is no
 * longer upcoming (then it keeps a bill of its own).
 */
export function hallBillFor(hallBookingId, userId) {
  const hb = hallBookingId && get('SELECT * FROM hall_bookings WHERE id = ?', hallBookingId);
  if (!hb || !['tentative', 'confirmed'].includes(hb.status)) return null;
  return comboForHall(hb, userId);
}

/**
 * Once at start: Sannai Melam and decoration booked against an upcoming hall booking before they
 * were put on hall bills are moved onto that hall's combined bill (with anything paid for them).
 */
export function attachLinkedExtras() {
  for (const t of ['band_bookings', 'decor_plans']) {
    const rows = all(`SELECT x.id, x.hall_booking_id, x.created_by FROM ${t} x JOIN hall_bookings hb ON hb.id = x.hall_booking_id
                      WHERE x.package_id IS NULL AND x.status NOT IN ('cancelled', 'done') AND hb.status IN ('tentative', 'confirmed')`);
    for (const x of rows) {
      const packageId = hallBillFor(x.hall_booking_id, x.created_by);
      if (!packageId) continue;
      run(`UPDATE ${t} SET package_id = ? WHERE id = ?`, packageId, x.id);
      if (t === 'band_bookings') {
        run("UPDATE payments SET kind = 'hall', booking_id = ?, note = ? WHERE kind = 'band' AND booking_id = ?",
          x.hall_booking_id, `Package Payment for #${packageId} · Sannai Melam (paid earlier)`, x.id);
        run("UPDATE band_bookings SET paid = 0 WHERE id = ?", x.id);
        run("UPDATE hall_bookings SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE kind = 'hall' AND booking_id = ?) WHERE id = ?",
          x.hall_booking_id, x.hall_booking_id);
      }
      syncComboPaid(packageId);
    }
  }
}

/** Money taken for something on a combined bill is a payment on that bill. */
export function addComboPayment(packageId, amount, method, label, userId) {
  const pkg = get('SELECT id, hall_booking_id FROM event_packages WHERE id = ?', packageId);
  run(`INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by) VALUES ('hall', ?, ?, ?, ?, ?, ?)`,
    pkg.hall_booking_id || 0, amount, method || 'Cash', `Package Payment for #${pkg.id} · ${label}`, today(), userId);
  if (pkg.hall_booking_id)
    run("UPDATE hall_bookings SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE kind = 'hall' AND booking_id = ?) WHERE id = ?",
      pkg.hall_booking_id, pkg.hall_booking_id);
  syncComboPaid(pkg.id);
}

/** The combo a payment row belongs to, if any. */
export function comboOfPayment(p) {
  const fromNote = p.kind === 'hall' && /^Package (?:Advance|Payment) for #(\d+)/.exec(p.note || '');
  if (fromNote) return Number(fromNote[1]);
  if (p.kind === 'hall' && p.booking_id) return get('SELECT package_id FROM hall_bookings WHERE id = ?', p.booking_id)?.package_id || null;
  if (p.kind === 'room' && p.booking_id) return get('SELECT package_id FROM room_bookings WHERE id = ?', p.booking_id)?.package_id || null;
  return null;
}

/** Once at start: fix combos whose stored paid amount missed payments taken on their hall or rooms. */
export function syncAllComboPaid() {
  for (const { id } of all('SELECT id FROM event_packages')) syncComboPaid(id);
}

/**
 * Decoration and Sannai Melam on a combo's bill (SQL, for a combo row aliased `alias`). They are
 * added up live, so editing them on their own pages changes the bill; cancelled ones don't count.
 */
export const addonsTotalSql = alias =>
  `(COALESCE((SELECT SUM(dp.total) FROM decor_plans dp WHERE dp.package_id = ${alias}.id AND dp.status <> 'cancelled'), 0)
    + COALESCE((SELECT SUM(bb.amount) FROM band_bookings bb WHERE bb.package_id = ${alias}.id AND bb.status <> 'cancelled'), 0))`;

/** Columns added to hall/room booking queries (alias b) so a combo's bookings show the combo's bill. */
export const COMBO_COLUMNS = `,
  pk.bill_no AS combo_bill_no, pk.status AS combo_status, pk.advance_paid AS combo_paid,
  pk.total_amount + COALESCE(ph.power_amount, 0) + COALESCE(ph.generator_amount, 0) + ${addonsTotalSql('pk')} AS combo_total`;
export const COMBO_JOINS = `
  LEFT JOIN event_packages pk ON pk.id = b.package_id
  LEFT JOIN hall_bookings ph ON ph.id = pk.hall_booking_id`;
