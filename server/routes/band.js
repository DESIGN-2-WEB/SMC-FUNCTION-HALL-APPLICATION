import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { fail, found, inr, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { setBillNo } from '../lib/billno.js';
import { addComboPayment, hallBillFor, safeNote, syncComboPaid } from '../lib/combo.js';

/*
 * Sannai Melam: a performance booked for an event. Like a supply it is booked for a function, but
 * there is no stock to count. Money taken goes into the payments table (kind 'band'), so it
 * shows on the Payments page and in the day's collections; `paid` is kept equal to their sum.
 */
const r = Router();
export default r;

const STATUSES = ['booked', 'done', 'cancelled'];
const METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'];

const SELECT = `
  SELECT b.*, u.name AS created_by_name, h.name AS hall_name, hb.bill_no AS hall_bill_no,
         hb.event_type AS hall_event_type, hb.slot AS hall_slot, pk.bill_no AS combo_bill_no
  FROM band_bookings b
  LEFT JOIN users u ON u.id = b.created_by
  LEFT JOIN hall_bookings hb ON hb.id = b.hall_booking_id
  LEFT JOIN halls h ON h.id = hb.hall_id
  LEFT JOIN event_packages pk ON pk.id = b.package_id`;

const load = id => {
  const b = found(get(`${SELECT} WHERE b.id = ?`, id), 'Sannai Melam booking');
  b.payments = all(`SELECT p.*, u.name AS created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by
                    WHERE p.kind = 'band' AND p.booking_id = ? ORDER BY p.paid_on, p.id`, b.id);
  return b;
};

export const syncBandPaid = id =>
  run("UPDATE band_bookings SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE kind = 'band' AND booking_id = ?) WHERE id = ?", id, id);

const addPayment = (id, amount, method, note, userId) => {
  run("INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by) VALUES ('band', ?, ?, ?, ?, ?, ?)",
    id, amount, METHODS.includes(method) ? method : 'Cash', note, today(), userId);
  syncBandPaid(id);
};

function parse(b) {
  const d = {
    hall_booking_id: num(b.hall_booking_id) || null,
    customer_name: str(b.customer_name).slice(0, 120),
    phone: str(b.phone).slice(0, 30),
    event_date: str(b.event_date),
    timing: str(b.timing).slice(0, 80),
    team: str(b.team).slice(0, 120),
    team_phone: str(b.team_phone).slice(0, 30),
    players: Math.max(0, Math.round(num(b.players))),
    amount: Math.max(0, Math.round(num(b.amount))), // the customer's price
    team_amount: Math.max(0, Math.round(num(b.team_amount))), // paid to the party
    notes: str(b.notes).slice(0, 500),
  };
  if (!d.customer_name) fail('Customer name is required');
  if (!isDate(d.event_date)) fail('Pick the event date');
  if (!d.amount) fail('Enter the price for the Sannai Melam');
  if (d.hall_booking_id && !get('SELECT id FROM hall_bookings WHERE id = ?', d.hall_booking_id)) fail('That banquet booking no longer exists');
  return d;
}
const COLS = ['hall_booking_id', 'customer_name', 'phone', 'event_date', 'timing', 'team', 'team_phone', 'players', 'amount', 'team_amount', 'notes'];

r.get('/', (req, res) => {
  res.json(all(`${SELECT} ORDER BY (b.status = 'booked') DESC, b.event_date DESC, b.id DESC LIMIT 300`));
});

r.get('/:id', (req, res) => res.json(load(req.params.id)));

r.post('/', (req, res) => {
  const d = parse(req.body);
  const advance = Math.min(d.amount, Math.max(0, Math.round(num(req.body.advance))));
  const id = tx(() => {
    // Booked for an upcoming hall booking: it goes on that hall's combined bill
    const packageId = hallBillFor(d.hall_booking_id, req.user.id);
    const { id } = run(`INSERT INTO band_bookings (${COLS.join(', ')}, package_id, created_by) VALUES (${COLS.map(() => '?').join(', ')}, ?, ?)`,
      ...COLS.map(c => d[c]), packageId, req.user.id);
    setBillNo('band_bookings', id);
    if (advance > 0) {
      if (packageId) addComboPayment(packageId, advance, str(req.body.method), 'Sannai Melam advance', req.user.id);
      else addPayment(id, advance, str(req.body.method), 'Advance', req.user.id);
    }
    return id;
  });
  log(req.user.id, 'sannai melam booked', `${d.customer_name} · ${d.event_date} · ${inr(d.amount)}${advance ? ` (adv ${inr(advance)})` : ''}`);
  res.status(201).json(load(id));
});

r.put('/:id', (req, res) => {
  const b = load(req.params.id);
  if (b.status !== 'booked' && req.user.role !== 'admin') fail('Only the admin can change a finished or cancelled booking', 403);
  const d = parse(req.body);
  if (b.package_id && Number(d.hall_booking_id || 0) !== Number(b.hall_booking_id || 0))
    fail(`This Sannai Melam is on combined bill ${b.combo_bill_no || ''}. Cancel it and book it again to move it.`.replace(' .', '.'));
  tx(() => {
    let packageId = b.package_id;
    // Newly linked to an upcoming hall booking: it moves onto that hall's combined bill, with
    // anything already paid for it
    if (!packageId && d.hall_booking_id) {
      packageId = hallBillFor(d.hall_booking_id, req.user.id);
      if (packageId) {
        const hallId = get('SELECT hall_booking_id FROM event_packages WHERE id = ?', packageId).hall_booking_id || 0;
        run(`UPDATE payments SET kind = 'hall', booking_id = ?, note = ? WHERE kind = 'band' AND booking_id = ?`,
          hallId, `Package Payment for #${packageId} · Sannai Melam (paid earlier)`, b.id);
        run("UPDATE hall_bookings SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE kind = 'hall' AND booking_id = ?) WHERE id = ?", hallId, hallId);
        syncBandPaid(b.id);
        syncComboPaid(packageId);
      }
    }
    run(`UPDATE band_bookings SET ${COLS.map(c => `${c} = ?`).join(', ')}, package_id = ? WHERE id = ?`, ...COLS.map(c => d[c]), packageId, b.id);
  });
  log(req.user.id, 'sannai melam updated', `${d.customer_name} · ${d.event_date} · ${inr(d.amount)}`);
  res.json(load(b.id));
});

r.patch('/:id/status', (req, res) => {
  const b = load(req.params.id);
  const status = str(req.body?.status);
  if (!STATUSES.includes(status)) fail('Unknown status');
  if (b.status !== 'booked' && req.user.role !== 'admin') fail('Only the admin can reopen a finished or cancelled booking', 403);
  // Like an event, the performance can only be marked done on its day or later
  if (status === 'done' && b.event_date > today()) fail('This performance can be marked done from its event day.');
  run('UPDATE band_bookings SET status = ? WHERE id = ?', status, b.id);
  log(req.user.id, `sannai melam ${status}`, `${b.customer_name} · ${b.event_date}`);
  res.json(load(b.id));
});

r.post('/:id/payments', (req, res) => {
  const b = load(req.params.id);
  if (b.status === 'cancelled') fail('This booking is cancelled');
  if (b.package_id) fail(`This Sannai Melam is on combined bill ${b.combo_bill_no || ''}. Take the payment there.`.replace(' .', '.'));
  const amount = Math.round(num(req.body.amount));
  if (amount <= 0) fail('Enter an amount greater than zero');
  if (amount > b.amount - b.paid) fail(`Only ${inr(Math.max(0, b.amount - b.paid))} is due`);
  tx(() => addPayment(b.id, amount, str(req.body.method), safeNote(str(req.body.note)).slice(0, 200), req.user.id));
  log(req.user.id, 'sannai melam payment', `${inr(amount)} · ${b.customer_name}`);
  res.status(201).json(load(b.id));
});

r.delete('/:id', requireAdmin, (req, res) => {
  const b = load(req.params.id);
  tx(() => {
    run("DELETE FROM payments WHERE kind = 'band' AND booking_id = ?", b.id);
    run('DELETE FROM band_bookings WHERE id = ?', b.id);
  });
  log(req.user.id, 'sannai melam deleted', `${b.bill_no} · ${b.customer_name} · ${b.event_date}`);
  res.json({ ok: true });
});
