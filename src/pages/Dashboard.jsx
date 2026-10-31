import { useNavigate } from 'react-router';
import {
  ArrowRight, BedDouble, CalendarDays, Crown, History, IndianRupee, LogIn, LogOut, Package, PartyPopper, Plus, Snowflake,
  TrendingUp, TriangleAlert, Wallet, Wrench,
} from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import OccupancyCalendar from '../components/OccupancyCalendar.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, PageLoader, StatCard, cn } from '../components/ui.jsx';
import { HALL_STATUS, ROOM_STATE, SLOTS, fmtDate, fmtDateTime, fmtShort, inr, relDay } from '../utils.js';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data } = useApi('/dashboard');
  const nav = useNavigate();
  if (!data) return <PageLoader />;

  const occupied = data.rooms.filter(r => r.state === 'occupied').length;
  const eventsToday = data.halls.reduce((n, h) => n + h.today.length, 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const openRoom = id => nav(`/rooms?booking=${id}`);
  const openHall = id => nav(`/halls?booking=${id}`);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative animate-rise overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -top-20 -right-10 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="pointer-events-none absolute right-40 -bottom-24 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-gold-300 uppercase">{fmtDate(data.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{greet}, {user.name.split(' ')[0]}</h1>
            <p className="mt-2 text-sm text-ink-200">
              {occupied} of {data.rooms.length} rooms occupied · {eventsToday ? `${eventsToday} event${eventsToday > 1 ? 's' : ''} today` : 'No hall events today'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" icon={Plus} onClick={() => nav('/rooms?new=1')}>Room booking</Button>
            <Button icon={Plus} className="bg-white/10 hover:bg-white/15" onClick={() => nav('/halls?new=1')}>Hall booking</Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BedDouble} label="Rooms occupied" value={`${occupied} / ${data.rooms.length}`} sub={`${data.arrivals.length} arrival${data.arrivals.length === 1 ? '' : 's'} pending`} />
        <StatCard icon={PartyPopper} label="Events today" value={eventsToday} sub={`${data.upcoming.length} upcoming`} accent="violet" />
        <StatCard icon={Wallet} label="Collected this month" value={inr(data.collectedMonth)} sub={`${inr(data.collectedToday)} today`} accent="green" />
        <StatCard icon={IndianRupee} label="Pending dues" value={inr(data.dues)} sub="Across all active bookings" accent="rose" />
      </div>

      <OccupancyCalendar />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Room board */}
        <Card className="xl:col-span-2">
          <CardHeader icon={BedDouble} title="Room status" subtitle="Live view of all rooms"
            action={<Button variant="ghost" size="sm" onClick={() => nav('/rooms')}>Manage <ArrowRight size={14} /></Button>} />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.rooms.map(r => {
              const s = ROOM_STATE[r.state];
              const suite = r.type === 'Suite';
              return (
                <button key={r.id} onClick={() => (r.current ? openRoom(r.current.id) : nav(`/rooms?new=1&room=${r.id}`))}
                  className={cn('group cursor-pointer rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg',
                    suite ? 'border-gold-300 bg-linear-to-br from-gold-50 to-white sm:col-span-2 lg:col-span-1' : 'border-stone-200 bg-white')}>
                  <div className="flex items-center justify-between">
                    <span className={cn('grid h-9 w-9 place-items-center rounded-xl', suite ? 'bg-ink-900 text-gold-300' : 'bg-sky-50 text-sky-600')}>
                      {r.state === 'maintenance' ? <Wrench size={16} /> : suite ? <Crown size={16} /> : <Snowflake size={16} />}
                    </span>
                    <Badge tone={s.tone} dot>{s.label}</Badge>
                  </div>
                  <p className="mt-3 font-semibold text-ink-900">{r.name}</p>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {r.current ? `${r.current.guest_name} · till ${fmtShort(r.current.check_out)}`
                      : r.next ? `Next: ${r.next.guest_name} · ${fmtShort(r.next.check_in)}` : `${inr(r.rate)} / night`}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Today */}
        <Card>
          <CardHeader icon={CalendarDays} title="Today at the desk" subtitle="Check-ins and check-outs due" />
          <div className="space-y-5 p-5">
            <MiniList title="Arrivals" icon={LogIn} tone="text-emerald-600 bg-emerald-50" empty="No arrivals pending"
              items={data.arrivals.map(a => ({ id: a.id, title: a.guest_name, sub: `${a.room_name} · ${relDay(a.check_in)}`, onClick: () => openRoom(a.id) }))} />
            <MiniList title="Departures" icon={LogOut} tone="text-amber-600 bg-amber-50" empty="No departures due"
              items={data.departures.map(d => ({
                id: d.id, title: d.guest_name, sub: `${d.room_name} · ${relDay(d.check_out)}`,
                right: d.balance > 0 ? <Badge tone="rose">{inr(d.balance)} due</Badge> : <Badge tone="green">Paid</Badge>,
                onClick: () => openRoom(d.id),
              }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Upcoming events */}
        <Card className="xl:col-span-2">
          <CardHeader icon={PartyPopper} title="Upcoming hall events" subtitle={data.halls.map(h => `${h.name}: ${h.today.length ? 'busy today' : 'free today'}`).join(' · ')}
            action={<Button variant="ghost" size="sm" onClick={() => nav('/halls')}>All events <ArrowRight size={14} /></Button>} />
          {data.upcoming.length ? (
            <div className="divide-y divide-stone-100">
              {data.upcoming.map(e => (
                <button key={e.id} onClick={() => openHall(e.id)} className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition hover:bg-stone-50">
                  <div className="w-14 shrink-0 rounded-xl bg-ink-900 py-1.5 text-center text-white">
                    <p className="text-[10px] font-semibold tracking-wider text-gold-300 uppercase">{fmtDate(e.event_date, { month: 'short' })}</p>
                    <p className="font-display text-xl leading-none font-semibold">{fmtDate(e.event_date, { day: 'numeric' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{e.customer_name} <span className="font-normal text-stone-400">· {e.event_type || 'Event'}</span></p>
                    <p className="truncate text-xs text-stone-500">{e.hall_name} · {SLOTS[e.slot]} · {relDay(e.event_date)}{e.guests ? ` · ${e.guests} guests` : ''}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <Badge tone={HALL_STATUS[e.status].tone}>{HALL_STATUS[e.status].label}</Badge>
                    {e.total - e.paid > 0 && <p className="mt-1 text-xs text-rose-600">{inr(e.total - e.paid)} due</p>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={PartyPopper} title="No upcoming events" text="Hall bookings will show up here." />
          )}
        </Card>

        {/* Revenue trend */}
        <Card>
          <CardHeader icon={TrendingUp} title="Collections" subtitle="Last 6 months" />
          <RevenueChart trend={data.trend} />
        </Card>
      </div>

      <div className={cn('grid gap-6', isAdmin && 'xl:grid-cols-2')}>
        <Card>
          <CardHeader icon={Package} title="Low stock" subtitle="Items at or below minimum level"
            action={<Button variant="ghost" size="sm" onClick={() => nav('/supplies')}>Supplies <ArrowRight size={14} /></Button>} />
          {data.lowStock.length ? (
            <div className="divide-y divide-stone-100">
              {data.lowStock.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <TriangleAlert size={16} className={s.quantity === 0 ? 'text-rose-500' : 'text-amber-500'} />
                  <p className="flex-1 text-sm font-medium">{s.name}</p>
                  <p className="text-sm"><b className={s.quantity === 0 ? 'text-rose-600' : 'text-amber-600'}>{s.quantity}</b> <span className="text-stone-400">/ min {s.min_quantity} {s.unit}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Package} title="All stocked up" text="No items are below their minimum level." />
          )}
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader icon={History} title="Recent activity" action={<Button variant="ghost" size="sm" onClick={() => nav('/activity')}>Full log <ArrowRight size={14} /></Button>} />
            <div className="divide-y divide-stone-100">
              {data.recent.map(a => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><b className="font-semibold">{a.user_name || 'Someone'}</b> {a.action}</p>
                    {a.details && <p className="truncate text-xs text-stone-500">{a.details}</p>}
                  </div>
                  <p className="shrink-0 text-xs text-stone-400">{fmtDateTime(a.created_at)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniList({ title, icon: Icon, tone, items, empty }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-stone-400 uppercase">
        <span className={cn('grid h-6 w-6 place-items-center rounded-lg', tone)}><Icon size={13} /></span>
        {title} <span className="text-stone-300">{items.length}</span>
      </p>
      {items.length ? (
        <div className="space-y-1">
          {items.map(i => (
            <button key={i.id} onClick={i.onClick} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-stone-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.title}</p>
                <p className="truncate text-xs text-stone-500">{i.sub}</p>
              </div>
              {i.right}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-400">{empty}</p>
      )}
    </div>
  );
}

function RevenueChart({ trend }) {
  const max = Math.max(1, ...trend.map(t => t.room + t.hall));
  const total = trend.reduce((s, t) => s + t.room + t.hall, 0);
  return (
    <div className="p-5">
      <p className="font-display text-2xl font-semibold">{inr(total)}</p>
      <div className="mt-1 flex gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-800" /> Rooms</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gold-400" /> Halls</span>
      </div>
      <div className="mt-5 flex h-44 items-end gap-3">
        {trend.map(t => {
          const sum = t.room + t.hall;
          return (
            <div key={t.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[10px] font-medium text-stone-500 opacity-0 transition group-hover:opacity-100">{sum ? inr(sum) : ''}</span>
              <div className="flex w-full max-w-10 flex-1 flex-col justify-end overflow-hidden rounded-lg bg-stone-100" title={`Rooms ${inr(t.room)} · Halls ${inr(t.hall)}`}>
                <div className="bg-gold-400 transition-all" style={{ height: `${(t.hall / max) * 100}%` }} />
                <div className="bg-ink-800 transition-all" style={{ height: `${(t.room / max) * 100}%` }} />
              </div>
              <span className="text-[11px] text-stone-400">{fmtDate(`${t.month}-01`, { month: 'short' })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
