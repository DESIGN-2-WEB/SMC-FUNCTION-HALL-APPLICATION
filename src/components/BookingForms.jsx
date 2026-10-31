import { useState } from 'react';
import { useSave } from '../hooks.js';
import { EVENT_TYPES, METHODS, SLOTS, addDays, inr, nights, today } from '../utils.js';
import { Button, Field, Form, Input, Modal, Segmented, Textarea } from './ui.jsx';
import { Combobox, DatePicker, Select } from './pickers.jsx';

function AdvanceFields({ f, set }) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-2xl border border-dashed border-gold-300 bg-gold-50/50 p-4 sm:col-span-2">
      <Field label="Advance received (₹)">
        <Input type="number" min="0" step="1" value={f.advance} onChange={e => set('advance', e.target.value)} placeholder="0" />
      </Field>
      <Field label="Payment method">
        <Select value={f.method} onChange={v => set('method', v)} options={METHODS} />
      </Field>
    </div>
  );
}

export function RoomBookingForm({ booking, rooms, defaultRoomId, defaultDate, onClose, onSaved }) {
  const editing = !!booking?.id;
  const [f, setF] = useState(() => {
    if (editing) return { ...booking };
    const room = rooms.find(r => r.id === defaultRoomId) || rooms.find(r => r.state === 'available') || rooms[0];
    const ci = defaultDate || today();
    return {
      room_id: room?.id ?? '', guest_name: '', phone: '', guests: 1, id_proof: '', address: '',
      check_in: ci, check_out: addDays(ci, 1), rate: room?.rate ?? 0, total: room?.rate ?? 0, advance: '', method: 'Cash', notes: '',
    };
  });
  const [autoTotal, setAutoTotal] = useState(() => !editing || booking.total === nights(booking.check_in, booking.check_out) * booking.rate);
  const [saving, save] = useSave('/room-bookings', booking?.id, 'Booking', onSaved);

  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (k === 'room_id') {
      const room = rooms.find(r => r.id === Number(v));
      if (room) next.rate = room.rate;
    }
    if (k === 'check_in' && next.check_out <= v) next.check_out = addDays(v, 1);
    if (autoTotal && ['room_id', 'check_in', 'check_out', 'rate'].includes(k))
      next.total = nights(next.check_in, next.check_out) * Number(next.rate || 0);
    return next;
  });

  const n = nights(f.check_in, f.check_out);

  return (
    <Modal
      size="lg"
      title={editing ? 'Edit room booking' : 'New room booking'}
      subtitle={editing ? `Booking #${booking.id}` : 'Reserve a room for a guest'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="room-form" type="submit" variant="gold" loading={saving}>{editing ? 'Save changes' : 'Create booking'}</Button></>}
    >
      <Form id="room-form" onSubmit={() => save({ ...f, room_id: Number(f.room_id) })} className="grid gap-4 sm:grid-cols-2">
        <Field label="Room" className="sm:col-span-2">
          <Select value={f.room_id} onChange={v => set('room_id', v)} options={rooms.map(r => ({
            value: r.id,
            label: `${r.name} — ${inr(r.rate)}/night`,
            hint: `${r.type} · up to ${r.capacity} guests${r.state === 'maintenance' ? ' · under maintenance' : ''}`,
          }))} />
        </Field>
        <Field label="Guest name"><Input required value={f.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Check-in"><DatePicker value={f.check_in} onChange={v => set('check_in', v)} /></Field>
        <Field label="Check-out"><DatePicker value={f.check_out} min={addDays(f.check_in, 1)} onChange={v => set('check_out', v)} /></Field>
        <Field label="No. of guests"><Input type="number" min="1" value={f.guests} onChange={e => set('guests', e.target.value)} /></Field>
        <Field label="ID proof" hint="Aadhaar / Driving licence / Passport no."><Input value={f.id_proof} onChange={e => set('id_proof', e.target.value)} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={e => set('address', e.target.value)} placeholder="City / address" /></Field>
        <Field label="Rate per night (₹)"><Input type="number" min="0" value={f.rate} onChange={e => set('rate', e.target.value)} /></Field>
        <Field label="Total amount (₹)" hint={autoTotal ? `${n} night${n === 1 ? '' : 's'} × ${inr(f.rate)}` : 'Custom amount'}>
          <Input type="number" min="0" value={f.total} onChange={e => { setAutoTotal(false); set('total', e.target.value); }} />
        </Field>
        {!editing && <AdvanceFields f={f} set={set} />}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Extra bed, early check-in, etc." /></Field>
      </Form>
    </Modal>
  );
}

