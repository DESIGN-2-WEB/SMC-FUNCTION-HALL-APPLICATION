import { useEffect, useRef, useState } from 'react';
import {
  Ban, BedDouble, CalendarCheck, CalendarPlus, CircleCheck, IndianRupee, LogIn, LogOut, MoreHorizontal, Pencil, Printer, Smartphone, Trash2, Zap,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import {
  HALL_STATUS, METHODS, ROOM_STATUS, addDays, esc, fmtDate, fmtDateTime, inr, nights, lateCheckout, roomTimes, slotName, slotWithTime, today,
} from '../utils.js';
import { Badge, Button, Field, Form, Input, Modal, PageLoader, cn, useUI } from './ui.jsx';
import { DatePicker, Select } from './pickers.jsx';
import WhatsAppModal, { WhatsAppIcon } from './WhatsAppModal.jsx';

export default function BookingDetail({ kind, id, onClose, onChanged, onEdit, onBookAnother }) {
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const { toast, confirm } = useUI();
  const { data: b, reload } = useApi(`/${kind}-bookings/${id}`);
  const [pay, setPay] = useState({ amount: '', method: 'Cash', note: '' });
  const [busy, setBusy] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);

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
  const times = roomTimes(settings);

  const info = isRoom
    ? [
        ['Room', b.room_name], ['Guests', b.guests],
        ['Check-in', `${fmtDate(b.check_in)} · ${times.checkIn}`], ['Check-out', `${fmtDate(b.check_out)} · ${times.checkOut}`],
        ['Stay', `${n} night${n === 1 ? '' : 's'} × ${inr(b.rate)}${Number(b.discount) > 0 ? ` (disc. −${inr(b.discount)})` : ''}`], ['Phone', b.phone || '—'],
        ['ID proof', (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span>{b.id_proof || '—'}</span>
            {b.id_photo_taken ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                <Smartphone size={12} className="shrink-0" /> Photo taken on mobile
              </span>
            ) : null}
          </span>
        )], ['Address', b.address || '—'],
        ...(b.checked_out_at ? [['Checked out at', (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {fmtDateTime(b.checked_out_at)}
            {lateCheckout(b, settings) && <Badge tone="amber">Late check-out</Badge>}
          </span>
        )]] : []),
      ]
    : [
        ['Hall', b.hall_name], ['Event', b.event_type || '—'],
        ['Date', fmtDate(b.event_date)], ['Slot', slotWithTime(b.slot, settings)],
        ['Expected guests', b.guests || '—'], ['Phone', b.phone || '—'],
      ];

  const actions = [];
  if (isRoom && b.status === 'reserved')
    actions.push(<Button key="in" variant="success" icon={LogIn} disabled={busy}
      onClick={() => setStatus('checked_in', 'Guest checked in', b.check_in > today() && { title: 'Early check-in?', message: `This booking starts on ${fmtDate(b.check_in)}. Check in now anyway?`, confirmText: 'Check in' })}>Check in</Button>);
  if (isRoom && b.status === 'checked_in')
    actions.push(<Button key="out" icon={LogOut} disabled={busy}
      onClick={() => setStatus('checked_out', 'Guest checked out', balance > 0 && { title: 'Balance pending', message: `${inr(balance)} is still due from ${b.guest_name}. Check out anyway?`, confirmText: 'Check out' })}>Check out</Button>);
  // Hall power & generator: from the event day until the event is completed (admin any time)
  const hasExtras = Number(b.power_amount) > 0 || Number(b.generator_amount) > 0;
  const eventDayReached = !isRoom && b.event_date <= today();
  const canAddExtras = !isRoom && b.status !== 'cancelled'
    && (isAdmin || (['tentative', 'confirmed'].includes(b.status) && eventDayReached));
  if (!isRoom && b.status === 'tentative')
    actions.push(<Button key="conf" variant="success" icon={CalendarCheck} disabled={busy} onClick={() => setStatus('confirmed', 'Booking confirmed')}>Confirm</Button>);
  if (!isRoom && b.status === 'confirmed')
    actions.push(<Button key="done" icon={CircleCheck} disabled={busy}
      onClick={() => setStatus('completed', 'Event marked completed', (balance > 0 || !hasExtras) && {
        title: 'Mark this event completed?',
        message: [
          !hasExtras && 'No power or generator bill has been added yet.',
          balance > 0 && `${inr(balance)} is still due.`,
          'Staff cannot change the bill after this.',
        ].filter(Boolean).join(' '),
        confirmText: 'Mark completed',
      })}>Mark completed</Button>);

  // Less-used actions sit in the "More" menu so the footer stays clear
  const openStay = isRoom && (b.status === 'reserved' || b.status === 'checked_in');
  const menu = [
    openStay && { icon: CalendarPlus, label: 'Extend stay', onClick: () => setExtending(true) },
    openStay && onBookAnother && { icon: BedDouble, label: 'Add room for guest', onClick: () => onBookAnother(b) },
    isAdmin && { icon: Pencil, label: 'Edit booking', onClick: () => onEdit(b) },
    !closed && { icon: Ban, label: 'Cancel booking', tone: 'rose', divider: true, onClick: () => setStatus('cancelled', 'Booking cancelled', { title: 'Cancel this booking?', message: 'The room/hall will become free for these dates. Payments already received stay on record.', danger: true, confirmText: 'Cancel booking' }) },
    isAdmin && { icon: Trash2, label: 'Delete booking', tone: 'rose', onClick: remove },
  ].filter(Boolean);

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={isRoom ? b.guest_name : b.customer_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone} dot>{meta.label}</Badge>
          <span>{b.bill_no && <>Bill <b className="text-ink-800">{b.bill_no}</b> · </>}#{b.id} · by {b.created_by_name || '—'} · {fmtDateTime(b.created_at)}</span>
        </span>
      }
      footer={
        <>
          {menu.length > 0 && <MoreMenu items={menu} disabled={busy} />}
          <Button variant="outline" icon={Printer} onClick={() => printReceipt(kind, b, settings)}>Receipt</Button>
          <Button
            variant="outline"
            icon={WhatsAppIcon}
            onClick={() => setWaOpen(true)}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-400 font-medium"
          >
            WhatsApp
          </Button>
          {actions}
        </>
      }
    >
      {waOpen && <WhatsAppModal kind={kind} booking={b} onClose={() => setWaOpen(false)} />}
      {extending && (
        <ExtendStayModal
          booking={b}
          onClose={() => setExtending(false)}
          onDone={async () => { setExtending(false); await reload(); onChanged?.(); }}
        />
      )}
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

      {!isRoom && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/60 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">Bill Breakdown</span>
            {canAddExtras && !chargesOpen ? (
              <Button size="sm" variant="outline" icon={Zap} onClick={() => setChargesOpen(true)}>
                {hasExtras ? 'Change power & generator' : 'Add power & generator'}
              </Button>
            ) : !chargesOpen && (
              <span className="text-xs font-medium text-stone-500">
                {b.status === 'cancelled' ? 'Rent + Power + Generator'
                  : b.status === 'completed' ? 'Final bill'
                    : `Power & generator can be added from ${fmtDate(b.event_date)}`}
              </span>
            )}
          </div>
          {chargesOpen && (
            <ExtraChargesForm
              booking={b}
              onCancel={() => setChargesOpen(false)}
              onDone={async () => { setChargesOpen(false); await reload(); onChanged?.(); }}
            />
          )}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-white p-2.5 border border-stone-200">
              <p className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Hall Rent</p>
              <p className="font-semibold text-ink-900 mt-0.5">{inr(b.rent || b.total)}</p>
              <p className="text-[11px] text-stone-400">{slotName(b.slot)}</p>
            </div>
            <div className="rounded-xl bg-white p-2.5 border border-stone-200">
              <p className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Power Bill</p>
              <p className="font-semibold text-ink-900 mt-0.5">{inr(b.power_amount)}</p>
              <p className="text-[11px] text-stone-500">
                {b.power_units ? `${b.power_units} units @ ₹${b.power_rate || 15}` : '0 units'}
                {b.power_end > b.power_start && <span className="block text-[10px] text-stone-400">({b.power_start} → {b.power_end})</span>}
              </p>
            </div>
            <div className="rounded-xl bg-white p-2.5 border border-stone-200">
              <p className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Generator</p>
              <p className="font-semibold text-ink-900 mt-0.5">{inr(b.generator_amount)}</p>
              <p className="text-[11px] text-stone-500">
                {b.generator_hours ? `${b.generator_hours} hrs` : '0 hrs'}
                {b.generator_type && <span className="block text-[10px] text-stone-400">({b.generator_type})</span>}
              </p>
            </div>
          </div>
        </div>
      )}

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

