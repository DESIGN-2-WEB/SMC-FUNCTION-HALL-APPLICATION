import { Router } from 'express';
import { all, get, log, run, today } from '../db.js';
import { fail, found, inr, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

const r = Router();
export default r;

/** Every room with its live state: available / occupied / arriving / maintenance. */
export function roomsWithStatus() {
  const t = today();
  return all("SELECT * FROM rooms ORDER BY type = 'Suite' DESC, number").map(room => {
    const current = get(
      `SELECT id, guest_name, phone, check_in, check_out, status FROM room_bookings
       WHERE room_id = ? AND (status = 'checked_in' OR (status = 'reserved' AND check_in <= ? AND check_out > ?))
       ORDER BY status = 'checked_in' DESC LIMIT 1`, room.id, t, t);
    const next = get(
      `SELECT id, guest_name, check_in, check_out FROM room_bookings
       WHERE room_id = ? AND status = 'reserved' AND check_in > ? ORDER BY check_in LIMIT 1`, room.id, t);
    const state = room.maintenance ? 'maintenance'
      : current ? (current.status === 'checked_in' ? 'occupied' : 'arriving') : 'available';
    return { ...room, state, current: current || null, next: next || null };
  });
}

const parse = b => {
  const d = {
    number: str(b.number), name: str(b.name), type: str(b.type) || 'AC Room', rate: num(b.rate),
    capacity: Math.max(1, num(b.capacity, 2)), amenities: str(b.amenities), maintenance: b.maintenance ? 1 : 0,
  };
  if (!d.number || !d.name) fail('Room number and name are required');
  if (d.rate < 0) fail('Rate cannot be negative');
  return d;
};
const load = id => found(get('SELECT * FROM rooms WHERE id = ?', id), 'Room');

r.get('/', (req, res) => res.json(roomsWithStatus()));

r.post('/', requireAdmin, (req, res) => {
  const d = parse(req.body);
  const { id } = run('INSERT INTO rooms (number, name, type, rate, capacity, amenities, maintenance) VALUES (?, ?, ?, ?, ?, ?, ?)',
    d.number, d.name, d.type, d.rate, d.capacity, d.amenities, d.maintenance);
  log(req.user.id, 'room added', `${d.number} · ${d.name}`);
  res.status(201).json({ id });
});

r.put('/:id', requireAdmin, (req, res) => {
  const room = load(req.params.id);
  const d = parse(req.body);
  run('UPDATE rooms SET number = ?, name = ?, type = ?, rate = ?, capacity = ?, amenities = ?, maintenance = ? WHERE id = ?',
    d.number, d.name, d.type, d.rate, d.capacity, d.amenities, d.maintenance, room.id);
  log(req.user.id, 'room updated', `${d.number} · ${d.name} · ${inr(d.rate)}/night`);
  res.json({ ok: true });
});

r.delete('/:id', requireAdmin, (req, res) => {
  const room = load(req.params.id);
  if (get('SELECT id FROM room_bookings WHERE room_id = ? LIMIT 1', room.id))
    fail('This room has bookings. Delete those bookings first, or mark the room under maintenance instead.', 409);
  run('DELETE FROM rooms WHERE id = ?', room.id);
  log(req.user.id, 'room deleted', `${room.number} · ${room.name}`);
  res.json({ ok: true });
});
