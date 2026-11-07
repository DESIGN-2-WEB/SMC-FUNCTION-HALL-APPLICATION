import { useRef, useState } from 'react';
import { CalendarCheck, CheckCircle2, LogIn, Smartphone } from 'lucide-react';
import { useSave } from '../hooks.js';
import { useSettings } from '../settings.jsx';
import {
  EVENT_TYPES, GENERATOR_OPTIONS, GENERATOR_RATES, METHODS, POWER_UNIT_RATE, SLOTS, addDays, inr, nights, today,
} from '../utils.js';
import { Button, Field, Form, Input, Modal, Segmented, Textarea, cn, useUI } from './ui.jsx';
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

function RoomPaymentFields({ f, set }) {
  const total = Number(f.total) || 0;
  const adv = Number(f.advance) || 0;
  const bal = Math.max(0, total - adv);

  return (
    <div className="rounded-2xl border border-gold-300 bg-gold-50/60 p-4 sm:col-span-2 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-200/80 pb-2.5">
        <div>
          <h4 className="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
            <CheckCircle2 size={16} className="text-gold-600" />
            Reservation Advance Payment
          </h4>
          <p className="text-xs text-stone-500">
            {adv > 0
              ? (adv >= total ? 'Full fee collected for reservation' : `${inr(adv)} advance paid · Balance ${inr(bal)} due at check-in`)
              : 'Advance deposit to secure and confirm the room reservation'}
          </p>
        </div>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-800">
          Fee: {inr(total)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Field
            label="Advance received (₹)"
            hint={adv > 0 ? (adv >= total ? '100% upfront fee' : `Balance due at check-in: ${inr(bal)}`) : `Advance deposit towards room fee of ${inr(total)}`}
          >
            <Input
              type="number"
              min="0"
              max={total || undefined}
              step="any"
              placeholder="0"
              value={f.advance}
              onChange={e => set('advance', e.target.value)}
              className="bg-white font-medium"
            />
          </Field>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => set('advance', '')}
              className={cn(
                'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                !adv ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              )}
            >
              No advance (₹0)
            </button>
            {total > 1000 && (
              <button
                type="button"
                onClick={() => set('advance', Math.min(1000, total))}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                  adv === Math.min(1000, total) ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                )}
              >
                ₹1,000
              </button>
            )}
            <button
              type="button"
              onClick={() => set('advance', total)}
              className={cn(
                'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                adv === total && total > 0 ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              )}
            >
              Full fee ({inr(total)})
            </button>
          </div>
        </div>

        <Field label="Payment method">
          <Select
            value={f.method}
            onChange={v => set('method', v)}
            options={METHODS}
            disabled={!adv}
          />
        </Field>
      </div>
    </div>
  );
}

export function RoomBookingForm({ booking, rooms, defaultRoomId, defaultDate, onClose, onSaved }) {
  const { toast } = useUI();
  const editing = !!booking?.id;
  const [isReservation, setIsReservation] = useState(() => {
    if (editing) return booking.status === 'reserved';
    const ci = defaultDate || today();
    return ci > today();
  });
  const [f, setF] = useState(() => {
    if (editing) return {
      ...booking,
      id_photo_taken: !!booking.id_photo_taken,
      discount: booking.discount ?? '',
    };
    const room = rooms.find(r => r.id === defaultRoomId) || rooms.find(r => r.state === 'available') || rooms[0];
    const ci = defaultDate || today();
    const rate = room?.rate ?? 0;
    return {
      room_id: room?.id ?? '', guest_name: '', phone: '', guests: 1, id_proof: '', id_photo_taken: false, address: '',
      check_in: ci, check_out: addDays(ci, 1), rate, discount: '', total: rate, advance: '', method: 'Cash', notes: '',
    };
  });
  const [autoTotal, setAutoTotal] = useState(() => !editing || booking.total === Math.max(0, nights(booking.check_in, booking.check_out) * (booking.rate || 0) - (booking.discount || 0)));
  const [saving, save] = useSave('/room-bookings', booking?.id, 'Booking', onSaved);

  const handleSubmit = () => {
    if (!f.guest_name?.trim()) return toast('Please enter guest name', 'error');
    if (!f.phone?.trim()) return toast('Please enter guest phone number', 'error');
    if (!f.check_in || !f.check_out) return toast('Please select check-in and check-out dates', 'error');
    if (!f.id_proof?.trim()) return toast('Please enter ID proof number (Aadhaar / DL / Passport)', 'error');
    if (!f.id_photo_taken) return toast('Please confirm taking the photo of the ID proof on mobile phone', 'error');

    save({
      ...f,
      status: editing ? (f.status || 'reserved') : (isReservation ? 'reserved' : 'checked_in'),
      room_id: Number(f.room_id),
      discount: Number(f.discount) || 0,
      id_photo_taken: f.id_photo_taken ? 1 : 0,
      ...(editing ? {} : { advance: isReservation ? (Number(f.advance) || 0) : 0 }),
    });
  };

  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (k === 'room_id') {
      const room = rooms.find(r => r.id === Number(v));
      if (room) next.rate = room.rate;
    }
    if (k === 'check_in' && next.check_out <= v) next.check_out = addDays(v, 1);
    if (autoTotal && ['room_id', 'check_in', 'check_out', 'rate', 'discount'].includes(k)) {
      const base = nights(next.check_in, next.check_out) * Number(next.rate || 0);
      const disc = Math.max(0, Number(next.discount) || 0);
      next.total = Math.max(0, base - disc);
    }
    return next;
  });

  const n = nights(f.check_in, f.check_out);
  const discAmount = Number(f.discount) || 0;

  return (
    <Modal
      size="lg"
      title={editing ? 'Edit room booking' : 'New room booking'}
      subtitle={editing ? `Booking #${booking.id}` : (isReservation ? 'Reserve a room for upcoming stay' : 'Check in a guest right now')}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button form="room-form" type="submit" variant="gold" loading={saving}>Save changes</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {isReservation ? (
              <Button
                form="room-form"
                type="submit"
                variant="gold"
                className="cursor-pointer font-semibold shadow-xs"
                loading={saving}
                icon={CalendarCheck}
              >
                Reserve room
              </Button>
            ) : (
              <Button
                form="room-form"
                type="submit"
                variant="gold"
                className="cursor-pointer font-semibold shadow-xs"
                loading={saving}
                icon={LogIn}
              >
                Check in
              </Button>
            )}
          </>
        )
      }
    >
      <Form id="room-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {/* On top of the room: Reservation toggle checkbox */}
        {!editing && (
          <div className="sm:col-span-2">
            <label className={cn(
              "flex items-center justify-between cursor-pointer rounded-2xl border p-3.5 transition select-none shadow-2xs",
              isReservation
                ? "border-gold-400 bg-gold-50/80 ring-2 ring-gold-200"
                : "border-stone-200 bg-stone-50/70 hover:bg-stone-100/70"
            )}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isReservation}
                  onChange={e => setIsReservation(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-gold-600 focus:ring-gold-400 cursor-pointer accent-gold-600"
                />
                <div>
                  <span className="text-sm font-semibold text-ink-900 block">
                    Advance Reservation
                  </span>
                  <span className="text-xs text-stone-500 block">
                    Tick if reserving for a future date (hold booking with reservation advance)
                  </span>
                </div>
              </div>
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                isReservation ? "bg-gold-200 text-gold-900" : "bg-stone-200 text-stone-600"
              )}>
                {isReservation ? "Reservation Mode" : "Direct Check-in"}
              </span>
            </label>
          </div>
        )}

        <Field label="Room" className="sm:col-span-2">
          <Select value={f.room_id} onChange={v => set('room_id', v)} options={rooms.map(r => ({
            value: r.id,
            label: `${r.name} — ${inr(r.rate)}/night`,
            hint: `${r.type} · up to ${r.capacity} guests${r.state === 'maintenance' ? ' · under maintenance' : ''}`,
          }))} />
        </Field>
        <Field label="Guest name"><Input required value={f.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Phone"><Input type="tel" required value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Check-in"><DatePicker required value={f.check_in} onChange={v => set('check_in', v)} /></Field>
        <Field label="Check-out"><DatePicker required value={f.check_out} min={addDays(f.check_in, 1)} onChange={v => set('check_out', v)} /></Field>
        <Field label="No. of guests"><Input type="number" min="1" required value={f.guests} onChange={e => set('guests', e.target.value)} /></Field>
        <Field label="ID proof" hint="Aadhaar / Driving licence / Passport no.">
          <Input required value={f.id_proof} onChange={e => set('id_proof', e.target.value)} placeholder="Aadhaar / DL / Passport number" />
        </Field>
        <div className="sm:col-span-2">
          <label className={cn(
            "flex items-center gap-3 cursor-pointer rounded-xl border px-3.5 py-2.5 text-xs font-medium transition select-none shadow-2xs",
            !f.id_photo_taken ? "border-amber-300 bg-amber-50/70 text-amber-900" : "border-emerald-300 bg-emerald-50/70 text-emerald-900"
          )}>
            <input
              type="checkbox"
              required
              checked={!!f.id_photo_taken}
              onChange={e => set('id_photo_taken', e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-gold-600 focus:ring-gold-400 cursor-pointer accent-gold-600 shrink-0"
            />
            <Smartphone size={16} className={!f.id_photo_taken ? "text-amber-600 shrink-0" : "text-emerald-600 shrink-0"} />
            <span>Taken the picture of the proof submitted in mobile phone <b className="text-rose-500">*</b></span>
          </label>
        </div>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={e => set('address', e.target.value)} placeholder="City / address" /></Field>
        <Field label="Rate per night (₹)"><Input type="number" min="0" value={f.rate} onChange={e => set('rate', e.target.value)} /></Field>
        <Field label="Discount (₹)" hint={discAmount > 0 ? `Discount applied: −${inr(discAmount)}` : 'Flat discount on stay'}>
          <Input type="number" min="0" placeholder="0" value={f.discount} onChange={e => set('discount', e.target.value)} />
        </Field>
        <Field label="Total amount (₹)" hint={autoTotal ? `${n} night${n === 1 ? '' : 's'} × ${inr(f.rate)}${discAmount > 0 ? ` − ${inr(discAmount)} discount` : ''}` : 'Custom amount'} className="sm:col-span-2">
          <Input type="number" min="0" value={f.total} onChange={e => { setAutoTotal(false); set('total', e.target.value); }} />
        </Field>
        {!editing && isReservation && <RoomPaymentFields f={f} set={set} />}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Extra bed, early check-in, etc." /></Field>
      </Form>
    </Modal>
  );
}

export function HallBookingForm({ booking, halls, defaultHallId, defaultDate, onClose, onSaved }) {
  const editing = !!booking?.id;
  const rateFor = (hall, slot) => (hall ? (slot === 'full' ? hall.rate_full : hall.rate_half) : 0);
  const { settings } = useSettings();
  const dbPowerRate = Number(settings.power_rate) || 15;
  let generatorsList = [];
  try {
    generatorsList = typeof settings.generators === 'string' ? JSON.parse(settings.generators) : (settings.generators || []);
  } catch {
    generatorsList = [];
  }
  if (!Array.isArray(generatorsList) || generatorsList.length === 0) {
    generatorsList = [
      { name: '120 kVA', rate: Number(settings.gen_120kva_rate) || 1500 },
      { name: '30 kVA', rate: Number(settings.gen_30kva_rate) || 450 },
    ];
  }
  const genRates = Object.fromEntries(generatorsList.map(g => [g.name, Number(g.rate) || 0]));
  const eventTypes = settings.event_types
    ? settings.event_types.split(',').map(s => s.trim()).filter(Boolean)
    : EVENT_TYPES;
  const genOptions = [
    { value: '', label: 'None' },
    ...generatorsList.map(g => ({
      value: g.name,
      label: `${g.name} (${inr(g.rate)}/hr)`,
    })),
  ];
  if (booking?.generator_type && !genOptions.some(o => o.value === booking.generator_type)) {
    genOptions.push({
      value: booking.generator_type,
      label: `${booking.generator_type} (${inr(booking.generator_rate || 0)}/hr)`,
    });
  }

  const [f, setF] = useState(() => {
    if (editing) {
      const b = { ...booking };
      const rent = b.rent ?? b.total ?? 0;
      const power_start = b.power_start ?? '';
      const power_end = b.power_end ?? '';
      const power_units = b.power_units ?? (b.power_end > b.power_start ? b.power_end - b.power_start : '');
      const power_rate = b.power_rate || dbPowerRate;
      const power_amount = b.power_amount ?? (power_units ? power_units * power_rate : 0);
      const generator_type = b.generator_type ?? '';
      const generator_hours = b.generator_hours ?? '';
      const generator_rate = b.generator_rate || (generator_type ? (genRates[generator_type] || 0) : 0);
      const generator_amount = b.generator_amount ?? (generator_hours ? generator_hours * generator_rate : 0);
      return {
        ...b,
        rent,
        power_start,
        power_end,
        power_units,
        power_rate,
        power_amount,
        generator_type,
        generator_hours,
        generator_rate,
        generator_amount,
        total: b.total ?? (rent + power_amount + generator_amount),
        advance: '',
        method: 'Cash',
      };
    }
    const hall = halls.find(h => h.id === defaultHallId) || halls[0];
    const baseRent = rateFor(hall, 'full');
    return {
      hall_id: hall?.id ?? '', customer_name: '', phone: '', event_type: eventTypes[0] || 'Wedding', event_date: defaultDate || today(),
      slot: 'full', guests: '', rent: baseRent,
      power_start: '', power_end: '', power_units: '', power_rate: dbPowerRate, power_amount: 0,
      generator_type: '', generator_hours: '', generator_rate: 0, generator_amount: 0,
      total: baseRent, status: 'confirmed', advance: '', method: 'Cash', notes: '',
    };
  });

  const [autoTotal, setAutoTotal] = useState(!editing);
  const [saving, save] = useSave('/hall-bookings', booking?.id, 'Booking', onSaved);

  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };

    if (k === 'hall_id' || k === 'slot') {
      const hall = halls.find(h => h.id === Number(next.hall_id));
      next.rent = rateFor(hall, next.slot);
    }

    if (k === 'power_start' || k === 'power_end') {
      const s = Number(next.power_start) || 0;
      const e = Number(next.power_end) || 0;
      if (next.power_end !== '' && e >= s) {
        next.power_units = e - s;
      }
    }

    if (['power_start', 'power_end', 'power_units', 'power_rate'].includes(k)) {
      const u = Number(next.power_units) || 0;
      const r = Number(next.power_rate) || dbPowerRate;
      next.power_amount = Math.max(0, Math.round(u * r));
    }

    if (k === 'generator_type') {
      next.generator_rate = genRates[v] || 0;
      const hrs = Number(next.generator_hours) || 0;
      next.generator_amount = Math.max(0, Math.round(hrs * next.generator_rate));
    }

    if (k === 'generator_hours' || k === 'generator_rate') {
      const hrs = Number(next.generator_hours) || 0;
      const rate = Number(next.generator_rate) || 0;
      next.generator_amount = Math.max(0, Math.round(hrs * rate));
    }

    if (autoTotal && ['hall_id', 'slot', 'rent', 'power_start', 'power_end', 'power_units', 'power_rate', 'generator_type', 'generator_hours', 'generator_rate'].includes(k)) {
      next.total = Number(next.rent || 0) + Number(next.power_amount || 0) + Number(next.generator_amount || 0);
    }

    return next;
  });

  const hall = halls.find(h => h.id === Number(f.hall_id));
  const rentVal = Number(f.rent || 0);
  const powerVal = Number(f.power_amount || 0);
  const genVal = Number(f.generator_amount || 0);
  const calculatedTotal = rentVal + powerVal + genVal;

  return (
    <Modal
      size="lg"
      title={editing ? 'Edit hall booking' : 'New hall booking'}
      subtitle={editing ? `Booking #${booking.id}` : 'Book SMC banquet hall for an event'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="hall-form" type="submit" variant="gold" loading={saving}>{editing ? 'Save changes' : 'Create booking'}</Button></>}
    >
      <Form id="hall-form" onSubmit={() => save({
        ...f,
        hall_id: Number(f.hall_id),
        rent: rentVal,
        power_start: Number(f.power_start) || 0,
        power_end: Number(f.power_end) || 0,
        power_units: Number(f.power_units) || 0,
        power_rate: Number(f.power_rate) || dbPowerRate,
        power_amount: powerVal,
        generator_hours: Number(f.generator_hours) || 0,
        generator_rate: Number(f.generator_rate) || 0,
        generator_amount: genVal,
        total: Number(f.total) || calculatedTotal,
      })} className="grid gap-4 sm:grid-cols-2">
        <Field as="div" label="Choose Hall" className="sm:col-span-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {halls.map(h => (
              <button
                type="button"
                key={h.id}
                onClick={() => set('hall_id', h.id)}
                className={`cursor-pointer rounded-2xl border p-3.5 text-left transition ${Number(f.hall_id) === h.id ? 'border-gold-400 bg-gold-50 ring-4 ring-gold-100' : 'border-stone-200 hover:border-stone-300'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink-900">{h.name}</p>
                  {/combo/i.test(h.name) && (
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800 uppercase tracking-wider">Combo</span>
                  )}
                </div>
                <p className="text-xs text-stone-500">Up to {h.capacity} guests</p>
                <p className="mt-1 text-xs font-semibold text-gold-700">Full: {inr(h.rate_full)} · Half: {inr(h.rate_half)}</p>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Customer name"><Input required value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Event type">
          <Combobox value={f.event_type} onChange={v => set('event_type', v)} options={eventTypes} placeholder="Wedding, engagement, half saree…" />
        </Field>
        <Field label="Event date"><DatePicker value={f.event_date} onChange={v => set('event_date', v)} /></Field>

        <Field as="div" label="Time slot" className="sm:col-span-2">
          <Segmented value={f.slot} onChange={v => set('slot', v)} options={Object.entries(SLOTS).map(([value, label]) => ({ value, label }))} />
        </Field>

        <Field label="Expected guests" hint={hall && Number(f.guests) > hall.capacity ? `Above hall capacity (${hall.capacity})` : undefined}>
          <Input type="number" min="0" value={f.guests} onChange={e => set('guests', e.target.value)} placeholder="e.g. 300" />
        </Field>

        <Field label="Hall Rent (₹)" hint={`${SLOTS[f.slot]} base rent`}>
          <Input type="number" min="0" value={f.rent} onChange={e => set('rent', e.target.value)} />
        </Field>

        {/* Extra Charges Section */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:col-span-2 space-y-4">
          <div>
            <h4 className="font-semibold text-ink-900 text-sm">Extra Charges (Not included in rent)</h4>
            <p className="text-xs text-stone-500">
              Power: ₹{f.power_rate || dbPowerRate}/unit (Ending − Starting reading)
              {generatorsList.length > 0 && ` · Generators: ${generatorsList.map(g => `${g.name} (${inr(g.rate)}/hr)`).join(' · ')}`}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Electricity / Power Bill</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Start reading">
                <Input type="number" step="any" min="0" placeholder="0" value={f.power_start} onChange={e => set('power_start', e.target.value)} />
              </Field>
              <Field label="End reading">
                <Input type="number" step="any" min="0" placeholder="0" value={f.power_end} onChange={e => set('power_end', e.target.value)} />
              </Field>
              <Field label="Units used" hint="End − Start">
                <Input type="number" step="any" min="0" placeholder="0" value={f.power_units} onChange={e => set('power_units', e.target.value)} />
              </Field>
              <Field label="Power bill (₹)" hint={`@ ₹${f.power_rate || dbPowerRate}/unit`}>
                <Input type="number" min="0" value={f.power_amount} readOnly className="bg-stone-50 font-medium" />
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Generator Bill</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Generator">
                <Select value={f.generator_type} onChange={v => set('generator_type', v)} options={genOptions} />
              </Field>
              <Field label="Hours of use">
                <Input type="number" step="0.5" min="0" placeholder="0" value={f.generator_hours} onChange={e => set('generator_hours', e.target.value)} />
              </Field>
              <Field label="Generator bill (₹)" hint={f.generator_type ? `@ ${inr(f.generator_rate)}/hr` : 'No generator'}>
                <Input type="number" min="0" value={f.generator_amount} readOnly className="bg-stone-50 font-medium" />
              </Field>
            </div>
          </div>

          {/* Real-time Bill Breakdown */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gold-100/70 px-3.5 py-2.5 text-xs text-ink-900 font-medium">
            <span>Bill breakdown: {inr(rentVal)} (Rent) + {inr(powerVal)} (Power) + {inr(genVal)} (Gen)</span>
            <span className="font-bold text-sm text-gold-900">{inr(calculatedTotal)}</span>
          </div>
        </div>

        <Field label="Final bill total (₹)" className="sm:col-span-2"
          hint={autoTotal ? 'Calculated automatically (Rent + Power + Gen)' : 'Custom total entered manually'}>
          <div className="flex gap-2">
            <Input type="number" min="0" className="font-semibold text-lg" value={f.total}
              onChange={e => { setAutoTotal(false); set('total', e.target.value); }} />
            {!autoTotal && (
              <Button type="button" size="sm" variant="outline" onClick={() => { setAutoTotal(true); set('total', calculatedTotal); }}>
                Recalculate
              </Button>
            )}
          </div>
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