/** "More" button that opens a small list of actions above it. */
function MoreMenu({ items, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative mr-auto">
      <Button variant="outline" icon={MoreHorizontal} disabled={disabled} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        More
      </Button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-56 animate-pop overflow-hidden rounded-2xl border border-stone-200 bg-white py-1.5 shadow-xl">
          {items.map(({ icon: Icon, label, onClick, tone, divider }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onClick(); }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition',
                divider && 'mt-1.5 border-t border-stone-100 pt-2.5',
                tone === 'rose' ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-800 hover:bg-stone-50',
              )}
            >
              <Icon size={16} className="shrink-0" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Power meter reading and generator hours for a hall booking, entered inside the booking panel
 * from the event day. Their charges are added to the hall bill; the server works out the
 * amounts from the booking's and Settings' rates.
 */
function ExtraChargesForm({ booking: b, onCancel, onDone }) {
  const { settings } = useSettings();
  const { toast } = useUI();
  const powerRate = Number(b.power_rate) || Number(settings.power_rate) || 15;
  let generators = [];
  try {
    generators = typeof settings.generators === 'string' ? JSON.parse(settings.generators) : settings.generators || [];
  } catch {
    generators = [];
  }
  if (!Array.isArray(generators)) generators = [];
  const [f, setF] = useState({
    power_start: b.power_start || '', power_end: b.power_end || '', power_units: b.power_units || '',
    generator_type: b.generator_type || '', generator_hours: b.generator_hours || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (k === 'power_start' || k === 'power_end') {
      const start = Number(next.power_start) || 0;
      const end = Number(next.power_end) || 0;
      next.power_units = next.power_end !== '' && end >= start ? end - start : '';
    }
    return next;
  });

  const listed = generators.find(g => g.name === f.generator_type);
  const genRate = Number(listed ? listed.rate : f.generator_type === b.generator_type ? b.generator_rate : 0) || 0;
  const powerAmount = Math.round((Number(f.power_units) || 0) * powerRate);
  const genAmount = f.generator_type ? Math.round((Number(f.generator_hours) || 0) * genRate) : 0;
  // The bill without any earlier power/generator charges (hall rent, or a custom amount)
  const base = (Number(b.total) || 0) - (Number(b.power_amount) || 0) - (Number(b.generator_amount) || 0);
  const newTotal = base + powerAmount + genAmount;
  const due = newTotal - (Number(b.paid) || 0);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/hall-bookings/${b.id}/extra-charges`, {
        method: 'POST',
        body: {
          power_start: Number(f.power_start) || 0,
          power_end: Number(f.power_end) || 0,
          power_units: Number(f.power_units) || 0,
          generator_type: f.generator_type,
          generator_hours: f.generator_type ? Number(f.generator_hours) || 0 : 0,
        },
      });
      toast(`Power & generator saved · bill now ${inr(newTotal)}`);
      await onDone();
    } catch (e) {
      toast(e.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Form onSubmit={submit} className="mb-3 space-y-3 rounded-xl border border-gold-300 bg-white p-3">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">Power bill · {inr(powerRate)}/unit</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start reading">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_start} onChange={e => set('power_start', e.target.value)} />
          </Field>
          <Field label="End reading">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_end} onChange={e => set('power_end', e.target.value)} />
          </Field>
          <Field label="Units used">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_units} onChange={e => set('power_units', e.target.value)} />
          </Field>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">Generator bill</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Generator">
            <Select
              value={f.generator_type}
              onChange={v => set('generator_type', v)}
              options={[{ value: '', label: 'Not used' }, ...generators.map(g => ({ value: g.name, label: `${g.name} (${inr(g.rate)}/hr)` }))]}
            />
          </Field>
          <Field label="Hours used">
            <Input type="number" min="0" step="0.5" placeholder="0" disabled={!f.generator_type} value={f.generator_hours} onChange={e => set('generator_hours', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <p className="text-xs text-stone-600">
          Power + generator <b className="text-gold-800">{inr(powerAmount + genAmount)}</b> · new bill <b className="text-ink-900">{inr(newTotal)}</b>
          {' · '}
          <span className={due > 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>
            {due > 0 ? `${inr(due)} to collect` : 'fully paid'}
          </span>
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" variant="gold" icon={Zap} loading={saving}>Save</Button>
        </div>
      </div>
    </Form>
  );
}

/** Push a room stay's check-out later; the extra nights are added to the bill. */
function ExtendStayModal({ booking: b, onClose, onDone }) {
  const { toast } = useUI();
  const [checkOut, setCheckOut] = useState(addDays(b.check_out, 1));
  const [rate, setRate] = useState(b.rate);
  const [saving, setSaving] = useState(false);
  const extraNights = Math.max(0, nights(b.check_out, checkOut));
  const extra = Math.round(extraNights * (Number(rate) || 0));
  const newTotal = (Number(b.total) || 0) + extra;
  const newDue = newTotal - (Number(b.paid) || 0);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/room-bookings/${b.id}/extend`, { method: 'POST', body: { check_out: checkOut, rate } });
      toast(`Stay extended to ${fmtDate(checkOut)}`);
      await onDone();
    } catch (e) {
      toast(e.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Extend stay"
      subtitle={`${b.guest_name} · ${b.room_name} · now till ${fmtDate(b.check_out)}`}
      onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button form="extend-form" type="submit" variant="gold" icon={CalendarPlus} loading={saving} disabled={!extraNights}>Extend stay</Button>
      </>}
    >
      <Form id="extend-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="New check-out"><DatePicker required value={checkOut} min={addDays(b.check_out, 1)} onChange={setCheckOut} /></Field>
        <Field label="Rate per night (₹)"><Input type="number" min="0" required value={rate} onChange={e => setRate(e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          {[
            ['Extra', `${extraNights} night${extraNights === 1 ? '' : 's'} · ${inr(extra)}`, 'text-gold-800'],
            ['New total', inr(newTotal), 'text-ink-900'],
            ['Balance after', inr(Math.max(0, newDue)), newDue > 0 ? 'text-rose-600' : 'text-emerald-700'],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-2xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{l}</p>
              <p className={cn('mt-1 text-sm font-semibold', c)}>{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500 sm:col-span-2">
          The extra amount is added to the bill. Take the payment in the Payments section after extending.
        </p>
      </Form>
    </Modal>
  );
}

function printReceipt(kind, b, settings) {
  const isRoom = kind === 'room';
  const propName = settings?.property_name || 'SMC Function Hall (A/C)';
  const bannerName = settings?.banner_name || '';
  const tagline = settings?.property_tagline || 'Kalyana Mandapam & Function Hall';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const facilities = settings?.facilities || '';

  const rows = isRoom
    ? [
        ['Room', b.room_name],
        ['Check-in', `${fmtDate(b.check_in)}, ${roomTimes(settings).checkIn}`],
        ['Check-out', `${fmtDate(b.check_out)}, ${roomTimes(settings).checkOut}`],
        ['Nights', nights(b.check_in, b.check_out)],
        ...(b.checked_out_at ? [['Checked out at', `${fmtDateTime(b.checked_out_at)}${lateCheckout(b, settings) ? ' (late check-out)' : ''}`]] : []),
        ['Rate', `${inr(b.rate)} / night`],
        ...(Number(b.discount) > 0 ? [['Discount', `-${inr(b.discount)}`]] : []),
        ['ID Proof', `${b.id_proof || '—'}${b.id_photo_taken ? ' (Mobile Photo Verified)' : ''}`],
        ['Guests', b.guests],
      ]
    : [
        ['Hall', `${b.hall_name} (${slotWithTime(b.slot, settings)})`],
        ['Event', b.event_type || '—'],
        ['Date', fmtDate(b.event_date)],
        ['Expected guests', b.guests || '—'],
        ['Base Hall Rent', inr(b.rent || b.total)],
        ...(b.power_amount > 0 || b.power_units > 0 ? [['Power Bill', `${inr(b.power_amount)} (${b.power_units} units @ ₹${b.power_rate || settings?.power_rate || 15}/unit${b.power_end > b.power_start ? ` [Meter: ${b.power_start} → ${b.power_end}]` : ''})`]] : []),
        ...(b.generator_amount > 0 || b.generator_hours > 0 ? [['Generator Bill', `${inr(b.generator_amount)} (${b.generator_type || 'Generator'} · ${b.generator_hours} hrs @ ${inr(b.generator_rate)}/hr)`]] : []),
      ];
  const pays = b.payments.map(p => `<tr><td>${esc(fmtDate(p.paid_on))}</td><td>${esc(p.method)}${p.note ? ' · ' + esc(p.note) : ''}</td><td class="r">${esc(inr(p.amount))}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Bill ${esc(b.bill_no || '')} - ${esc(propName)}</title><style>
    body{font-family:Georgia,serif;color:#0e1a2b;max-width:660px;margin:30px auto;padding:0 24px}
    h1{margin:0;font-size:24px;color:#0e1a2b}.banner{font-size:12px;color:#a57837;font-weight:bold;margin-top:2px}
    .sub{color:#444;font-size:12px;margin-top:2px;font-family:Arial,sans-serif}
    .addr{color:#777;font-size:11px;margin-top:4px;font-family:Arial,sans-serif;line-height:1.4}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #d4ad5e;padding-bottom:16px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px}td,th{padding:7px 4px;border-bottom:1px solid #eee;text-align:left}
    th{font-size:11px;text-transform:uppercase;color:#888}.r{text-align:right}.tot td{font-weight:bold;border:none;font-size:14px}
    h3{font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;color:#888;margin:24px 0 8px}
    .foot{margin-top:40px;padding-top:16px;border-top:1px dashed #ddd;font-family:Arial,sans-serif;font-size:11px;color:#777;text-align:center;line-height:1.5}
  </style></head><body>
    <div class="head">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="/logo.jpg" style="height:62px;width:auto;border-radius:8px;object-fit:contain" alt="SMC Logo" />
        <div>
          <h1>${esc(propName)}</h1>
          ${bannerName ? `<div class="banner">Proprietor: ${esc(bannerName)}</div>` : ''}
          <div class="sub">${esc(tagline)}</div>
          <div class="addr">
            ${esc(address)}<br>
            Contact: ${esc(phone)} ${facilities ? `· Facilities: ${esc(facilities)}` : ''}
          </div>
        </div>
      </div>
      <div style="text-align:right;font-family:Arial,sans-serif;font-size:12px;white-space:nowrap">
        <b style="font-size:15px;color:#a57837">BILL NO: ${esc(b.bill_no || '—')}</b><br>
        Date: ${esc(fmtDate(today()))}
      </div>
    </div>
    <table><tr><td style="width:35%;color:#888">${isRoom ? 'Guest' : 'Customer'}</td><td><b>${esc(isRoom ? b.guest_name : b.customer_name)}</b></td></tr>
    <tr><td style="color:#888">Phone</td><td>${esc(b.phone || '—')}</td></tr>
    ${rows.map(([k, v]) => `<tr><td style="color:#888">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <h3>Payments</h3>
    <table><tr><th>Date</th><th>Method</th><th class="r">Amount</th></tr>${pays || '<tr><td colspan="3">No payments recorded</td></tr>'}
    <tr class="tot"><td></td><td class="r">Final Bill Total</td><td class="r">${esc(inr(b.total))}</td></tr>
    <tr class="tot"><td></td><td class="r" style="color:#059669">Paid</td><td class="r" style="color:#059669">${esc(inr(b.paid))}</td></tr>
    <tr class="tot"><td></td><td class="r" style="color:${b.total - b.paid > 0 ? '#dc2626' : '#6b7280'}">Balance Due</td><td class="r" style="color:${b.total - b.paid > 0 ? '#dc2626' : '#6b7280'}">${esc(inr(b.total - b.paid))}</td></tr></table>
    <div class="foot">
      Thank you for choosing ${esc(propName)}.<br>
      ${esc(address)} · Phone: ${esc(phone)}
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
