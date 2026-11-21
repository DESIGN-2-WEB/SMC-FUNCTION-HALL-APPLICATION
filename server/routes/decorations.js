import { Router } from 'express';
import { all, get, log, run, tx } from '../db.js';
import { fail, found, inr, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { setBillNo } from '../lib/billno.js';

/*
 * Decorations, planned area by area (stage, entrance, walkway...).
 *   /decorations/items  the price list: what we charge for each item, per area (admin edits)
 *   /decorations/plans  a costed plan for one event, optionally linked to a banquet booking
 * Amounts are always worked out here from quantity × rate, never taken from the request.
 */
const r = Router();
export default r;

const STATUSES = ['planned', 'done', 'cancelled'];
const MAX_LINES = 200;

/* ---------- Price list ---------- */

const parseItem = b => {
  const d = {
    area: str(b.area),
    name: str(b.name),
    unit: str(b.unit) || 'pcs',
    price: Math.max(0, num(b.price)),
  };
  if (!d.area) fail('Pick the area for this item');
  if (!d.name) fail('Item name is required');
  if (d.name.length > 120 || d.area.length > 60 || d.unit.length > 20) fail('Name, area or unit is too long');
  return d;
};

const sameItem = (d, id = 0) =>
  get('SELECT id FROM decor_items WHERE area = ? COLLATE NOCASE AND name = ? COLLATE NOCASE AND id <> ?', d.area, d.name, id);

r.get('/items', (req, res) => {
  res.json(all('SELECT * FROM decor_items ORDER BY area, name'));
});

r.post('/items', requireAdmin, (req, res) => {
  const d = parseItem(req.body);
  if (sameItem(d)) fail(`"${d.name}" is already in ${d.area}`);
  const { id } = run('INSERT INTO decor_items (area, name, unit, price) VALUES (?, ?, ?, ?)', d.area, d.name, d.unit, d.price);
  log(req.user.id, 'decoration item added', `${d.area}: ${d.name} ${inr(d.price)}`);
  res.status(201).json(get('SELECT * FROM decor_items WHERE id = ?', id));
});

r.put('/items/:id', requireAdmin, (req, res) => {
  const item = found(get('SELECT * FROM decor_items WHERE id = ?', req.params.id), 'Decoration item');
  const d = parseItem(req.body);
  if (sameItem(d, item.id)) fail(`"${d.name}" is already in ${d.area}`);
  run('UPDATE decor_items SET area = ?, name = ?, unit = ?, price = ? WHERE id = ?', d.area, d.name, d.unit, d.price, item.id);
  log(req.user.id, 'decoration item updated', `${d.area}: ${d.name} ${inr(d.price)}`);
  res.json(get('SELECT * FROM decor_items WHERE id = ?', item.id));
});

r.delete('/items/:id', requireAdmin, (req, res) => {
  const item = found(get('SELECT * FROM decor_items WHERE id = ?', req.params.id), 'Decoration item');
  run('DELETE FROM decor_items WHERE id = ?', item.id);
  log(req.user.id, 'decoration item deleted', `${item.area}: ${item.name}`);
  res.json({ ok: true });
});

/* ---------- Plans ---------- */

const round2 = n => Math.round(n * 100) / 100;

/** Clean up a plan's lines and work out every amount (also used when a combo is booked). */
export function parseDecorLines(raw, rawDiscount) {
  const lines = Array.isArray(raw) ? raw : [];
  if (lines.length > MAX_LINES) fail('Too many items in one plan');
  const items = lines
    .map(l => ({
      area: str(l?.area).slice(0, 60),
      name: str(l?.name).slice(0, 120),
      unit: (str(l?.unit) || 'pcs').slice(0, 20),
      qty: Math.max(0, num(l?.qty, 1)),
      rate: Math.max(0, num(l?.rate)),
    }))
    .filter(l => l.area && l.name)
    .map(l => ({ ...l, amount: round2(l.qty * l.rate) }));
  const subtotal = round2(items.reduce((s, l) => s + l.amount, 0));
  const discount = Math.min(subtotal, Math.max(0, num(rawDiscount)));
  return { items, subtotal, discount, total: round2(subtotal - discount) };
}

function parsePlan(b) {
  const { items, subtotal, discount, total } = parseDecorLines(b.items, b.discount);
  const d = {
    hall_booking_id: num(b.hall_booking_id) || null,
    customer_name: str(b.customer_name),
    phone: str(b.phone),
    event_name: str(b.event_name),
    event_date: str(b.event_date),
    items: JSON.stringify(items),
    subtotal,
    discount,
    total,
    notes: str(b.notes),
  };
  if (!d.customer_name) fail('Customer name is required');
  if (!isDate(d.event_date)) fail('Pick the event date');
  if (!items.length) fail('Add at least one decoration item');
  if (d.hall_booking_id && !get('SELECT id FROM hall_bookings WHERE id = ?', d.hall_booking_id)) fail('That banquet booking no longer exists');
  return d;
}

const PLAN_SQL = `
  SELECT p.*, u.name AS created_by_name, h.name AS hall_name, hb.bill_no AS hall_bill_no, pk.bill_no AS combo_bill_no
  FROM decor_plans p
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN event_packages pk ON pk.id = p.package_id
  LEFT JOIN hall_bookings hb ON hb.id = p.hall_booking_id
  LEFT JOIN halls h ON h.id = hb.hall_id`;

const withItems = p => p && { ...p, items: (() => { try { return JSON.parse(p.items) || []; } catch { return []; } })() };
const loadPlan = id => found(withItems(get(`${PLAN_SQL} WHERE p.id = ?`, id)), 'Decoration plan');

r.get('/plans', (req, res) => {
  res.json(all(`${PLAN_SQL} ORDER BY (p.status = 'planned') DESC, p.event_date DESC, p.id DESC LIMIT 300`).map(withItems));
});

r.get('/plans/:id', (req, res) => res.json(loadPlan(req.params.id)));

const COLS = ['hall_booking_id', 'customer_name', 'phone', 'event_name', 'event_date', 'items', 'subtotal', 'discount', 'total', 'notes'];

r.post('/plans', (req, res) => {
  const d = parsePlan(req.body);
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO decor_plans (${COLS.join(', ')}, created_by) VALUES (${COLS.map(() => '?').join(', ')}, ?)`,
      ...COLS.map(c => d[c]), req.user.id,
    );
    setBillNo('decor_plans', id);
    return id;
  });
  log(req.user.id, 'decoration planned', `${d.customer_name} · ${d.event_date} · ${inr(d.total)}`);
  res.status(201).json(loadPlan(id));
});

r.put('/plans/:id', (req, res) => {
  const plan = loadPlan(req.params.id);
  if (plan.status !== 'planned' && req.user.role !== 'admin') fail('Only the admin can change a finished or cancelled plan', 403);
  const d = parsePlan(req.body);
  run(`UPDATE decor_plans SET ${COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, ...COLS.map(c => d[c]), plan.id);
  log(req.user.id, 'decoration plan updated', `${d.customer_name} · ${d.event_date} · ${inr(d.total)}`);
  res.json(loadPlan(plan.id));
});

r.patch('/plans/:id/status', (req, res) => {
  const plan = loadPlan(req.params.id);
  const status = str(req.body?.status);
  if (!STATUSES.includes(status)) fail('Unknown status');
  if (plan.status !== 'planned' && req.user.role !== 'admin') fail('Only the admin can reopen a finished or cancelled plan', 403);
  run('UPDATE decor_plans SET status = ? WHERE id = ?', status, plan.id);
  log(req.user.id, `decoration plan ${status}`, `${plan.customer_name} · ${plan.event_date}`);
  res.json(loadPlan(plan.id));
});

r.delete('/plans/:id', requireAdmin, (req, res) => {
  const plan = loadPlan(req.params.id);
  run('DELETE FROM decor_plans WHERE id = ?', plan.id);
  log(req.user.id, 'decoration plan deleted', `${plan.customer_name} · ${plan.event_date}`);
  res.json({ ok: true });
});
