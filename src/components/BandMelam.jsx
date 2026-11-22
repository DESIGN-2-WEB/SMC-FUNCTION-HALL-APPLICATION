import { useState } from 'react';
import { Ban, CheckCircle2, Drum, IndianRupee, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove } from '../hooks.js';
import { Badge, Button, Card, EmptyState, Field, Form, Input, Modal, Segmented, Textarea, useUI } from './ui.jsx';
import { DatePicker, Select } from './pickers.jsx';
import { METHODS, fmtDate, inr, today } from '../utils.js';
import WhatsAppModal, { WhatsAppIcon } from './WhatsAppModal.jsx';

/*
 * Sannai Melam page (its own menu item): a performance booked for an event. It is booked like a
 * supply, but it is not an item, so there is no stock: just the date, timing, team and price.
 */

const STATUS = {
  booked: { label: 'Booked', tone: 'gold' },
  done: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'stone' },
};

export default function BandMelamTab({ isAdmin, hallBookings }) {
  const { toast, confirm } = useUI();
  const remove = useRemove();
  const list = useApi('/band');
  const [filter, setFilter] = useState('booked');
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [share, setShare] = useState(null);

  const rows = list.data || [];
  const shown = filter === 'booked' ? rows.filter(b => b.status === 'booked') : rows;
  const due = rows.filter(b => b.status !== 'cancelled' && !b.package_id).reduce((s, b) => s + Math.max(0, b.amount - b.paid), 0);

  const setStatus = async (b, status) => {
    const ask = { done: 'Mark this performance as done?', cancelled: 'Cancel this Sannai Melam booking?', booked: 'Reopen this booking?' };
    if (!(await confirm({ title: ask[status], message: `${b.customer_name} · ${fmtDate(b.event_date)}`, danger: status === 'cancelled', confirmText: 'Yes' }))) return;
    try {
      await api(`/band/${b.id}/status`, { method: 'PATCH', body: { status } });
      toast(status === 'done' ? 'Marked as done' : status === 'cancelled' ? 'Booking cancelled' : 'Booking reopened');
      list.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900">Sannai Melam</h3>
            <p className="text-xs text-stone-500">
              A performance for the event, not a stock item · {rows.filter(b => b.status === 'booked').length} booked · {inr(due)} due
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'booked', label: 'Booked' }, { value: 'all', label: 'All' }]} />
            <Button variant="gold" icon={Plus} onClick={() => setEditing({})}>Book Sannai Melam</Button>
          </div>
        </div>

        {!list.data ? (
          <p className="p-6 text-sm text-stone-500">Loading…</p>
        ) : shown.length ? (
          <div className="divide-y divide-stone-100">
            {shown.map(b => {
              const balance = Math.max(0, b.amount - b.paid);
              const eventDayReached = b.event_date <= today();
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{b.customer_name}</span>
                      <Badge tone={STATUS[b.status]?.tone}>{STATUS[b.status]?.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {fmtDate(b.event_date)}{b.timing ? ` · ${b.timing}` : ''}{b.team ? ` · ${b.team}` : ''}{b.team_phone ? ` (${b.team_phone})` : ''}
                      {Number(b.players) ? ` · ${b.players} players` : ''}{b.hall_name ? ` · ${b.hall_name}` : ''} · Bill {b.bill_no || '—'}
                      {b.combo_bill_no && <> · <b className="text-gold-800">on combined bill {b.combo_bill_no}</b></>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold text-ink-900">{inr(b.amount)}</p>
                    {b.package_id
                      ? <p className="text-[11px] text-gold-800">Paid on the hall bill</p>
                      : <p className={balance > 0 ? 'text-[11px] text-rose-600' : 'text-[11px] text-emerald-600'}>{balance > 0 ? `${inr(balance)} due` : 'Paid'}</p>}
                  </div>
                  <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                    {b.status !== 'cancelled' && balance > 0 && !b.package_id && (
                      <Button size="sm" variant="outline" icon={IndianRupee} onClick={() => setPaying(b)}>Payment</Button>
                    )}
                    {(b.status === 'booked' || isAdmin) && (
                      <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(b)}>Edit</Button>
                    )}
                    <Button size="sm" variant="outline" icon={WhatsAppIcon} onClick={() => setShare({ b, t: 'band' })}>Customer</Button>
                    {b.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" icon={WhatsAppIcon} onClick={() => setShare({ b, t: 'band_team' })}
                        title="Send the programme timing to the sannai team">Timing to team</Button>
                    )}
                    {b.status === 'booked' ? (
                      <>
                        {eventDayReached && <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => setStatus(b, 'done')}>Done</Button>}
                        <Button size="sm" variant="danger-soft" icon={Ban} onClick={() => setStatus(b, 'cancelled')} aria-label="Cancel booking" title="Cancel booking" />
                      </>
                    ) : isAdmin && (
                      <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setStatus(b, 'booked')}>Reopen</Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="danger-soft" icon={Trash2} aria-label="Delete booking" title="Delete booking"
                        onClick={() => remove(`/band/${b.id}`, {
                          title: 'Delete this Sannai Melam booking?',
                          message: `${b.customer_name} · ${fmtDate(b.event_date)}. Its payments are deleted too. This cannot be undone.`,
                          success: 'Booking deleted',
                          done: list.reload,
                        })} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Drum} title={filter === 'booked' ? 'No Sannai Melam booked' : 'No Sannai Melam bookings yet'}
            text="Book a Sannai Melam performance for a function: date, timing, team and price."
            action={<Button variant="gold" icon={Plus} onClick={() => setEditing({})}>Book Sannai Melam</Button>} />
        )}
      </Card>

      {editing && (
        <BandForm booking={editing} hallBookings={hallBookings} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload(); }} />
      )}
      {paying && <BandPayment booking={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); list.reload(); }} />}
      {share && <WhatsAppModal kind="band" booking={share.b} initialTemplate={share.t} onClose={() => setShare(null)} />}
    </>
  );
}

