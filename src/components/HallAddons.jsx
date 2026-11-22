import { useEffect, useMemo, useState } from 'react';
import { BedDouble, Boxes, Drum, Flower2, Search, X } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useSettings } from '../settings.jsx';
import { Button, Field, Input, cn } from './ui.jsx';
import { useFullSetDiscount } from '../fullSet.js';
import { DatePicker } from './pickers.jsx';
import { addDays, inr, nights } from '../utils.js';
import { DecorLinesEditor, decorAreas, decorItemsPayload, decorSubtotal } from './Decorations.jsx';

/*
 * Extras a customer can add while booking a hall: rooms, supplies and decoration.
 * useHallAddons keeps their state and totals; <HallAddons> draws the three sections.
 * With any extra the booking is saved as one combined bill (a combo) with one place to pay.
 */

const n = v => Math.max(0, Number(v) || 0);

export function useHallAddons(eventDate) {
  const { settings } = useSettings();
  const rooms = useApi('/rooms');
  const roomBookings = useApi('/room-bookings?status=active');
  const supplies = useApi('/supplies');
  const decorItems = useApi('/decorations/items');

  const [open, setOpen] = useState({ rooms: false, supplies: false, decor: false, band: false });
  const [band, setBand] = useState({ timing: '', team: '', team_phone: '', players: '', amount: '' });
  // Rooms default to the event day until the next day; they follow the event date until changed
  const [dates, setDates] = useState({ in: eventDate, out: addDays(eventDate, 1), touched: false });
  useEffect(() => {
    setDates(d => (d.touched ? d : { in: eventDate, out: addDays(eventDate, 1), touched: false }));
  }, [eventDate]);
  const [roomRates, setRoomRates] = useState({}); // room id -> rate per night
  const [supplyQty, setSupplyQty] = useState({}); // supply id -> quantity
  const [decorLines, setDecorLines] = useState([]);
  const [decorDiscount, setDecorDiscount] = useState('');

  const nightCount = dates.out > dates.in ? nights(dates.in, dates.out) : 0;
  const supplyList = supplies.data || [];

  const roomsTotal = open.rooms ? Object.values(roomRates).reduce((s, r) => s + n(r) * nightCount, 0) : 0;
  const suppliesItemsTotal = open.supplies
    ? Object.entries(supplyQty).reduce((s, [id, q]) => s + n(q) * n(supplyList.find(x => x.id === Number(id))?.rent_rate), 0)
    : 0;
  // Every supply item in stock taken: the full set price applies (discount editable)
  const inStock = supplyList.filter(s => n(s.quantity) > 0);
  const allSupplies = open.supplies && inStock.length > 0 && inStock.every(s => n(supplyQty[s.id]) > 0);
  const fullSet = useFullSetDiscount({ allSelected: allSupplies, itemsTotal: suppliesItemsTotal, fullSetPrice: settings.supplies_full_set_price });
  const suppliesTotal = suppliesItemsTotal - (open.supplies ? fullSet.discount : 0);
  const selectAllSupplies = () => setSupplyQty(prev => {
    const next = { ...prev };
    for (const s of inStock) if (!(n(next[s.id]) > 0)) next[s.id] = 1;
    return next;
  });
  const decorSub = open.decor ? decorSubtotal(decorLines) : 0;
  const decorTotal = open.decor ? Math.max(0, decorSub - Math.min(decorSub, n(decorDiscount))) : 0;
  const bandTotal = open.band ? n(band.amount) : 0;

  const chosenRooms = open.rooms ? Object.keys(roomRates).map(Number) : [];
  const chosenSupplies = open.supplies ? Object.entries(supplyQty).filter(([, q]) => n(q) > 0) : [];
  const decorPayload = open.decor ? decorItemsPayload(decorLines) : [];
  const any = chosenRooms.length > 0 || chosenSupplies.length > 0 || decorPayload.length > 0 || bandTotal > 0;

  /** What the combo needs from the extras (the server checks stock and clashes, and prices everything again). */
  const payload = () => ({
    check_in_date: dates.in,
    check_out_date: dates.out,
    rooms: chosenRooms.map(id => ({ room_id: id, check_in: dates.in, check_out: dates.out, rate: n(roomRates[id]) })),
    supplies: chosenSupplies.map(([id, q]) => {
      const s = supplyList.find(x => x.id === Number(id));
      return { supply_id: Number(id), quantity: n(q), rent_rate: n(s?.rent_rate) };
    }),
    supplies_discount: open.supplies ? fullSet.discount : 0,
    ...(decorPayload.length ? { decoration: { items: decorPayload, discount: n(decorDiscount) } } : {}),
    ...(bandTotal > 0 ? { band: { ...band, amount: n(band.amount), players: n(band.players) } } : {}),
  });

  /** Problems to fix before saving, or null. */
  const problem = () => {
    if (open.rooms && chosenRooms.length && !nightCount) return 'Rooms: check-out must be after check-in';
    if (open.band && !n(band.amount)) return 'Sannai Melam: enter the price, or close the Sannai Melam section';
    for (const [id, q] of chosenSupplies) {
      const s = supplyList.find(x => x.id === Number(id));
      if (s && n(q) > n(s.quantity)) return `Only ${s.quantity} ${s.unit} of ${s.name} available`;
    }
    return null;
  };

  return {
    rooms, roomBookings, supplies, decorItems,
    open, setOpen, dates, setDates, nightCount,
    roomRates, setRoomRates, supplyQty, setSupplyQty, suppliesItemsTotal, inStock, allSupplies, fullSet, selectAllSupplies,
    decorLines, setDecorLines, decorDiscount, setDecorDiscount,
    band, setBand,
    roomsTotal, suppliesTotal, decorTotal, bandTotal, total: roomsTotal + suppliesTotal + decorTotal + bandTotal,
    any, payload, problem,
  };
}

