import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { fail, found, inr, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { getDBSettings } from './settings.js';

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
    fields: ['room_id', 'guest_name', 'phone', 'id_proof', 'id_photo_taken', 'address', 'guests', 'check_in', 'check_out', 'rate', 'discount', 'total', 'notes'],
    initialStatus: b => (b.status === 'checked_in' ? 'checked_in' : 'reserved'),
    parse(b) {
      const discount = Math.max(0, num(b.discount));
      const id_photo_taken = b.id_photo_taken ? 1 : 0;
      const d = {
        room_id: num(b.room_id), guest_name: str(b.guest_name), phone: str(b.phone), id_proof: str(b.id_proof),
        id_photo_taken,
        address: str(b.address), guests: Math.max(1, Math.round(num(b.guests, 1))), check_in: str(b.check_in),
        check_out: str(b.check_out), rate: num(b.rate), discount, total: num(b.total), notes: str(b.notes),
      };
      if (!get('SELECT id FROM rooms WHERE id = ?', d.room_id)) fail('Please choose a room');
      if (!d.guest_name) fail('Guest name is required');
      if (!d.phone) fail('Guest phone number is required');
      if (!d.id_proof) fail('ID proof number is required');
      if (!d.id_photo_taken) fail('Please confirm that ID photo has been taken');
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
    fields: [
      'hall_id', 'customer_name', 'phone', 'event_type', 'event_date', 'slot', 'guests',
      'rent', 'power_start', 'power_end', 'power_units', 'power_rate', 'power_amount',
      'generator_type', 'generator_hours', 'generator_rate', 'generator_amount',
      'total', 'notes'
    ],
    initialStatus: b => (b.status === 'tentative' ? 'tentative' : 'confirmed'),
    parse(b) {
      const rent = num(b.rent);
      const power_start = num(b.power_start);
      const power_end = num(b.power_end);
      let power_units = num(b.power_units);
      if (power_end > power_start && (!b.power_units || power_units === 0)) {
        power_units = Math.max(0, power_end - power_start);
      }
      const settings = getDBSettings();
      const defaultPowerRate = Number(settings.power_rate) || 15;
      const power_rate = b.power_rate !== undefined && b.power_rate !== '' ? num(b.power_rate) : defaultPowerRate;
      const power_amount = num(b.power_amount) || Math.round(power_units * power_rate);

      const generator_type = str(b.generator_type);
      const generator_hours = num(b.generator_hours);

      let generators = [];
      try {
        generators = typeof settings.generators === 'string' ? JSON.parse(settings.generators) : (settings.generators || []);
      } catch {
        generators = [];
      }
      if (!Array.isArray(generators) || generators.length === 0) {
        generators = [
          { name: '120 kVA', rate: Number(settings.gen_120kva_rate) || 1500 },
          { name: '30 kVA', rate: Number(settings.gen_30kva_rate) || 450 },
        ];
      }

      let defaultGenRate = 0;
      if (generator_type) {
        const found = generators.find(g => g.name && g.name.trim().toLowerCase() === generator_type.trim().toLowerCase());
        if (found) {
          defaultGenRate = Number(found.rate) || 0;
        } else if (generator_type.includes('120')) {
          defaultGenRate = Number(settings.gen_120kva_rate) || 1500;
        } else if (generator_type.includes('30')) {
          defaultGenRate = Number(settings.gen_30kva_rate) || 450;
        }
      }
      const generator_rate = b.generator_rate !== undefined && b.generator_rate !== '' ? num(b.generator_rate) : defaultGenRate;
      const generator_amount = num(b.generator_amount) || Math.round(generator_hours * generator_rate);

      let total = num(b.total);
      if (rent > 0 && (!b.total || total === 0 || b.auto_calc)) {
        total = rent + power_amount + generator_amount;
      }

      const d = {
        hall_id: num(b.hall_id), customer_name: str(b.customer_name), phone: str(b.phone), event_type: str(b.event_type),
        event_date: str(b.event_date), slot: SLOT_NAMES[b.slot] ? b.slot : 'full', guests: Math.max(0, Math.round(num(b.guests))),
        rent, power_start, power_end, power_units, power_rate, power_amount,
        generator_type, generator_hours, generator_rate, generator_amount,
        total: Math.max(0, total), notes: str(b.notes),
      };
      if (!get('SELECT id FROM halls WHERE id = ?', d.hall_id)) fail('Please choose a hall');
      if (!d.customer_name) fail('Customer name is required');
      if (!isDate(d.event_date)) fail('Event date is required');
      if (d.total < 0) fail('Amount cannot be negative');
      return d;
    },
    conflict(d, id) {
      const chosen = get('SELECT id, name, is_combo, included_hall_ids FROM halls WHERE id = ?', d.hall_id);
      if (!chosen) return null;

      let affectedIds = [chosen.id];
      if (chosen.is_combo || /combo/i.test(chosen.name)) {
        try {
          const parsed = JSON.parse(chosen.included_hall_ids || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) affectedIds = parsed;
        } catch {}
      }

      const allBookings = all(
        `SELECT b.id, b.customer_name, b.slot, b.hall_id, h.name AS hall_name, h.is_combo, h.included_hall_ids
         FROM hall_bookings b
         JOIN halls h ON h.id = b.hall_id
         WHERE b.id <> ? AND b.event_date = ? AND b.status IN ('tentative','confirmed')
         AND (b.slot = ? OR b.slot = 'full' OR ? = 'full')`,
        id, d.event_date, d.slot, d.slot
      );

      for (const b of allBookings) {
        let bookedAffected = [b.hall_id];
        if (b.is_combo || /combo/i.test(b.hall_name)) {
          try {
            const parsed = JSON.parse(b.included_hall_ids || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) bookedAffected = parsed;
          } catch {}
        }

        const overlap = affectedIds.some(aid => bookedAffected.includes(aid))
          || (chosen.is_combo && b.is_combo)
          || (chosen.is_combo && bookedAffected.includes(chosen.id))
          || (b.is_combo && affectedIds.includes(b.hall_id));

        if (overlap) {
          return `${b.hall_name || 'Hall'} is already booked by ${b.customer_name} for the ${SLOT_NAMES[b.slot]} on that date`;
        }
      }
      return null;
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
      if (advance > 0) addPayment(kind, id, advance, str(req.body.method), kind === 'room' ? (advance >= d.total ? 'Full Payment' : 'Advance') : 'Advance', today(), req.user.id);
      return id;
    });
    const payNote = advance > 0 ? (kind === 'room' ? (advance >= d.total ? ` · full payment ${inr(advance)}` : ` · advance ${inr(advance)}`) : ` · advance ${inr(advance)}`) : '';
    log(req.user.id, `${kind} booking created`, K.label(d) + payNote);
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
