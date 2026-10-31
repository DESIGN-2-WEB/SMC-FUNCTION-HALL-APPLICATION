import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Plus } from 'lucide-react';
import { useApi } from '../hooks.js';
import { HALL_STATUS, ROOM_STATUS, SLOTS, WEEKDAYS, fmtDate, monthGrid, shiftMonth, today } from '../utils.js';
import { Badge, Button, Card, PageLoader, cn } from './ui.jsx';

// Heat levels from quiet (0) to fully booked (5)
const HEAT = ['bg-white', 'bg-gold-50', 'bg-gold-100', 'bg-gold-200', 'bg-gold-300', 'bg-gold-400'];
const HALL_DOT = ['bg-ink-900', 'bg-violet-600', 'bg-sky-600'];

/** How busy a day is: half from room occupancy, half from hall slots used. 0..1 */
const busyness = (stays, events, roomCount, hallCount) => {
  const rooms = roomCount ? stays.length / roomCount : 0;
  const hallLoad = events.reduce((s, e) => s + (e.slot === 'full' ? 1 : 0.5), 0);
  const halls = hallCount ? Math.min(1, hallLoad / hallCount) : 0;
  return (rooms + halls) / 2;
};

export default function OccupancyCalendar() {
  const t = today();
  const [month, setMonth] = useState(t.slice(0, 7));
  const [selected, setSelected] = useState(t);
  const { data } = useApi(`/calendar?month=${month}`);
  const nav = useNavigate();
  const days = useMemo(() => monthGrid(month), [month]);

  if (!data) return <Card><PageLoader /></Card>;

  const hallIndex = Object.fromEntries(data.halls.map((h, i) => [h.id, i]));
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

      <div className="grid lg:grid-cols-[1fr_320px]">
        <div className="lg:border-r lg:border-stone-100">
          <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/60">
            {WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const events = eventsOn(d);
              const stays = staysOn(d);
              const score = busyness(stays, events, data.rooms.length, data.halls.length);
              const level = score === 0 ? 0 : Math.min(5, Math.ceil(score * 5));
              const inMonth = d.startsWith(month);
              return (
                <button key={d} onClick={() => setSelected(d)}
                  title={`${stays.length}/${data.rooms.length} rooms · ${events.length} hall event${events.length === 1 ? '' : 's'}`}
                  className={cn('relative min-h-16 cursor-pointer border-r border-b border-stone-100 p-1.5 text-left transition hover:brightness-95 sm:min-h-22 sm:p-2 [&:nth-child(7n)]:border-r-0',
                    inMonth ? HEAT[level] : 'bg-stone-50 opacity-50',
                    selected === d && 'z-10 ring-2 ring-ink-900 ring-inset')}>
                  <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
                    d === t ? 'bg-ink-900 text-gold-300' : 'text-ink-900')}>
                    {Number(d.slice(8))}
                  </span>
                  {inMonth && (stays.length > 0 || events.length > 0) && (
                    <div className="absolute right-1.5 bottom-1.5 left-1.5 flex items-center justify-between gap-1">
                      <span className="flex gap-0.5">
                        {events.map(e => <span key={e.id} className={cn('h-2 w-2 rounded-full', HALL_DOT[hallIndex[e.hall_id] % 3])} />)}
                      </span>
                      {stays.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-ink-700">
                          <BedDouble size={11} />{stays.length}
                        </span>
                      )}
                    </div>
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
            {data.halls.map((h, i) => (
              <span key={h.id} className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', HALL_DOT[i % 3])} />{h.name}</span>
            ))}
            <span className="flex items-center gap-1"><BedDouble size={12} /> rooms occupied</span>
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
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', HALL_DOT[hallIndex[e.hall_id] % 3])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{e.customer_name}</span>
                      <Badge tone={HALL_STATUS[e.status].tone}>{HALL_STATUS[e.status].label}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500">{hallName[e.hall_id]} · {SLOTS[e.slot]} · {e.event_type || 'Event'}</span>
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
