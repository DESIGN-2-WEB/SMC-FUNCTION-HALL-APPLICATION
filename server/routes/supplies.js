import { Router } from 'express';
import { all, get, log, run, tx } from '../db.js';
import { fail, found, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

const r = Router();
export default r;

const WITH_LOW = 'SELECT *, quantity <= min_quantity AS low FROM supplies';

const parse = b => {
  const d = {
    name: str(b.name), category: str(b.category) || 'General', unit: str(b.unit) || 'pcs',
    quantity: num(b.quantity), min_quantity: num(b.min_quantity), unit_cost: num(b.unit_cost),
  };
  if (!d.name) fail('Item name is required');
  if (d.quantity < 0 || d.min_quantity < 0 || d.unit_cost < 0) fail('Numbers cannot be negative');
  return d;
};
const load = id => found(get('SELECT * FROM supplies WHERE id = ?', id), 'Item');
const recordMove = (supplyId, type, qty, balance, note, userId) =>
  run('INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    supplyId, type, qty, balance, note, userId);

r.get('/', (req, res) => res.json(all(`${WITH_LOW} ORDER BY category, name`)));

r.get('/moves', (req, res) => {
  const id = num(req.query.supply_id);
  res.json(all(
    `SELECT m.*, s.name AS supply_name, s.unit, u.name AS created_by_name FROM stock_moves m
     JOIN supplies s ON s.id = m.supply_id LEFT JOIN users u ON u.id = m.created_by
     ${id ? 'WHERE m.supply_id = ?' : ''} ORDER BY m.id DESC LIMIT 300`, ...(id ? [id] : [])));
});

r.post('/', requireAdmin, (req, res) => {
  const d = parse(req.body);
  const id = tx(() => {
    const { id } = run('INSERT INTO supplies (name, category, unit, quantity, min_quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      d.name, d.category, d.unit, d.quantity, d.min_quantity, d.unit_cost);
    if (d.quantity > 0) recordMove(id, 'in', d.quantity, d.quantity, 'Opening stock', req.user.id);
    return id;
  });
  log(req.user.id, 'supply item added', `${d.name} · ${d.quantity} ${d.unit}`);
  res.status(201).json({ id });
});

r.put('/:id', requireAdmin, (req, res) => {
  const old = load(req.params.id);
  const d = parse(req.body);
  tx(() => {
    run('UPDATE supplies SET name = ?, category = ?, unit = ?, quantity = ?, min_quantity = ?, unit_cost = ? WHERE id = ?',
      d.name, d.category, d.unit, d.quantity, d.min_quantity, d.unit_cost, old.id);
    if (d.quantity !== old.quantity)
      recordMove(old.id, 'adjust', d.quantity - old.quantity, d.quantity, 'Stock corrected by admin', req.user.id);
  });
  log(req.user.id, 'supply item updated', d.name);
  res.json({ ok: true });
});

r.delete('/:id', requireAdmin, (req, res) => {
  const s = load(req.params.id);
  run('DELETE FROM supplies WHERE id = ?', s.id);
  log(req.user.id, 'supply item deleted', s.name);
  res.json({ ok: true });
});

r.post('/:id/move', (req, res) => {
  const s = load(req.params.id);
  const type = req.body.type === 'out' ? 'out' : 'in';
  const qty = num(req.body.quantity);
  const note = str(req.body.note);
  if (qty <= 0) fail('Enter a quantity greater than zero');
  if (type === 'out' && qty > s.quantity) fail(`Only ${s.quantity} ${s.unit} in stock`);
  const balance = type === 'in' ? s.quantity + qty : s.quantity - qty;
  tx(() => {
    run('UPDATE supplies SET quantity = ? WHERE id = ?', balance, s.id);
    recordMove(s.id, type, type === 'in' ? qty : -qty, balance, note, req.user.id);
  });
  log(req.user.id, type === 'in' ? 'stock received' : 'stock issued', `${s.name} · ${qty} ${s.unit}${note ? ' · ' + note : ''}`);
  res.json(get(`${WITH_LOW} WHERE id = ?`, s.id));
});
