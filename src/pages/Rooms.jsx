import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BedDouble, ChevronRight, Crown, Pencil, Plus, Search, Snowflake, Trash2, Users as UsersIcon, Wrench } from 'lucide-react';
import { useApi, useDebounced, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import BookingDetail from '../components/BookingDetail.jsx';
import { RoomBookingForm } from '../components/BookingForms.jsx';
import {
  Badge, Button, Card, EmptyState, Field, Form, Input, Modal, PageHeader, PageLoader, Segmented, Textarea, cn,
} from '../components/ui.jsx';
import { Select } from '../components/pickers.jsx';
import { ROOM_STATE, ROOM_STATUS, fmtShort, inr, nights } from '../utils.js';

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'checked_in', label: 'In house' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function Rooms() {
  const { isAdmin } = useAuth();
  const remove = useRemove();
  const [params, setParams] = useSearchParams();
  const rooms = useApi('/rooms');
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const bookings = useApi(`/room-bookings?status=${filter}&q=${encodeURIComponent(dq)}`);
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [roomForm, setRoomForm] = useState(null);

  // Deep links from the dashboard
  useEffect(() => {
    if (params.get('new')) setForm({ roomId: Number(params.get('room')) || undefined, date: params.get('date') || undefined });
    if (params.get('booking')) setDetailId(Number(params.get('booking')));
    if ([...params.keys()].length) setParams({}, { replace: true });
  }, []); // run once on page load

  const refresh = () => { rooms.reload(); bookings.reload(); };
  const deleteRoom = r => remove(`/rooms/${r.id}`, {
    title: `Delete ${r.name}?`, message: 'The room will be removed permanently.', success: 'Room deleted', done: refresh,
  });

  if (!rooms.data) return <PageLoader />;
  const count = state => rooms.data.filter(r => r.state === state).length;

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle={`${count('available')} available · ${count('occupied')} occupied · ${count('arriving')} reserved${count('maintenance') ? ` · ${count('maintenance')} in maintenance` : ''}`}
        actions={<>
          {isAdmin && <Button variant="outline" icon={Plus} onClick={() => setRoomForm({})}>Add room</Button>}
          <Button variant="gold" icon={Plus} onClick={() => setForm({})}>New booking</Button>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {rooms.data.map((r, i) => (
          <RoomCard key={r.id} room={r} index={i} isAdmin={isAdmin}
            onOpen={() => (r.current ? setDetailId(r.current.id) : setForm({ roomId: r.id }))}
            onEdit={() => setRoomForm(r)}
            onDelete={() => deleteRoom(r)} />
        ))}
      </div>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          <div className="relative w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search guest or phone" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {bookings.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60">
                <tr>
                  <th className="th">Guest</th>
                  <th className="th">Room</th>
                  <th className="th">Stay</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                  <th className="th text-right w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bookings.data.map(b => {
                  const due = b.total - b.paid;
                  const n = nights(b.check_in, b.check_out);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailId(b.id)}
                      className="group cursor-pointer transition-colors duration-150 hover:bg-gold-50/80"
                    >
                      <td className="td">
                        <p className="font-medium text-ink-900 group-hover:text-gold-900 transition-colors">{b.guest_name}</p>
                        <p className="text-xs text-stone-500">{b.phone || '—'}</p>
                      </td>
                      <td className="td whitespace-nowrap">{b.room_name}</td>
                      <td className="td whitespace-nowrap">
                        <p>{fmtShort(b.check_in)} → {fmtShort(b.check_out)}</p>
                        <p className="text-xs text-stone-500">{n} night{n === 1 ? '' : 's'} · {b.guests} guest{b.guests === 1 ? '' : 's'}</p>
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        <p className="font-medium">{inr(b.total)}</p>
                        <p className={cn('text-xs', due > 0 ? 'text-rose-600' : 'text-emerald-600')}>{due > 0 ? `${inr(due)} due` : 'Paid'}</p>
                      </td>
                      <td className="td"><Badge tone={ROOM_STATUS[b.status].tone} dot>{ROOM_STATUS[b.status].label}</Badge></td>
                      <td className="td text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-400 group-hover:text-gold-800 group-hover:bg-gold-100/70 transition">
                          View <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={BedDouble} title={bookings.loading ? 'Loading…' : 'No bookings found'}
            text={q ? 'Try a different name or phone number.' : 'Create a booking to get started.'}
            action={!q && !bookings.loading && <Button variant="gold" icon={Plus} onClick={() => setForm({})}>New booking</Button>} />
        )}
      </Card>

      {form && (
        <RoomBookingForm booking={form.booking} rooms={rooms.data} defaultRoomId={form.roomId} defaultDate={form.date}
          onClose={() => setForm(null)}
          onSaved={saved => { setForm(null); refresh(); setDetailId(saved.id); }} />
      )}
      {detailId && !form && (
        <BookingDetail kind="room" id={detailId} onClose={() => setDetailId(null)} onChanged={refresh}
          onEdit={b => setForm({ booking: b })} />
      )}
      {roomForm && <RoomForm room={roomForm} onClose={() => setRoomForm(null)} onSaved={() => { setRoomForm(null); refresh(); }} />}
    </>
  );
}

