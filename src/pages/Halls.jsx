import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarDays, Landmark, PartyPopper, Pencil, Plus, Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { useApi, useDebounced, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import BookingDetail from '../components/BookingDetail.jsx';
import { HallBookingForm } from '../components/BookingForms.jsx';
import {
  Badge, Button, Card, EmptyState, Field, Form, Input, Modal, PageHeader, PageLoader, Segmented, Textarea, cn,
} from '../components/ui.jsx';
import { HALL_STATUS, SLOTS, fmtDate, inr, relDay, today } from '../utils.js';

const FILTERS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function Halls() {
  const { isAdmin } = useAuth();
  const remove = useRemove();
  const [params, setParams] = useSearchParams();
  const halls = useApi('/halls');
  const [filter, setFilter] = useState('upcoming');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const query = filter === 'upcoming'
    ? `status=active&from=${today()}&to=9999-12-31`
    : `status=${filter}`;
  const bookings = useApi(`/hall-bookings?${query}&q=${encodeURIComponent(dq)}`);
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [hallForm, setHallForm] = useState(null);

  useEffect(() => {
    if (params.get('new')) setForm({ hallId: Number(params.get('hall')) || undefined, date: params.get('date') || undefined });
    if (params.get('booking')) setDetailId(Number(params.get('booking')));
    if ([...params.keys()].length) setParams({}, { replace: true });
  }, []); // run once on page load

  const refresh = () => { halls.reload(); bookings.reload(); };
  const deleteHall = h => remove(`/halls/${h.id}`, {
    title: `Delete ${h.name}?`, message: 'The hall will be removed permanently.', success: 'Hall deleted', done: refresh,
  });
  if (!halls.data) return <PageLoader />;

  // Upcoming list reads best in date order
  const list = filter === 'upcoming' ? [...(bookings.data || [])].reverse() : bookings.data || [];

  return (
    <>
      <PageHeader
        title="Banquet Halls"
        subtitle="Weddings, receptions, parties and functions"
        actions={<>
          {isAdmin && <Button variant="outline" icon={Plus} onClick={() => setHallForm({})}>Add hall</Button>}
          <Button variant="gold" icon={Plus} onClick={() => setForm({})}>New booking</Button>
        </>}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {halls.data.map((h, i) => (
          <div key={h.id} style={{ animationDelay: `${i * 70}ms` }}
            className={cn('relative animate-rise overflow-hidden rounded-3xl p-6 transition hover:shadow-xl',
              i === 0 ? 'bg-ink-900 text-white' : 'border border-gold-200 bg-linear-to-br from-gold-50 via-white to-white')}>
            <div className={cn('pointer-events-none absolute -top-16 -right-16 h-52 w-52 rounded-full blur-3xl', i === 0 ? 'bg-gold-400/25' : 'bg-gold-200/50')} />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn('grid h-14 w-14 place-items-center rounded-2xl', i === 0 ? 'bg-gold-400 text-ink-900' : 'bg-ink-900 text-gold-300')}>
                  <Landmark size={24} />
                </div>
                <div>
                  <p className={cn('text-[11px] font-semibold tracking-wider uppercase', i === 0 ? 'text-gold-300' : 'text-gold-600')}>
                    {h.capacity >= 300 ? 'Big hall' : 'Small hall'}
                  </p>
                  <h3 className="font-display text-2xl font-semibold">{h.name}</h3>
                </div>
              </div>
              {isAdmin && (
                <div className="flex">
                  {[[Pencil, 'Edit hall', () => setHallForm(h), ''], [Trash2, 'Delete hall', () => deleteHall(h), 'hover:text-rose-500']].map(([Icon, title, onClick, extra]) => (
                    <button key={title} onClick={onClick} title={title}
                      className={cn('cursor-pointer rounded-lg p-1.5 transition', i === 0 ? 'text-ink-200 hover:bg-white/10 hover:text-white' : 'text-stone-400 hover:bg-stone-100 hover:text-ink-900', extra)}>
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {h.description && <p className={cn('relative mt-3 text-sm', i === 0 ? 'text-ink-200' : 'text-stone-500')}>{h.description}</p>}
            <div className="relative mt-5 grid grid-cols-3 gap-3">
              {[
                [<UsersIcon size={14} key="u" />, 'Capacity', `${h.capacity}`],
                ['₹', 'Full day', inr(h.rate_full)],
                ['½', 'Half day', inr(h.rate_half)],
              ].map(([icon, l, v]) => (
                <div key={l} className={cn('rounded-2xl p-3', i === 0 ? 'bg-white/5' : 'bg-white shadow-sm ring-1 ring-stone-200/70')}>
                  <p className={cn('flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase', i === 0 ? 'text-ink-300' : 'text-stone-400')}>{icon} {l}</p>
                  <p className="mt-1 font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className={cn('relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 text-sm', i === 0 ? 'bg-white/5' : 'bg-stone-50')}>
              <div className="min-w-0">
                {h.today.length ? (
                  <p><Badge tone="rose" dot>Booked today</Badge> <span className="ml-1">{h.today.map(t => `${t.customer_name} (${SLOTS[t.slot]})`).join(', ')}</span></p>
                ) : (
                  <p><Badge tone="green" dot>Free today</Badge>
                    <span className={cn('ml-2', i === 0 ? 'text-ink-200' : 'text-stone-500')}>
                      {h.next ? `Next: ${h.next.customer_name} · ${relDay(h.next.event_date)}` : 'No upcoming events'}
                    </span>
                  </p>
                )}
              </div>
              <Button size="sm" variant={i === 0 ? 'gold' : 'primary'} icon={Plus} onClick={() => setForm({ hallId: h.id })}>Book</Button>
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          <div className="relative w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search customer or phone" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60">
                <tr><th className="th">Date</th><th className="th">Customer</th><th className="th">Hall</th><th className="th">Event</th><th className="th text-right">Amount</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map(b => {
                  const due = b.total - b.paid;
                  return (
                    <tr key={b.id} onClick={() => setDetailId(b.id)} className="cursor-pointer transition hover:bg-gold-50/40">
                      <td className="td whitespace-nowrap">
                        <p className="font-medium">{fmtDate(b.event_date)}</p>
                        <p className="text-xs text-stone-500">{SLOTS[b.slot]} · {relDay(b.event_date)}</p>
                      </td>
                      <td className="td">
                        <p className="font-medium text-ink-900">{b.customer_name}</p>
                        <p className="text-xs text-stone-500">{b.phone || '—'}</p>
                      </td>
                      <td className="td whitespace-nowrap">{b.hall_name}</td>
                      <td className="td whitespace-nowrap">
                        <p>{b.event_type || '—'}</p>
                        {b.guests > 0 && <p className="text-xs text-stone-500">{b.guests} guests</p>}
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        <p className="font-medium">{inr(b.total)}</p>
                        <p className={cn('text-xs', due > 0 ? 'text-rose-600' : 'text-emerald-600')}>{due > 0 ? `${inr(due)} due` : 'Paid'}</p>
                      </td>
                      <td className="td"><Badge tone={HALL_STATUS[b.status].tone} dot>{HALL_STATUS[b.status].label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={PartyPopper} title={bookings.loading ? 'Loading…' : 'No events found'}
            text={q ? 'Try a different name or phone number.' : 'Book a hall for a wedding, party or function.'}
            action={!q && !bookings.loading && <Button variant="gold" icon={CalendarDays} onClick={() => setForm({})}>New booking</Button>} />
        )}
      </Card>

      {form && (
        <HallBookingForm booking={form.booking} halls={halls.data} defaultHallId={form.hallId} defaultDate={form.date}
          onClose={() => setForm(null)}
          onSaved={saved => { setForm(null); refresh(); setDetailId(saved.id); }} />
      )}
      {detailId && !form && (
        <BookingDetail kind="hall" id={detailId} onClose={() => setDetailId(null)} onChanged={refresh}
          onEdit={b => setForm({ booking: b })} />
      )}
      {hallForm && <HallForm hall={hallForm} onClose={() => setHallForm(null)} onSaved={() => { setHallForm(null); refresh(); }} />}
    </>
  );
}

function HallForm({ hall, onClose, onSaved }) {
  const [f, setF] = useState(() => hall.id ? { ...hall } : { name: '', capacity: 100, rate_full: 0, rate_half: 0, description: '' });
  const [saving, save] = useSave('/halls', hall.id, 'Hall', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal title={hall.id ? 'Edit hall' : 'Add hall'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="halldef-form" type="submit" loading={saving}>Save</Button></>}>
      <Form id="halldef-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Hall name" className="sm:col-span-2"><Input required value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Capacity (guests)"><Input type="number" min="1" value={f.capacity} onChange={e => set('capacity', e.target.value)} /></Field>
        <div />
        <Field label="Full day rate (₹)"><Input type="number" min="0" value={f.rate_full} onChange={e => set('rate_full', e.target.value)} /></Field>
        <Field label="Half day rate (₹)" hint="Morning or evening slot"><Input type="number" min="0" value={f.rate_half} onChange={e => set('rate_half', e.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      </Form>
    </Modal>
  );
}