export default function HallAddons({ addons: a }) {
  const { settings } = useSettings();
  const toggle = key => a.setOpen(o => ({ ...o, [key]: !o[key] }));
  const sections = [
    ['rooms', BedDouble, 'Rooms', a.roomsTotal],
    ['supplies', Boxes, 'Supplies', a.suppliesTotal],
    ['decor', Flower2, 'Decoration', a.decorTotal],
    ['band', Drum, 'Sannai Melam', a.bandTotal],
  ];

  return (
    <div className="space-y-3 sm:col-span-2">
      <div>
        <span className="label">Customer also needs? (optional)</span>
        <div className="flex flex-wrap gap-2">
          {sections.map(([key, Icon, label, amount]) => (
            <button key={key} type="button" onClick={() => toggle(key)} aria-pressed={a.open[key]}
              className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition',
                a.open[key] ? 'border-ink-900 bg-ink-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-gold-300')}>
              <Icon size={15} /> {a.open[key] ? '✓' : '+'} {label}{a.open[key] && amount > 0 ? ` · ${inr(amount)}` : ''}
            </button>
          ))}
        </div>
        {a.any && (
          <p className="mt-2 text-xs text-gold-800">Saved as one combined bill: hall and extras together, with one place to take payments.</p>
        )}
      </div>

      {a.open.rooms && <RoomsSection a={a} onClose={() => toggle('rooms')} />}
      {a.open.supplies && <SuppliesSection a={a} onClose={() => toggle('supplies')} />}
      {a.open.decor && (
        <Section title="Decoration" amount={a.decorTotal} onClose={() => toggle('decor')}>
          <DecorLinesEditor areas={decorAreas(settings)} priceItems={a.decorItems.data || []} lines={a.decorLines} setLines={a.setDecorLines} />
          <Field label="Decoration discount (₹)" className="mt-3 sm:max-w-56">
            <Input type="number" min="0" step="any" value={a.decorDiscount} onChange={e => a.setDecorDiscount(e.target.value)} placeholder="0" />
          </Field>
        </Section>
      )}
      {a.open.band && (
        <Section title="Sannai Melam" amount={a.bandTotal} onClose={() => toggle('band')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Programme timing"><Input value={a.band.timing} onChange={e => a.setBand(b => ({ ...b, timing: e.target.value }))} placeholder="Baraat 6 PM" /></Field>
            <Field label="Price (₹)"><Input type="number" min="1" value={a.band.amount} onChange={e => a.setBand(b => ({ ...b, amount: e.target.value }))} placeholder="15000" /></Field>
            <Field label="Team name (optional)"><Input value={a.band.team} onChange={e => a.setBand(b => ({ ...b, team: e.target.value }))} placeholder="Sri Sai Sannai Melam" /></Field>
            <Field label="Team phone (optional)"><Input type="tel" value={a.band.team_phone} onChange={e => a.setBand(b => ({ ...b, team_phone: e.target.value }))} placeholder="Team leader's mobile" /></Field>
            <Field label="Players (optional)"><Input type="number" min="0" value={a.band.players} onChange={e => a.setBand(b => ({ ...b, players: e.target.value }))} placeholder="8" /></Field>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, amount, onClose, children }) {
  return (
    <div className="rounded-2xl border border-stone-200">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
        <span className="font-semibold text-ink-900">{title}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">{inr(amount)}</span>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={`Remove ${title.toLowerCase()}`} title={`Remove ${title.toLowerCase()}`}>
            <X size={16} />
          </button>
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function RoomsSection({ a, onClose }) {
  const rooms = a.rooms.data || [];
  // A room is taken if an active booking overlaps the chosen nights
  const taken = useMemo(() => {
    const set = new Set();
    for (const b of a.roomBookings.data || []) if (b.check_in < a.dates.out && b.check_out > a.dates.in) set.add(b.room_id);
    return set;
  }, [a.roomBookings.data, a.dates]);
  const setDate = (k, v) => a.setDates(d => ({ ...d, [k]: v, touched: true }));
  const toggleRoom = room => a.setRoomRates(r => {
    const next = { ...r };
    if (room.id in next) delete next[room.id];
    else next[room.id] = room.rate;
    return next;
  });

  return (
    <Section title={`Rooms${a.nightCount ? ` · ${a.nightCount} night${a.nightCount === 1 ? '' : 's'}` : ''}`} amount={a.roomsTotal} onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="Check-in" as="div"><DatePicker value={a.dates.in} onChange={v => setDate('in', v)} /></Field>
        <Field label="Check-out" as="div"><DatePicker value={a.dates.out} min={a.dates.in} onChange={v => setDate('out', v)} /></Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rooms.map(room => {
          const picked = room.id in a.roomRates;
          const blocked = !picked && (taken.has(room.id) || room.state === 'maintenance');
          return (
            <div key={room.id} className={cn('rounded-xl border p-3 transition',
              picked ? 'border-gold-400 bg-gold-50' : blocked ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-stone-200')}>
              <label className={cn('flex items-start gap-2.5', blocked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#c19445]" checked={picked} disabled={blocked} onChange={() => toggleRoom(room)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">{room.name}</span>
                  <span className="block text-xs text-stone-500">
                    {room.type} · up to {room.capacity} · {blocked ? (room.state === 'maintenance' ? 'under maintenance' : 'booked on these dates') : `${inr(room.rate)}/night`}
                  </span>
                </span>
              </label>
              {picked && (
                <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                  Rate/night
                  <Input type="number" min="0" className="h-8 py-1 text-sm" value={a.roomRates[room.id]}
                    onChange={e => a.setRoomRates(r => ({ ...r, [room.id]: e.target.value }))} aria-label={`${room.name} rate per night`} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SuppliesSection({ a, onClose }) {
  const [q, setQ] = useState('');
  const list = a.supplies.data || [];
  const picked = Object.entries(a.supplyQty).filter(([, v]) => n(v) > 0).length;
  // A short list to scroll; items already picked are always included so they never disappear
  const matches = list.filter(s => (q ? s.name.toLowerCase().includes(q.toLowerCase()) : true)).slice(0, q ? 60 : 25);
  const shown = [...matches, ...list.filter(s => n(a.supplyQty[s.id]) > 0 && !matches.includes(s))];
  const setQty = (id, v) => a.setSupplyQty(prev => ({ ...prev, [id]: v }));

  return (
    <Section title={`Supplies${picked ? ` · ${picked} item${picked === 1 ? '' : 's'}` : ''}`} amount={a.suppliesTotal} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Search chairs, vessels, stoves…" />
        </div>
        {!a.allSupplies && (
          <Button type="button" variant="outline" onClick={a.selectAllSupplies}>
            Select all items{a.fullSet.price ? ` (full set ${inr(a.fullSet.price)})` : ''}
          </Button>
        )}
      </div>
      <div className="max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
        {shown.map(s => {
          const qty = a.supplyQty[s.id] ?? '';
          const over = n(qty) > n(s.quantity);
          return (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{s.name}</p>
                <p className={cn('text-xs', over ? 'text-rose-600' : 'text-stone-500')}>
                  {inr(s.rent_rate)}/{s.unit} · {s.quantity} available
                </p>
              </div>
              <Input type="number" min="0" max={s.quantity} className={cn('h-9 w-20 py-1 text-sm', over && 'border-rose-400')}
                value={qty} onChange={e => setQty(s.id, e.target.value)} placeholder="0" aria-label={`${s.name} quantity`} />
            </div>
          );
        })}
        {!shown.length && <p className="px-3 py-4 text-center text-sm text-stone-500">No items match "{q}".</p>}
      </div>
      {!q && list.length > matches.length && <p className="mt-2 text-xs text-stone-400">Showing {matches.length} of {list.length}. Search to find more.</p>}
      {a.allSupplies && a.fullSet.price > 0 && (
        <p className="mt-3 rounded-lg bg-gold-100/70 px-3 py-2 text-xs font-medium text-gold-900">
          All {a.inStock.length} items selected: full set price {inr(a.fullSet.price)} applies.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Supplies discount (₹)" className="w-44"
          hint={a.fullSet.fullSetApplied ? `Items ${inr(a.suppliesItemsTotal)}` : a.fullSet.typedByHand ? 'Typed by hand' : undefined}>
          <Input type="number" min="0" step="1" placeholder="0" value={a.fullSet.value} onChange={e => a.fullSet.setValue(e.target.value)} />
        </Field>
        {a.fullSet.typedByHand && a.allSupplies && (
          <Button type="button" size="sm" variant="outline" onClick={a.fullSet.reset}>Use full set price</Button>
        )}
      </div>
    </Section>
  );
}