export function HallBookingForm({ booking, halls, defaultHallId, defaultDate, onClose, onSaved }) {
  const editing = !!booking?.id;
  const rateFor = (hall, slot) => (hall ? (slot === 'full' ? hall.rate_full : hall.rate_half) : 0);
  const [f, setF] = useState(() => {
    if (editing) return { ...booking };
    const hall = halls.find(h => h.id === defaultHallId) || halls[0];
    return {
      hall_id: hall?.id ?? '', customer_name: '', phone: '', event_type: 'Wedding', event_date: defaultDate || today(),
      slot: 'full', guests: '', total: rateFor(hall, 'full'), status: 'confirmed', advance: '', method: 'Cash', notes: '',
    };
  });
  const [autoTotal, setAutoTotal] = useState(!editing);
  const [saving, save] = useSave('/hall-bookings', booking?.id, 'Booking', onSaved);

  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (autoTotal && (k === 'hall_id' || k === 'slot'))
      next.total = rateFor(halls.find(h => h.id === Number(next.hall_id)), next.slot);
    return next;
  });
  const hall = halls.find(h => h.id === Number(f.hall_id));

  return (
    <Modal
      size="lg"
      title={editing ? 'Edit hall booking' : 'New hall booking'}
      subtitle={editing ? `Booking #${booking.id}` : 'Book a banquet hall for an event'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="hall-form" type="submit" variant="gold" loading={saving}>{editing ? 'Save changes' : 'Create booking'}</Button></>}
    >
      <Form id="hall-form" onSubmit={() => save({ ...f, hall_id: Number(f.hall_id) })} className="grid gap-4 sm:grid-cols-2">
        <Field as="div" label="Hall" className="sm:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {halls.map(h => (
              <button
                type="button"
                key={h.id}
                onClick={() => set('hall_id', h.id)}
                className={`cursor-pointer rounded-2xl border p-3.5 text-left transition ${Number(f.hall_id) === h.id ? 'border-gold-400 bg-gold-50 ring-4 ring-gold-100' : 'border-stone-200 hover:border-stone-300'}`}
              >
                <p className="font-semibold text-ink-900">{h.name}</p>
                <p className="text-xs text-stone-500">Up to {h.capacity} guests · {inr(h.rate_full)} full day</p>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Customer name"><Input required value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Event type">
          <Combobox value={f.event_type} onChange={v => set('event_type', v)} options={EVENT_TYPES} placeholder="Wedding, birthday…" />
        </Field>
        <Field label="Event date"><DatePicker value={f.event_date} onChange={v => set('event_date', v)} /></Field>
        <Field as="div" label="Time slot" className="sm:col-span-2">
          <Segmented value={f.slot} onChange={v => set('slot', v)} options={Object.entries(SLOTS).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Expected guests" hint={hall && Number(f.guests) > hall.capacity ? `Above hall capacity (${hall.capacity})` : undefined}>
          <Input type="number" min="0" value={f.guests} onChange={e => set('guests', e.target.value)} />
        </Field>
        <Field label="Total amount (₹)" hint={autoTotal ? `${SLOTS[f.slot]} rate` : 'Custom amount'}>
          <Input type="number" min="0" value={f.total} onChange={e => { setAutoTotal(false); set('total', e.target.value); }} />
        </Field>
        {!editing && (
          <Field as="div" label="Booking status" className="sm:col-span-2">
            <Segmented value={f.status} onChange={v => set('status', v)} options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'tentative', label: 'Tentative (hold)' }]} />
          </Field>
        )}
        {!editing && <AdvanceFields f={f} set={set} />}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Decoration, catering, sound system, etc." /></Field>
      </Form>
    </Modal>
  );
}
