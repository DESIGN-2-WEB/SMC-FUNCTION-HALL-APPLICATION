export const inr = n =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export const today = () => new Date().toLocaleDateString('en-CA');
/** The time now as "HH:MM" (24-hour), for time fields. */
export const nowTime = () => new Date().toTimeString().slice(0, 5);

export const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};

export const shiftMonth = (month, delta) => {
  const d = new Date(`${month}-01T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toLocaleDateString('en-CA').slice(0, 7);
};

/** Dates shown for a month calendar, Monday first, padded to whole weeks. */
export const monthGrid = month => {
  const first = new Date(`${month}-01T00:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const start = addDays(`${month}-01`, -offset);
  return Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => addDays(start, i));
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const nights = (a, b) =>
  a && b ? Math.max(0, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)) : 0;

export const fmtDate = (d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', opts) : '—';

export const fmtShort = d => fmtDate(d, { day: 'numeric', month: 'short' });

export const fmtDateTime = s =>
  s ? new Date(s.replace(' ', 'T')).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const fmtTime = s =>
  s ? new Date(s.replace(' ', 'T')).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';

export const fmtDurationWords = sec => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m > 1 ? 's' : ''}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h} hr${h > 1 ? 's' : ''} ${remM} min${remM > 1 ? 's' : ''}` : `${h} hr${h > 1 ? 's' : ''}`;
};

export const relDay = d => {
  const diff = nights(today(), d);
  if (d === today()) return 'Today';
  if (d === addDays(today(), 1)) return 'Tomorrow';
  if (d < today()) return fmtShort(d);
  return diff < 7 ? `In ${diff} days` : fmtShort(d);
};

export const initials = name => (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const ROOM_STATUS = {
  reserved: { label: 'Reserved', tone: 'blue' },
  checked_in: { label: 'Checked in', tone: 'green' },
  checked_out: { label: 'Checked out', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
};

export const HALL_STATUS = {
  tentative: { label: 'Tentative', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Completed', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
};

export const ROOM_STATE = {
  available: { label: 'Available', tone: 'green' },
  occupied: { label: 'Occupied', tone: 'rose' },
  arriving: { label: 'Reserved', tone: 'blue' },
  maintenance: { label: 'Maintenance', tone: 'amber' },
};

// A hall is booked for a full day or a half day. Morning/evening are only for older bookings.
export const SLOTS = { full: 'Full day', half: 'Half day' };
const OLD_SLOTS = { morning: 'Morning', evening: 'Evening' };
export const slotName = s => SLOTS[s] || OLD_SLOTS[s] || 'Full day';
/**
 * Hall hours for a slot (e.g. "7:00 AM to 3:00 PM"); empty for old slots. Each hall has its own
 * timings: pass the hall (full_time / half_time) or a hall booking (hall_full / hall_half).
 * The old Settings values are only a fallback.
 */
export const slotTime = (s, settings, hall) =>
  s === 'half' ? hall?.hall_half || hall?.half_time || settings?.hall_half_time || '7:00 AM to 3:00 PM'
    : !s || s === 'full' ? hall?.hall_full || hall?.full_time || settings?.hall_full_time || '7:00 AM to 3:00 AM (next day)'
      : '';
export const slotWithTime = (s, settings, hall) => {
  const t = slotTime(s, settings, hall);
  return t ? `${slotName(s)} (${t})` : slotName(s);
};
/** "12:00 PM" -> minutes after midnight (null if it can't be read). */
const toMinutes = t => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(String(t || '').trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (!m[3] && Number(m[1]) === 12) h = 12;
  if (m[3] && /p/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2] || 0);
};
/** True when a guest left after the room's check-out date and time. */
export const lateCheckout = (b, settings) => {
  if (!b?.checked_out_at || !b.check_out) return false;
  const [day, time = '00:00'] = String(b.checked_out_at).split(' ');
  if (day !== b.check_out) return day > b.check_out;
  const limit = toMinutes(roomTimes(settings, b).checkOut);
  const [h, mm] = time.split(':').map(Number);
  return limit != null && h * 60 + mm > limit;
};
/**
 * A room's check-in / check-out times. Pass the room (checkin_time / checkout_time) or a room
 * booking (room_checkin / room_checkout); the old Settings values are only a fallback.
 */
export const roomTimes = (settings, room) => ({
  checkIn: room?.room_checkin || room?.checkin_time || settings?.room_checkin_time || '11:00 AM',
  checkOut: room?.room_checkout || room?.checkout_time || settings?.room_checkout_time || '12:00 PM',
});
export const METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'];
export const EVENT_TYPES = [
  'Wedding',
  'Engagement',
  'Half Saree',
  'Birthday',
  'Meetings',
  'Reception',
  'Corporate',
  'Other',
];

/** What is still due on a booking. A hall or room inside a combo shows the whole combo's balance. */
export const bookingDue = b => (b.package_id
  ? (Number(b.combo_total) || 0) - (Number(b.combo_paid) || 0)
  : (Number(b.total) || 0) - (Number(b.paid) || 0));
