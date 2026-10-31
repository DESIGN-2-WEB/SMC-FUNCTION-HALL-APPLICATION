import { Router } from 'express';
import { all, get, log, run, today } from '../db.js';
import { fail, found, inr, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

const r = Router();
export default r;

const parse = b => {
  const d = {
    name: str(b.name), capacity: Math.max(1, num(b.capacity, 100)), rate_full: num(b.rate_full),
    rate_half: num(b.rate_half), description: str(b.description),
  };
  if (!d.name) fail('Hall name is required');
  if (d.rate_full < 0 || d.rate_half < 0) fail('Rates cannot be negative');
  return d;
};
const load = id => found(get('SELECT * FROM halls WHERE id = ?', id), 'Hall');

r.get('/', (req, res) => {
  const t = today();
  res.json(all('SELECT * FROM halls ORDER BY capacity DESC').map(h => ({
    ...h,
    today: all(`SELECT id, customer_name, event_type, slot, guests, status FROM hall_bookings
                WHERE hall_id = ? AND event_date = ? AND status IN ('tentative','confirmed') ORDER BY slot`, h.id, t),
    next: get(`SELECT id, customer_name, event_type, event_date, slot FROM hall_bookings
               WHERE hall_id = ? AND event_date > ? AND status IN ('tentative','confirmed') ORDER BY event_date LIMIT 1`, h.id, t) || null,
  })));
});

r.post('/', requireAdmin, (req, res) => {
  const d = parse(req.body);
  const { id } = run('INSERT INTO halls (name, capacity, rate_full, rate_half, description) VALUES (?, ?, ?, ?, ?)',
    d.name, d.capacity, d.rate_full, d.rate_half, d.description);
  log(req.user.id, 'hall added', d.name);
  res.status(201).json({ id });
});

r.put('/:id', requireAdmin, (req, res) => {
  const hall = load(req.params.id);
  const d = parse(req.body);
  run('UPDATE halls SET name = ?, capacity = ?, rate_full = ?, rate_half = ?, description = ? WHERE id = ?',
    d.name, d.capacity, d.rate_full, d.rate_half, d.description, hall.id);
  log(req.user.id, 'hall updated', `${d.name} · full ${inr(d.rate_full)} · half ${inr(d.rate_half)}`);
  res.json({ ok: true });
});

r.delete('/:id', requireAdmin, (req, res) => {
  const hall = load(req.params.id);
  if (get('SELECT id FROM hall_bookings WHERE hall_id = ? LIMIT 1', hall.id))
    fail('This hall has bookings. Delete those bookings first.', 409);
  run('DELETE FROM halls WHERE id = ?', hall.id);
  log(req.user.id, 'hall deleted', hall.name);
  res.json({ ok: true });
});
