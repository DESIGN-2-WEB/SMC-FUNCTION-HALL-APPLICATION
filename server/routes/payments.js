import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { found, inr, isDate } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { syncPaid } from './bookings.js';

const r = Router();
export default r;

r.get('/', (req, res) => {
  const t = today();
  const from = isDate(req.query.from) ? req.query.from : t.slice(0, 8) + '01';
  const to = isDate(req.query.to) ? req.query.to : t;
  res.json(all(
    `SELECT p.*, u.name AS created_by_name,
            COALESCE(rb.guest_name, hb.customer_name) AS party,
            COALESCE(rm.name, h.name) AS unit
     FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     LEFT JOIN room_bookings rb ON p.kind = 'room' AND rb.id = p.booking_id
     LEFT JOIN rooms rm ON rm.id = rb.room_id
     LEFT JOIN hall_bookings hb ON p.kind = 'hall' AND hb.id = p.booking_id
     LEFT JOIN halls h ON h.id = hb.hall_id
     WHERE p.paid_on BETWEEN ? AND ?
     ORDER BY p.paid_on DESC, p.id DESC`, from, to));
});

r.delete('/:id', requireAdmin, (req, res) => {
  const p = found(get('SELECT * FROM payments WHERE id = ?', req.params.id), 'Payment');
  tx(() => {
    run('DELETE FROM payments WHERE id = ?', p.id);
    syncPaid(p.kind, p.booking_id);
  });
  log(req.user.id, 'payment deleted', `${inr(p.amount)} · ${p.kind} booking #${p.booking_id}`);
  res.json({ ok: true });
});
