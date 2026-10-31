export const inr = n =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export const today = () => new Date().toLocaleDateString('en-CA');

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

export const SLOTS = { morning: 'Morning', evening: 'Evening', full: 'Full day' };
export const METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'];
export const EVENT_TYPES = ['Wedding', 'Reception', 'Engagement', 'Birthday', 'Corporate', 'Religious function', 'Meeting', 'Other'];
