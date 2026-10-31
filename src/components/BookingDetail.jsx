import { useState } from 'react';
import {
  Ban, CalendarCheck, CircleCheck, IndianRupee, LogIn, LogOut, Pencil, Printer, Trash2,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import {
  HALL_STATUS, METHODS, ROOM_STATUS, SLOTS, esc, fmtDate, fmtDateTime, inr, nights, today,
} from '../utils.js';
import { Badge, Button, Form, Input, Modal, PageLoader, cn, useUI } from './ui.jsx';
import { Select } from './pickers.jsx';

export default function BookingDetail({ kind, id, onClose, onChanged, onEdit }) {
  const { isAdmin } = useAuth();
  const { toast, confirm } = useUI();
  const { data: b, reload } = useApi(`/${kind}-bookings/${id}`);
  const [pay, setPay] = useState({ amount: '', method: 'Cash', note: '' });
  const [busy, setBusy] = useState(false);

  const run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      await reload();
      onChanged?.();
      return true;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (status, msg, ask) => {
    if (ask && !(await confirm(ask))) return;
    run(() => api(`/${kind}-bookings/${id}/status`, { method: 'PATCH', body: { status } }), msg);
  };
  const addPayment = async () => {
    const ok = await run(() => api(`/${kind}-bookings/${id}/payments`, { method: 'POST', body: pay }), 'Payment recorded');
    if (ok) setPay({ amount: '', method: pay.method, note: '' });
  };
  const removeRequest = useRemove();
  const remove = () => removeRequest(`/${kind}-bookings/${id}`, {
    title: 'Delete booking?',
    message: 'This permanently removes the booking and all its payments. This cannot be undone.',
    success: 'Booking deleted',
    done: () => { onChanged?.(); onClose(); },
  });

  if (!b) return <Modal title="Booking" onClose={onClose}><PageLoader /></Modal>;

  const isRoom = kind === 'room';
  const meta = (isRoom ? ROOM_STATUS : HALL_STATUS)[b.status];
  const balance = b.total - b.paid;
  const closed = ['cancelled', 'checked_out', 'completed'].includes(b.status);
  const n = isRoom ? nights(b.check_in, b.check_out) : 0;

  const info = isRoom
    ? [
        ['Room', b.room_name], ['Guests', b.guests],
        ['Check-in', fmtDate(b.check_in)], ['Check-out', fmtDate(b.check_out)],
        ['Stay', `${n} night${n === 1 ? '' : 's'} × ${inr(b.rate)}`], ['Phone', b.phone || '—'],
        ['ID proof', b.id_proof || '—'], ['Address', b.address || '—'],
      ]
    : [
        ['Hall', b.hall_name], ['Event', b.event_type || '—'],
        ['Date', fmtDate(b.event_date)], ['Slot', SLOTS[b.slot]],
        ['Expected guests', b.guests || '—'], ['Phone', b.phone || '—'],
      ];

  const actions = [];
  if (isRoom && b.status === 'reserved')
    actions.push(<Button key="in" variant="success" icon={LogIn} disabled={busy}
      onClick={() => setStatus('checked_in', 'Guest checked in', b.check_in > today() && { title: 'Early check-in?', message: `This booking starts on ${fmtDate(b.check_in)}. Check in now anyway?`, confirmText: 'Check in' })}>Check in</Button>);
  if (isRoom && b.status === 'checked_in')
    actions.push(<Button key="out" icon={LogOut} disabled={busy}
      onClick={() => setStatus('checked_out', 'Guest checked out', balance > 0 && { title: 'Balance pending', message: `${inr(balance)} is still due from ${b.guest_name}. Check out anyway?`, confirmText: 'Check out' })}>Check out</Button>);
  if (!isRoom && b.status === 'tentative')
    actions.push(<Button key="conf" variant="success" icon={CalendarCheck} disabled={busy} onClick={() => setStatus('confirmed', 'Booking confirmed')}>Confirm</Button>);
  if (!isRoom && b.status === 'confirmed')
    actions.push(<Button key="done" icon={CircleCheck} disabled={busy}
      onClick={() => setStatus('completed', 'Event marked completed', balance > 0 && { title: 'Balance pending', message: `${inr(balance)} is still due. Mark as completed anyway?`, confirmText: 'Mark completed' })}>Mark completed</Button>);

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={isRoom ? b.guest_name : b.customer_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone} dot>{meta.label}</Badge>
          <span>Booking #{b.id} · by {b.created_by_name || '—'} · {fmtDateTime(b.created_at)}</span>
        </span>
      }
      footer={
        <>
          {isAdmin && <Button variant="danger-soft" icon={Trash2} onClick={remove} className="mr-auto">Delete</Button>}
          {!closed && (
            <Button variant="ghost" icon={Ban} disabled={busy}
              onClick={() => setStatus('cancelled', 'Booking cancelled', { title: 'Cancel this booking?', message: 'The room/hall will become free for these dates. Payments already received stay on record.', danger: true, confirmText: 'Cancel booking' })}>
              Cancel booking
            </Button>
          )}
          <Button variant="outline" icon={Printer} onClick={() => printReceipt(kind, b)}>Receipt</Button>
          <Button variant="outline" icon={Pencil} onClick={() => onEdit(b)}>Edit</Button>
          {actions}
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Total', inr(b.total), 'text-ink-900'],
          ['Paid', inr(b.paid), 'text-emerald-600'],
          ['Balance', inr(balance), balance > 0 ? 'text-rose-600' : 'text-stone-400'],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl bg-stone-50 p-4">
            <p className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{l}</p>
            <p className={cn('mt-1 font-display text-xl font-semibold sm:text-2xl', c)}>{v}</p>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
        {info.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{k}</dt>
            <dd className="mt-0.5 text-sm text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      {b.notes && <p className="mt-4 rounded-xl bg-gold-50 px-4 py-3 text-sm text-gold-800">{b.notes}</p>}

      <h4 className="mt-6 mb-3 font-semibold text-ink-900">Payments</h4>
      {b.payments.length ? (
        <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
          {b.payments.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><IndianRupee size={16} /></div>
                <div>
                  <p className="text-sm font-medium">{p.method}{p.note ? ` · ${p.note}` : ''}</p>
                  <p className="text-xs text-stone-500">{fmtDate(p.paid_on)} · {p.created_by_name || '—'}</p>
                </div>
              </div>
              <p className="font-semibold text-emerald-700">{inr(p.amount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-5 text-center text-sm text-stone-400">No payments yet</p>
      )}

      {b.status !== 'cancelled' && (
        <Form onSubmit={addPayment} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <Input type="number" min="1" required placeholder={balance > 0 ? `Amount (due ${inr(balance)})` : 'Amount'} value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
          <Select value={pay.method} onChange={v => setPay({ ...pay, method: v })} options={METHODS} />
          <Input placeholder="Note (optional)" value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} />
          <Button type="submit" variant="gold" icon={IndianRupee} loading={busy}>Add</Button>
        </Form>
      )}
    </Modal>
  );
}

function printReceipt(kind, b) {
  const isRoom = kind === 'room';
  const rows = isRoom
    ? [['Room', b.room_name], ['Check-in', fmtDate(b.check_in)], ['Check-out', fmtDate(b.check_out)],
       ['Nights', nights(b.check_in, b.check_out)], ['Rate', `${inr(b.rate)} / night`], ['Guests', b.guests]]
    : [['Hall', b.hall_name], ['Event', b.event_type || '—'], ['Date', fmtDate(b.event_date)], ['Slot', SLOTS[b.slot]], ['Guests', b.guests || '—']];
  const pays = b.payments.map(p => `<tr><td>${esc(fmtDate(p.paid_on))}</td><td>${esc(p.method)}${p.note ? ' · ' + esc(p.note) : ''}</td><td class="r">${esc(inr(p.amount))}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Receipt #${b.id}</title><style>
    body{font-family:Georgia,serif;color:#0e1a2b;max-width:640px;margin:40px auto;padding:0 24px}
    h1{margin:0;font-size:28px}.sub{color:#a57837;letter-spacing:.2em;text-transform:uppercase;font-size:11px;margin-top:4px}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #d4ad5e;padding-bottom:16px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px}td,th{padding:8px 4px;border-bottom:1px solid #eee;text-align:left}
    th{font-size:11px;text-transform:uppercase;color:#888}.r{text-align:right}.tot td{font-weight:bold;border:none}
    h3{font-family:Arial,sans-serif;font-size:13px;text-transform:uppercase;color:#888;margin:28px 0 8px}
    .foot{margin-top:48px;font-family:Arial,sans-serif;font-size:12px;color:#888;text-align:center}
  </style></head><body>
    <div class="head"><div><h1>Penta Kedarnath</h1><div class="sub">Hotel & Function Hall</div></div>
    <div style="text-align:right;font-family:Arial,sans-serif;font-size:13px"><b>Receipt #${b.id}</b><br>${esc(fmtDate(today()))}</div></div>
    <table><tr><td style="width:40%;color:#888">${isRoom ? 'Guest' : 'Customer'}</td><td><b>${esc(isRoom ? b.guest_name : b.customer_name)}</b></td></tr>
    <tr><td style="color:#888">Phone</td><td>${esc(b.phone || '—')}</td></tr>
    ${rows.map(([k, v]) => `<tr><td style="color:#888">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <h3>Payments</h3>
    <table><tr><th>Date</th><th>Method</th><th class="r">Amount</th></tr>${pays || '<tr><td colspan="3">No payments</td></tr>'}
    <tr class="tot"><td></td><td class="r">Total</td><td class="r">${esc(inr(b.total))}</td></tr>
    <tr class="tot"><td></td><td class="r">Paid</td><td class="r">${esc(inr(b.paid))}</td></tr>
    <tr class="tot"><td></td><td class="r">Balance</td><td class="r">${esc(inr(b.total - b.paid))}</td></tr></table>
    <div class="foot">Thank you for choosing Penta Kedarnath.</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