function BandForm({ booking, hallBookings, onClose, onSaved }) {
  const { toast } = useUI();
  const editing = !!booking.id;
  const [f, setF] = useState(() => ({
    hall_booking_id: booking.hall_booking_id || '',
    customer_name: booking.customer_name || '',
    phone: booking.phone || '',
    event_date: booking.event_date || today(),
    timing: booking.timing || '',
    team: booking.team || '',
    team_phone: booking.team_phone || '',
    players: booking.players || '',
    amount: booking.amount || '',
    notes: booking.notes || '',
    advance: '',
    method: 'Cash',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const linkBooking = id => {
    const b = hallBookings.find(x => String(x.id) === String(id));
    setF(p => ({ ...p, hall_booking_id: id, ...(b ? { customer_name: b.customer_name, phone: b.phone || '', event_date: b.event_date } : {}) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api(editing ? `/band/${booking.id}` : '/band', {
        method: editing ? 'PUT' : 'POST',
        body: { ...f, hall_booking_id: f.hall_booking_id || null, amount: Number(f.amount) || 0, players: Number(f.players) || 0, advance: Number(f.advance) || 0 },
      });
      toast(saved.combo_bill_no ? `${editing ? 'Updated' : 'Booked'} · on the hall's combined bill ${saved.combo_bill_no}` : editing ? 'Sannai Melam updated' : 'Sannai Melam booked');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  const bookingOptions = [
    { value: '', label: 'No banquet booking' },
    ...hallBookings.map(b => ({ value: b.id, label: `${b.customer_name} · ${fmtDate(b.event_date)}`, hint: [b.hall_name, b.event_type, b.bill_no].filter(Boolean).join(' · ') })),
  ];

  return (
    <Modal onClose={onClose} title={editing ? 'Edit Sannai Melam' : 'Book Sannai Melam'}
      subtitle="A performance for the function. No stock is used."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="band-form" type="submit" variant="gold" loading={saving}>{editing ? 'Save changes' : 'Book'}</Button></>}>
      <Form id="band-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Banquet booking (optional)" className="sm:col-span-2" as="div">
          <Select value={f.hall_booking_id} onChange={linkBooking} options={bookingOptions} placeholder="No banquet booking" />
        </Field>
        <Field label="Customer name"><Input required value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Event date" as="div"><DatePicker value={f.event_date} onChange={v => set('event_date', v)} /></Field>
        <Field label="Timing"><Input value={f.timing} onChange={e => set('timing', e.target.value)} placeholder="Baraat 6 PM" /></Field>
        <Field label="Team name (optional)"><Input value={f.team} onChange={e => set('team', e.target.value)} placeholder="Sri Sai Sannai Melam" /></Field>
        <Field label="Team phone" hint="To send the team the programme timing on WhatsApp">
          <Input type="tel" value={f.team_phone} onChange={e => set('team_phone', e.target.value)} placeholder="Team leader's mobile" />
        </Field>
        <Field label="Players (optional)"><Input type="number" min="0" value={f.players} onChange={e => set('players', e.target.value)} placeholder="8" /></Field>
        <Field label="Price (₹)"><Input type="number" min="1" required value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="15000" /></Field>
        {!editing && (
          <>
            <Field label="Advance received (₹)"><Input type="number" min="0" value={f.advance} onChange={e => set('advance', e.target.value)} placeholder="0" /></Field>
            <Field label="Payment method" as="div" className="sm:col-span-2 sm:max-w-xs"><Select value={f.method} onChange={v => set('method', v)} options={METHODS} /></Field>
          </>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Songs, route, special requests…" /></Field>
      </Form>
    </Modal>
  );
}

function BandPayment({ booking: b, onClose, onSaved }) {
  const { toast } = useUI();
  const due = Math.max(0, b.amount - b.paid);
  const [f, setF] = useState({ amount: String(due), method: 'Cash', note: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/band/${b.id}/payments`, { method: 'POST', body: { ...f, amount: Number(f.amount) || 0 } });
      toast('Payment recorded');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };
  return (
    <Modal size="sm" onClose={onClose} title="Sannai Melam payment" subtitle={`${b.customer_name} · ${inr(due)} due`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="band-pay" type="submit" variant="gold" loading={saving}>Record payment</Button></>}>
      <Form id="band-pay" onSubmit={save} className="space-y-3">
        <Field label="Amount (₹)"><Input type="number" min="1" max={due} required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Payment method" as="div"><Select value={f.method} onChange={v => setF({ ...f, method: v })} options={METHODS} /></Field>
        <Field label="Note (optional)"><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="UPI reference" /></Field>
      </Form>
    </Modal>
  );
}
