import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { fail, found, inr, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

/*
 * Room bookings and hall bookings share one flow (list, view, create, edit,
 * change status, take payment, delete). Each kind only describes its own
 * table, fields, validation and clash rule.
 */

const SLOT_NAMES = { morning: 'morning', evening: 'evening', full: 'full day' };

const KINDS = {
  room: {
    table: 'room_bookings',
    select: `SELECT b.*, r.number AS room_number, r.name AS room_name, u.name AS created_by_name
             FROM room_bookings b JOIN rooms r ON r.id = b.room_id LEFT JOIN users u ON u.id = b.created_by`,
    search: 'b.guest_name LIKE ? OR b.phone LIKE ?',
    range: 'b.check_in <= ? AND b.check_out >= ?',
    rangeArgs: (from, to) => [to, from],
    order: 'b.check_in DESC, b.id DESC',
    statuses: ['reserved', 'checked_in', 'checked_out', 'cancelled'],
    active: ['reserved', 'checked_in'],
    fields: ['room_id', 'guest_name', 'phone', 'id_proof', 'address', 'guests', 'check_in', 'check_out', 'rate', 'total', 'notes'],
    initialStatus: () => 'reserved',
    parse(b) {
      const d = {
        room_id: num(b.room_id), guest_name: str(b.guest_name), phone: str(b.phone), id_proof: str(b.id_proof),
        address: str(b.address), guests: Math.max(1, Math.round(num(b.guests, 1))), check_in: str(b.check_in),
        check_out: str(b.check_out), rate: num(b.rate), total: num(b.total), notes: str(b.notes),
      };
      if (!get('SELECT id FROM rooms WHERE id = ?', d.room_id)) fail('Please choose a room');
      if (!d.guest_name) fail('Guest name is required');
      if (!isDate(d.check_in) || !isDate(d.check_out)) fail('Check-in and check-out dates are required');
      if (d.check_out <= d.check_in) fail('Check-out must be after check-in');
      if (d.rate < 0 || d.total < 0) fail('Amounts cannot be negative');
      return d;
    },
    conflict(d, id) {
      const c = get(`SELECT guest_name, check_in, check_out FROM room_bookings
                     WHERE room_id = ? AND id <> ? AND status IN ('reserved','checked_in') AND check_in < ? AND check_out > ?`,
        d.room_id, id, d.check_out, d.check_in);
      return c && `Room is already booked for ${c.guest_name} (${c.check_in} → ${c.check_out})`;
    },
    label: b => `${b.guest_name} · ${b.check_in} → ${b.check_out}`,
  },
  hall: {
    table: 'hall_bookings',
    select: `SELECT b.*, h.name AS hall_name, u.name AS created_by_name
             FROM hall_bookings b JOIN halls h ON h.id = b.hall_id LEFT JOIN users u ON u.id = b.created_by`,
    search: 'b.customer_name LIKE ? OR b.phone LIKE ?',
    range: 'b.event_date BETWEEN ? AND ?',
    rangeArgs: (from, to) => [from, to],
    order: 'b.event_date DESC, b.id DESC',
    statuses: ['tentative', 'confirmed', 'completed', 'cancelled'],
    active: ['tentative', 'confirmed'],
    fields: ['hall_id', 'customer_name', 'phone', 'event_type', 'event_date', 'slot', 'guests', 'total', 'notes'],
    initialStatus: b => (b.status === 'tentative' ? 'tentative' : 'confirmed'),
    parse(b) {
      const d = {
        hall_id: num(b.hall_id), customer_name: str(b.customer_name), phone: str(b.phone), event_type: str(b.event_type),
        event_date: str(b.event_date), slot: SLOT_NAMES[b.slot] ? b.slot : 'full', guests: Math.max(0, Math.round(num(b.guests))),
        total: num(b.total), notes: str(b.notes),
      };
      if (!get('SELECT id FROM halls WHERE id = ?', d.hall_id)) fail('Please choose a hall');
      if (!d.customer_name) fail('Customer name is required');
      if (!isDate(d.event_date)) fail('Event date is required');
      if (d.total < 0) fail('Amount cannot be negative');
      return d;
    },
    conflict(d, id) {
      const c = get(`SELECT customer_name, slot FROM hall_bookings
                     WHERE hall_id = ? AND id <> ? AND event_date = ? AND status IN ('tentative','confirmed')
                     AND (slot = ? OR slot = 'full' OR ? = 'full')`,
        d.hall_id, id, d.event_date, d.slot, d.slot);
      return c && `Hall is already booked by ${c.customer_name} for the ${SLOT_NAMES[c.slot]} on that date`;
    },
    label: b => `${b.customer_name} · ${b.event_type || 'Event'} · ${b.event_date}`,
  },
};

/** Recalculate a booking's `paid` column from its payments. */
export const syncPaid = (kind, id) =>
  run(`UPDATE ${KINDS[kind].table} SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE kind = ? AND booking_id = ?) WHERE id = ?`,
    kind, id, id);

const addPayment = (kind, bookingId, amount, method, note, paidOn, userId) => {
  run('INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    kind, bookingId, amount, method || 'Cash', note, paidOn, userId);
  syncPaid(kind, bookingId);
};

function bookingRouter(kind) {
  const K = KINDS[kind];
  const r = Router();
  const load = id => found(get(`${K.select} WHERE b.id = ?`, id), 'Booking');

  r.get('/', (req, res) => {
    const where = [], args = [];
    const status = str(req.query.status), q = str(req.query.q), from = str(req.query.from), to = str(req.query.to);
    if (status === 'active') {
      where.push(`b.status IN (${K.active.map(() => '?').join(', ')})`);
      args.push(...K.active);
    } else if (K.statuses.includes(status)) {
      where.push('b.status = ?');
      args.push(status);
    }
    if (q) { where.push(`(${K.search})`); args.push(`%${q}%`, `%${q}%`); }
    if (isDate(from) && isDate(to)) { where.push(K.range); args.push(...K.rangeArgs(from, to)); }
    res.json(all(`${K.select} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${K.order}`, ...args));
  });

  r.get('/:id', (req, res) => {
    const b = load(req.params.id);
    const payments = all(`SELECT p.*, u.name AS created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by
                          WHERE p.kind = ? AND p.booking_id = ? ORDER BY p.paid_on, p.id`, kind, b.id);
    res.json({ ...b, payments });
  });

  r.post('/', (req, res) => {
    const d = K.parse(req.body);
    const clash = K.conflict(d, 0);
    if (clash) fail(clash, 409);
    const advance = num(req.body.advance);
    if (advance < 0) fail('Advance cannot be negative');
    const id = tx(() => {
      const cols = [...K.fields, 'status', 'created_by'];
      const { id } = run(`INSERT INTO ${K.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        ...K.fields.map(f => d[f]), K.initialStatus(req.body), req.user.id);
      if (advance > 0) addPayment(kind, id, advance, str(req.body.method), 'Advance', today(), req.user.id);
      return id;
    });
    log(req.user.id, `${kind} booking created`, K.label(d) + (advance > 0 ? ` · advance ${inr(advance)}` : ''));
    res.status(201).json(load(id));
  });

  r.put('/:id', (req, res) => {
    const old = load(req.params.id);
    const d = K.parse(req.body);
    if (K.active.includes(old.status)) {
      const clash = K.conflict(d, old.id);
      if (clash) fail(clash, 409);
    }
    run(`UPDATE ${K.table} SET ${K.fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`, ...K.fields.map(f => d[f]), old.id);
    log(req.user.id, `${kind} booking updated`, K.label(d));
    res.json(load(old.id));
  });

  r.patch('/:id/status', (req, res) => {
    const b = load(req.params.id);
    const status = str(req.body.status);
    if (!K.statuses.includes(status)) fail('Invalid status');
    if (K.active.includes(status) && !K.active.includes(b.status)) {
      const clash = K.conflict(b, b.id);
      if (clash) fail(clash, 409);
    }
    run(`UPDATE ${K.table} SET status = ? WHERE id = ?`, status, b.id);
    log(req.user.id, `${kind} booking ${status.replace('_', ' ')}`, K.label(b));
    res.json(load(b.id));
  });

  r.post('/:id/payments', (req, res) => {
    const b = load(req.params.id);
    if (b.status === 'cancelled') fail('This booking is cancelled');
    const amount = num(req.body.amount);
    if (amount <= 0) fail('Enter an amount greater than zero');
    const paidOn = isDate(req.body.paid_on) ? req.body.paid_on : today();
    tx(() => addPayment(kind, b.id, amount, str(req.body.method), str(req.body.note), paidOn, req.user.id));
    log(req.user.id, 'payment received', `${inr(amount)} (${str(req.body.method) || 'Cash'}) · ${K.label(b)}`);
    res.status(201).json(load(b.id));
  });

  r.delete('/:id', requireAdmin, (req, res) => {
    const b = load(req.params.id);
    tx(() => {
      run('DELETE FROM payments WHERE kind = ? AND booking_id = ?', kind, b.id);
      run(`DELETE FROM ${K.table} WHERE id = ?`, b.id);
    });
    log(req.user.id, `${kind} booking deleted`, K.label(b));
    res.json({ ok: true });
  });

  return r;
}

export const roomBookings = bookingRouter('room');
export const hallBookings = bookingRouter('hall');
