import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Plus } from 'lucide-react';
import { useApi } from '../hooks.js';
import { HALL_STATUS, ROOM_STATUS, WEEKDAYS, fmtDate, monthGrid, shiftMonth, slotName, today } from '../utils.js';
import { Badge, Button, Card, PageLoader, cn } from './ui.jsx';

// Heat levels from quiet (0) to fully booked (5)
const HEAT = ['bg-white', 'bg-gold-50', 'bg-gold-100', 'bg-gold-200', 'bg-gold-300', 'bg-gold-400'];
// Each real hall keeps one of these colours for good (given out in the order halls were added).
// Combo halls (one booking, several halls) are dark with a gold outline so they stand apart.
const PALETTE = ['bg-violet-600', 'bg-sky-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-fuchsia-600', 'bg-indigo-600'];
const COMBO_STYLE = 'bg-ink-900 text-gold-200 ring-1 ring-inset ring-gold-400';

const parseIds = raw => {
  try {
    const ids = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(ids) ? ids.map(Number) : [];
  } catch {
    return [];
  }
};

/** "Big Banquet Hall" -> "Big", "Both Halls Combo" -> "Both" */
const shortName = name => {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const main = words.find(w => !/^(hall|halls|banquet|combo|function|a\/c|the)$/i.test(w)) || words[0] || 'Hall';
  return main.length > 7 ? `${main.slice(0, 6)}.` : main;
};

/** Colour, short label and the real halls it takes up, for every hall. */
const hallLook = halls => {
  const real = halls.filter(h => !h.is_combo);
  const look = {};
  real.forEach((h, i) => { look[h.id] = { cls: `${PALETTE[i % PALETTE.length]} text-white`, short: shortName(h.name), takes: [h.id] }; });
  for (const h of halls.filter(x => x.is_combo)) {
    const inside = parseIds(h.included_hall_ids).filter(id => look[id]);
    look[h.id] = { cls: COMBO_STYLE, short: shortName(h.name), takes: inside.length ? inside : real.map(r => r.id), combo: true };
  }
  return { look, realCount: real.length || halls.length };
};

/**
 * How busy a day is: half from room occupancy, half from the halls in use. A combo booking
 * counts every hall it takes; a half day counts as half. 0..1
 */
const busyness = (stays, events, roomCount, look, realCount) => {
  const rooms = roomCount ? stays.length / roomCount : 0;
  const hallLoad = events.reduce((s, e) => s + (look[e.hall_id]?.takes.length || 1) * (e.slot === 'half' ? 0.5 : 1), 0);
  const halls = realCount ? Math.min(1, hallLoad / realCount) : 0;
  return (rooms + halls) / 2;
};

/** A hall booking as a small coloured label: "Big", "Small ½", "Both". */
function HallChip({ look, slot, className }) {
  return (
    <span className={cn('inline-flex max-w-full items-center truncate rounded px-1 py-px text-[10px] leading-tight font-semibold', look?.cls || 'bg-stone-500 text-white', className)}>
      {look?.short || 'Hall'}{slot === 'half' ? ' ½' : ''}
    </span>
  );
}

