import { Router } from 'express';
import { all, get, today } from '../db.js';
import { roomsWithStatus } from './rooms.js';

const r = Router();
export default r;

const sum = (sql, ...p) => get(`SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE ${sql}`, ...p).v;

function lastSixMonths() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleDateString('en-CA').slice(0, 7);
    months.push({
      month: key,
      room: sum("kind = 'room' AND substr(paid_on, 1, 7) = ?", key),
      hall: sum("kind = 'hall' AND substr(paid_on, 1, 7) = ?", key),
    });
  }
  return months;
}

r.get('/dashboard', (req, res) => {
  const t = today();
  res.json({
    today: t,
    rooms: roomsWithStatus(),
    halls: all('SELECT id, name FROM halls ORDER BY capacity DESC').map(h => ({
      ...h,
      today: all(`SELECT id FROM hall_bookings WHERE hall_id = ? AND event_date = ? AND status IN ('tentative','confirmed')`, h.id, t),
    })),
    upcoming: all(`SELECT b.id, b.customer_name, b.event_type, b.event_date, b.slot, b.guests, b.status, b.total, b.paid, h.name AS hall_name
                   FROM hall_bookings b JOIN halls h ON h.id = b.hall_id
                   WHERE b.event_date >= ? AND b.status IN ('tentative','confirmed') ORDER BY b.event_date, b.slot LIMIT 6`, t),
    arrivals: all(`SELECT b.id, b.guest_name, b.check_in, r.name AS room_name FROM room_bookings b
                   JOIN rooms r ON r.id = b.room_id WHERE b.status = 'reserved' AND b.check_in <= ? AND b.check_out > ? ORDER BY b.check_in`, t, t),
    departures: all(`SELECT b.id, b.guest_name, b.check_out, b.total - b.paid AS balance, r.name AS room_name FROM room_bookings b
                     JOIN rooms r ON r.id = b.room_id WHERE b.status = 'checked_in' AND b.check_out <= ? ORDER BY b.check_out`, t),
    collectedToday: sum('paid_on = ?', t),
    collectedMonth: sum('substr(paid_on, 1, 7) = ?', t.slice(0, 7)),
    dues: get(`SELECT COALESCE(SUM(MAX(total - paid, 0)), 0) AS v FROM (
                 SELECT total, paid FROM room_bookings WHERE status <> 'cancelled'
                 UNION ALL SELECT total, paid FROM hall_bookings WHERE status <> 'cancelled')`).v,
    lowStock: all('SELECT * FROM supplies WHERE quantity <= min_quantity ORDER BY quantity * 1.0 / MAX(min_quantity, 1) LIMIT 8'),
    trend: lastSixMonths(),
    recent: req.user.role === 'admin'
      ? all('SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 8')
      : [],
  });
});

// Month view for the dashboard calendar heat map
r.get('/calendar', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const from = `${month}-01`, to = `${month}-31`;
  res.json({
    month,
    rooms: all("SELECT id, number, name FROM rooms ORDER BY type = 'Suite' DESC, number"),
    halls: all('SELECT id, name FROM halls ORDER BY capacity DESC'),
    hallBookings: all(`SELECT id, hall_id, customer_name, event_type, event_date, slot, status FROM hall_bookings
                       WHERE event_date BETWEEN ? AND ? AND status <> 'cancelled' ORDER BY event_date, slot`, from, to),
    roomBookings: all(`SELECT id, room_id, guest_name, check_in, check_out, status FROM room_bookings
                       WHERE check_in <= ? AND check_out > ? AND status <> 'cancelled' ORDER BY check_in`, to, from),
  });
});