function RoomCard({ room: r, index, isAdmin, onOpen, onEdit, onDelete }) {
  const s = ROOM_STATE[r.state];
  const suite = r.type === 'Suite';
  const iconBtn = cn('cursor-pointer rounded-lg p-1.5 transition', suite ? 'text-ink-200 hover:bg-white/10 hover:text-white' : 'text-stone-400 hover:bg-stone-100 hover:text-ink-900');
  return (
    <div style={{ animationDelay: `${index * 50}ms` }}
      className={cn('group relative flex animate-rise flex-col overflow-hidden rounded-3xl border p-5 transition hover:-translate-y-1 hover:shadow-xl',
        suite ? 'border-ink-800 bg-ink-900 text-white' : 'border-stone-200 bg-white')}>
      {suite && <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-gold-400/25 blur-2xl" />}
      <div className="relative flex items-start justify-between">
        <div className={cn('grid h-11 w-11 place-items-center rounded-2xl', suite ? 'bg-gold-400 text-ink-900' : 'bg-sky-50 text-sky-600')}>
          {r.state === 'maintenance' ? <Wrench size={19} /> : suite ? <Crown size={19} /> : <Snowflake size={19} />}
        </div>
        {isAdmin && (
          <div className="flex">
            <button onClick={onEdit} title="Edit room" className={iconBtn}><Pencil size={15} /></button>
            <button onClick={onDelete} title="Delete room" className={cn(iconBtn, 'hover:text-rose-500')}><Trash2 size={15} /></button>
          </div>
        )}
      </div>
      <p className={cn('relative mt-4 text-[11px] font-semibold tracking-wider uppercase', suite ? 'text-gold-300' : 'text-stone-400')}>{r.type} · {r.number}</p>
      <p className="relative font-display text-xl font-semibold">{r.name}</p>
      <p className={cn('relative mt-1 flex items-center gap-1.5 text-xs', suite ? 'text-ink-200' : 'text-stone-500')}>
        <UsersIcon size={12} /> {r.capacity} guests · {inr(r.rate)}/night
      </p>
      <div className={cn('relative mt-4 flex-1 rounded-2xl p-3 text-xs', suite ? 'bg-white/5' : 'bg-stone-50')}>
        <Badge tone={s.tone} dot>{s.label}</Badge>
        <p className={cn('mt-2 truncate', suite ? 'text-ink-100' : 'text-stone-600')}>
          {r.current ? <><b>{r.current.guest_name}</b> · till {fmtShort(r.current.check_out)}</>
            : r.next ? <>Next: <b>{r.next.guest_name}</b> · {fmtShort(r.next.check_in)}</>
            : 'Free'}
        </p>
      </div>
      <Button size="sm" variant={suite ? 'gold' : r.current ? 'outline' : 'primary'} className="relative mt-4 w-full" onClick={onOpen}>
        {r.current ? 'View booking' : 'Book now'}
      </Button>
    </div>
  );
}

function RoomForm({ room, onClose, onSaved }) {
  const [f, setF] = useState(() => room.id
    ? { ...room, maintenance: !!room.maintenance }
    : { number: '', name: '', type: 'AC Room', rate: 2000, capacity: 2, amenities: '', maintenance: false });
  const [saving, save] = useSave('/rooms', room.id, 'Room', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal title={room.id ? 'Edit room' : 'Add room'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="roomdef-form" type="submit" loading={saving}>Save</Button></>}>
      <Form id="roomdef-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Room number"><Input required value={f.number} onChange={e => set('number', e.target.value)} placeholder="e.g. 105" /></Field>
        <Field label="Type">
          <Select value={f.type} onChange={v => set('type', v)} options={['Suite', 'AC Room', 'Non-AC Room']} />
        </Field>
        <Field label="Display name" className="sm:col-span-2"><Input required value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Rate per night (₹)"><Input type="number" min="0" required value={f.rate} onChange={e => set('rate', e.target.value)} /></Field>
        <Field label="Max guests"><Input type="number" min="1" value={f.capacity} onChange={e => set('capacity', e.target.value)} /></Field>
        <Field label="Amenities" className="sm:col-span-2"><Textarea value={f.amenities} onChange={e => set('amenities', e.target.value)} /></Field>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 p-4 sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={f.maintenance} onChange={e => set('maintenance', e.target.checked)} />
          <span><span className="block text-sm font-medium">Under maintenance</span><span className="text-xs text-stone-500">Shows the room as unavailable on the board</span></span>
        </label>
      </Form>
    </Modal>
  );
}