export default function OccupancyCalendar() {
  const t = today();
  const [month, setMonth] = useState(t.slice(0, 7));
  const [selected, setSelected] = useState(t);
  const { data } = useApi(`/calendar?month=${month}`);
  const nav = useNavigate();
  const days = useMemo(() => monthGrid(month), [month]);

  if (!data) return <Card><PageLoader /></Card>;

  const { look, realCount } = hallLook(data.halls);
  const hallName = Object.fromEntries(data.halls.map(h => [h.id, h.name]));
  const eventsOn = d => data.hallBookings.filter(e => e.event_date === d);
  const staysOn = d => data.roomBookings.filter(b => b.check_in <= d && b.check_out > d);
  const selEvents = eventsOn(selected);
  const selStays = staysOn(selected);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold-50 text-gold-600"><CalendarDays size={17} /></div>
          <div>
            <h3 className="font-semibold text-ink-900">Booking calendar</h3>
            <p className="text-xs text-stone-500">Darker days are busier — rooms and halls combined</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 font-display text-lg font-semibold">{fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
          <Button variant="outline" size="sm" onClick={() => { setMonth(t.slice(0, 7)); setSelected(t); }}>Today</Button>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></Button>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="lg:border-r lg:border-stone-100">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-stone-100 bg-stone-50/60">
            {WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
            {days.map(d => {
              const events = eventsOn(d);
              const stays = staysOn(d);
              const score = busyness(stays, events, data.rooms.length, look, realCount);
              const level = score === 0 ? 0 : Math.min(5, Math.ceil(score * 5));
              const inMonth = d.startsWith(month);
              return (
                <button key={d} onClick={() => setSelected(d)}
                  title={`${stays.length}/${data.rooms.length} rooms · ${events.map(e => `${hallName[e.hall_id]}${e.slot === 'half' ? ' (half day)' : ''}`).join(', ') || 'no hall events'}`}
                  className={cn('relative flex min-h-16 min-w-0 cursor-pointer flex-col border-r border-b border-stone-100 p-1.5 text-left transition hover:brightness-95 sm:min-h-24 sm:p-2 [&:nth-child(7n)]:border-r-0',
                    inMonth ? HEAT[level] : 'bg-stone-50 opacity-50',
                    selected === d && 'z-10 ring-2 ring-ink-900 ring-inset')}>
                  <span className="flex flex-wrap items-start justify-between gap-0.5">
                    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                      d === t ? 'bg-ink-900 text-gold-300' : 'text-ink-900')}>
                      {Number(d.slice(8))}
                    </span>
                    {inMonth && stays.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-white/90 px-0.5 py-px text-[10px] font-bold text-ink-800 ring-1 ring-stone-300 sm:px-1">
                        <BedDouble size={10} className="hidden min-[400px]:block" />{stays.length}
                      </span>
                    )}
                  </span>
                  {inMonth && events.length > 0 && (
                    <>
                      {/* phones: a thick bar per booking (half width for a half day) */}
                      <span className="mt-auto flex flex-col gap-0.5 pt-1 sm:hidden">
                        {events.map(e => (
                          <span key={e.id} className={cn('h-1.5 rounded-full', look[e.hall_id]?.cls || 'bg-stone-500', e.slot === 'half' ? 'w-1/2' : 'w-full')} />
                        ))}
                      </span>
                      {/* larger screens: a readable label per booking */}
                      <span className="mt-auto hidden flex-col items-start gap-0.5 pt-1 sm:flex">
                        {events.slice(0, 3).map(e => <HallChip key={e.id} look={look[e.hall_id]} slot={e.slot} />)}
                        {events.length > 3 && <span className="text-[10px] font-semibold text-stone-500">+{events.length - 3} more</span>}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-xs text-stone-500">
            <span className="flex items-center gap-1.5">
              Quiet
              {HEAT.map(c => <span key={c} className={cn('h-3 w-3 rounded-sm border border-stone-200', c)} />)}
              Busy
            </span>
            {data.halls.map(h => (
              <span key={h.id} className="flex items-center gap-1.5"><HallChip look={look[h.id]} />{h.name}</span>
            ))}
            <span className="flex items-center gap-1.5"><HallChip look={{ cls: 'bg-stone-400 text-white', short: 'Hall' }} slot="half" /> half day</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 rounded-md bg-white px-1 py-px text-[10px] font-bold text-ink-800 ring-1 ring-stone-300"><BedDouble size={11} />2</span>
              rooms occupied
            </span>
          </div>
        </div>

        {/* Selected day */}
        <div className="border-t border-stone-100 lg:border-t-0">
          <div className="border-b border-stone-100 px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wider text-gold-600 uppercase">{fmtDate(selected, { weekday: 'long' })}</p>
            <h3 className="font-display text-xl font-semibold">{fmtDate(selected, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          </div>
          <div className="space-y-5 p-5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-stone-400 uppercase"><PartyPopper size={14} /> Halls</p>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => nav(`/halls?new=1&date=${selected}`)}>Book</Button>
              </div>
              {selEvents.length ? selEvents.map(e => (
                <button key={e.id} onClick={() => nav(`/halls?booking=${e.id}`)}
                  className="mb-2 flex w-full cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 p-3 text-left transition hover:shadow-md">
                  <HallChip look={look[e.hall_id]} slot={e.slot} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{e.customer_name}</span>
                      <Badge tone={HALL_STATUS[e.status].tone}>{HALL_STATUS[e.status].label}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500">{hallName[e.hall_id]} · {slotName(e.slot)} · {e.event_type || 'Event'}</span>
                  </span>
                </button>
              )) : <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-400">All halls free</p>}
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-stone-400 uppercase"><BedDouble size={14} /> Rooms ({selStays.length}/{data.rooms.length})</p>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => nav(`/rooms?new=1&date=${selected}`)}>Book</Button>
              </div>
              <div className="space-y-1">
                {data.rooms.map(r => {
                  const stay = selStays.find(s => s.room_id === r.id);
                  return (
                    <button key={r.id} disabled={!stay} onClick={() => nav(`/rooms?booking=${stay.id}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition enabled:cursor-pointer enabled:hover:bg-stone-50">
                      <span className="font-medium">{r.name}</span>
                      {stay
                        ? <span className="flex min-w-0 items-center gap-2 text-xs text-stone-500"><span className="truncate">{stay.guest_name}</span><Badge tone={ROOM_STATUS[stay.status].tone}>{ROOM_STATUS[stay.status].label}</Badge></span>
                        : <Badge tone="green">Free</Badge>}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Card>
  );
}
