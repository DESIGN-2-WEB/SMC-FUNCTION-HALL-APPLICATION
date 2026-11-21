import { all, get, run } from '../db.js';

/*
 * A combo (event_packages row) has one bill and one balance. Its money can sit in the payments
 * table in a few ways: the combo's own advance and payments (found by their note), and older
 * payments taken directly on the combo's hall or room bookings. All of them count towards the
 * combo, once each. event_packages.advance_paid is kept equal to that sum.
 */

/** SQL condition (on payments, alias-free) for every payment that belongs to a combo, plus its arguments. */
export function comboPaymentsWhere(pkg) {
  const rooms = all('SELECT id FROM room_bookings WHERE package_id = ?', pkg.id).map(r => r.id);
  const sql = [
    'note LIKE ?', 'note LIKE ?', 'note = ?',
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

/** The combo a payment row belongs to, if any. */
export function comboOfPayment(p) {
  const fromNote = /Package (?:Advance|Payment) for #(\d+)/.exec(p.note || '');
  if (fromNote) return Number(fromNote[1]);
  if (p.kind === 'hall' && p.booking_id) return get('SELECT package_id FROM hall_bookings WHERE id = ?', p.booking_id)?.package_id || null;
  if (p.kind === 'room' && p.booking_id) return get('SELECT package_id FROM room_bookings WHERE id = ?', p.booking_id)?.package_id || null;
  return null;
}

/** Once at start: fix combos whose stored paid amount missed payments taken on their hall or rooms. */
export function syncAllComboPaid() {
  for (const { id } of all('SELECT id FROM event_packages')) syncComboPaid(id);
}

/** Decoration on a combo's bill (SQL, for a combo row aliased `alias`); cancelled plans don't count. */
export const decorTotalSql = alias =>
  `COALESCE((SELECT SUM(dp.total) FROM decor_plans dp WHERE dp.package_id = ${alias}.id AND dp.status <> 'cancelled'), 0)`;

/** Columns added to hall/room booking queries (alias b) so a combo's bookings show the combo's bill. */
export const COMBO_COLUMNS = `,
  pk.bill_no AS combo_bill_no, pk.status AS combo_status, pk.advance_paid AS combo_paid,
  pk.total_amount + COALESCE(ph.power_amount, 0) + COALESCE(ph.generator_amount, 0) + ${decorTotalSql('pk')} AS combo_total`;
export const COMBO_JOINS = `
  LEFT JOIN event_packages pk ON pk.id = b.package_id
  LEFT JOIN hall_bookings ph ON ph.id = pk.hall_booking_id`;
