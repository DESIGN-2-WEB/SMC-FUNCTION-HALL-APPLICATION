import { Router } from 'express';
import { all, get, log, run, today } from '../db.js';
import { fail, found, inr, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

const r = Router();
export default r;

const parse = b => {
  const is_combo = b.is_combo || b.isCombo ? 1 : 0;
  let included_hall_ids = '';
  if (Array.isArray(b.included_hall_ids)) {
    included_hall_ids = JSON.stringify(b.included_hall_ids.map(Number).filter(Boolean));
  } else if (typeof b.included_hall_ids === 'string') {
    included_hall_ids = b.included_hall_ids;
  }
  const d = {
    name: str(b.name), capacity: Math.max(1, num(b.capacity, 100)), rate_full: num(b.rate_full),
    rate_half: num(b.rate_half), description: str(b.description),
    is_combo, included_hall_ids,
  };
  if (!d.name) fail('Hall name is required');
  if (is_combo) {
    let ids = [];
    try { ids = JSON.parse(included_hall_ids || '[]'); } catch {}
    if (!Array.isArray(ids) || ids.length < 2) fail('Please select at least 2 halls for a combo package');
  }
  if (d.rate_full < 0 || d.rate_half < 0) fail('Rates cannot be negative');
  return d;
};
const load = id => found(get('SELECT * FROM halls WHERE id = ?', id), 'Hall');

r.get('/', (req, res) => {
  const t = today();
  const allHalls = all('SELECT * FROM halls ORDER BY is_combo DESC, capacity DESC');
  res.json(allHalls.map(h => {
    let included = [];
    if (h.is_combo && h.included_hall_ids) {
      try {
        const ids = JSON.parse(h.included_hall_ids);
        if (Array.isArray(ids) && ids.length) {
          included = all(`SELECT id, name, capacity, rate_full, rate_half FROM halls WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
        }
      } catch {}
    }
    return {
      ...h,
      included,
      today: all(`SELECT id, customer_name, event_type, slot, guests, status FROM hall_bookings
                  WHERE hall_id = ? AND event_date = ? AND status IN ('tentative','confirmed') ORDER BY slot`, h.id, t),
      next: get(`SELECT id, customer_name, event_type, event_date, slot FROM hall_bookings
                 WHERE hall_id = ? AND event_date > ? AND status IN ('tentative','confirmed') ORDER BY event_date LIMIT 1`, h.id, t) || null,
    };
  }));
});

r.post('/', requireAdmin, (req, res) => {
  const d = parse(req.body);
  const { id } = run('INSERT INTO halls (name, capacity, rate_full, rate_half, description, is_combo, included_hall_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
    d.name, d.capacity, d.rate_full, d.rate_half, d.description, d.is_combo, d.included_hall_ids);
  log(req.user.id, d.is_combo ? 'combo package added' : 'hall added', d.name);
  res.status(201).json({ id });
});

r.put('/:id', requireAdmin, (req, res) => {
  const hall = load(req.params.id);
  const d = parse(req.body);
  run('UPDATE halls SET name = ?, capacity = ?, rate_full = ?, rate_half = ?, description = ?, is_combo = ?, included_hall_ids = ? WHERE id = ?',
    d.name, d.capacity, d.rate_full, d.rate_half, d.description, d.is_combo, d.included_hall_ids, hall.id);
  log(req.user.id, d.is_combo ? 'combo package updated' : 'hall updated', `${d.name} · full ${inr(d.rate_full)} · half ${inr(d.rate_half)}`);
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
