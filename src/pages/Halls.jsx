import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarDays, Check, ChevronDown, ChevronRight, Landmark, Layers, PartyPopper, Pencil, Plus, Search, Sparkles, Trash2, Users as UsersIcon, X, Zap } from 'lucide-react';
import { useApi, useDebounced, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { api } from '../api.js';
import BookingDetail from '../components/BookingDetail.jsx';
import { HallBookingForm } from '../components/BookingForms.jsx';
import BulkPackageModal from '../components/BulkPackageModal.jsx';
import PackageDetailModal from '../components/PackageDetailModal.jsx';
import ComboTable from '../components/ComboTable.jsx';
import WhatsAppModal from '../components/WhatsAppModal.jsx';
import {
  Badge, Button, Card, EmptyState, Field, Form, Input, Modal, PageHeader, PageLoader, Segmented, Textarea, cn, useUI,
} from '../components/ui.jsx';
import { HALL_STATUS, SLOTS, fmtDate, inr, relDay, today } from '../utils.js';

const FILTERS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'packages', label: '✨ Combos' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function Halls() {
  const { isAdmin } = useAuth();
  const { settings, reload: reloadSettings } = useSettings();
  const { toast } = useUI();
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
  const packagesApi = useApi(`/packages?q=${encodeURIComponent(dq)}`);
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [hallForm, setHallForm] = useState(null);
  const [bulkPackageModal, setBulkPackageModal] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [waPackage, setWaPackage] = useState(null);

  // Event Categories Section State
  const [eventsOpen, setEventsOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [savingEvents, setSavingEvents] = useState(false);

  const eventTypesList = (settings.event_types || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const saveEventTypes = async updatedList => {
    setSavingEvents(true);
    try {
      const updatedString = updatedList.join(', ');
      await api('/settings', { method: 'PUT', body: { event_types: updatedString } });
      await reloadSettings();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingEvents(false);
    }
  };

  const handleAddEventType = async () => {
    const trimmed = newEventName.trim();
    if (!trimmed) {
      return toast('Please enter an event type name', 'error');
    }
    if (eventTypesList.some(item => item.toLowerCase() === trimmed.toLowerCase())) {
      return toast(`"${trimmed}" already exists in event types`, 'error');
    }
    const updated = [...eventTypesList, trimmed];
    await saveEventTypes(updated);
    setNewEventName('');
    toast(`Added "${trimmed}" to event types`);
  };

  const handleRemoveEventType = async nameToRemove => {
    if (!nameToRemove) return;
    const updated = eventTypesList.filter(item => item.toLowerCase() !== nameToRemove.toLowerCase());
    await saveEventTypes(updated);
    toast(`Removed "${nameToRemove}" from event types`);
  };

  const handleRestoreDefaultEventTypes = async () => {
    const defaults = ['Wedding', 'Engagement', 'Half Saree', 'Birthday', 'Meetings', 'Reception', 'Corporate', 'Other'];
    await saveEventTypes(defaults);
    toast('Restored default event types');
  };

  useEffect(() => {
    if (params.get('new')) setForm({ hallId: Number(params.get('hall')) || undefined, date: params.get('date') || undefined });
    if (params.get('package')) setBulkPackageModal(true);
    if (params.get('booking')) setDetailId(Number(params.get('booking')));
    if ([...params.keys()].length) setParams({}, { replace: true });
  }, []); // run once on page load

  const refresh = () => { halls.reload(); bookings.reload(); packagesApi.reload(); };
  const deleteHall = h => remove(`/halls/${h.id}`, {
    title: `Delete ${h.name}?`, message: 'The hall will be removed permanently.', success: 'Hall deleted', done: refresh,
  });
  if (!halls.data) return <PageLoader />;

  // Upcoming list reads best in date order
  const list = filter === 'upcoming' ? [...(bookings.data || [])].reverse() : bookings.data || [];
  const packagesList = packagesApi.data || [];

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

  const comboHall = halls.data?.find(h => /combo/i.test(h.name));

  return (
    <>
      <PageHeader
        title="Banquet Halls"
        subtitle={`${settings.property_name || 'SMC Function Hall (A/C)'} · ${settings.property_tagline || 'Kalyana Mandapam'} · ${settings.address || 'Palasa – Kasibugga'}${settings.phone ? ` · ${settings.phone}` : ''}`}
        actions={<>
          <Button
            variant="gold"
            icon={Sparkles}
            onClick={() => setBulkPackageModal(true)}
          >
            Combo booking
          </Button>
          <Button variant="outline" icon={Plus} onClick={() => setForm({})}>
            New Hall Booking
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" icon={Plus} onClick={() => setHallForm({})}>Add hall</Button>
              <Button
                variant="outline"
                icon={Layers}
                onClick={() => setHallForm({ isCombo: true })}
              >
                Add combo
              </Button>
            </>
          )}
        </>}
      />

      {/* Tariff & Extra Charges Reference Bar */}
      <div className="mb-6 rounded-2xl border border-gold-200 bg-gold-50/60 p-4 text-xs text-ink-900 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-200/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-gold-700" />
            <span className="font-semibold text-gold-900 tracking-wide uppercase">Tariff & Extra Charges (Database Configured)</span>
          </div>
          <span className="text-stone-500 font-medium">Formula: Final bill = Hall rent + Power bill + Generator bill</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gold-200/70 bg-white/80 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gold-900">Both Halls Combo</span>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800 uppercase tracking-wider">Combo</span>
            </div>
            <p className="mt-1 text-ink-900">
              Full day: <b>{inr(comboHall?.rate_full ?? 90000)}</b> · Half day: <b>{inr(comboHall?.rate_half ?? 47000)}</b>
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">Big Banquet + Small Banquet Halls</p>
          </div>

          <div className="rounded-xl border border-gold-200/70 bg-white/80 p-3">
            <span className="font-semibold text-gold-900">Power Bill</span>
            <p className="mt-1 text-ink-900">
              <b>₹{settings.power_rate || 15}</b> per unit
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">Units = Ending reading − Starting reading</p>
          </div>

          <div className="rounded-xl border border-gold-200/70 bg-white/80 p-3">
            <span className="font-semibold text-gold-900">Generator Bill</span>
            <p className="mt-1 text-ink-900">
              {generatorsList.length > 0
                ? generatorsList.map(g => `${g.name} @ ${inr(g.rate)}/hr`).join(' · ')
                : 'None configured'}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">Charged per hour of use</p>
          </div>

          <div className="rounded-xl border border-gold-200/70 bg-white/80 p-3">
            <span className="font-semibold text-gold-900">Billing Example</span>
            <p className="mt-1 text-ink-900">
              Combo half day ({inr(comboHall?.rate_half ?? 47000)}) + 200 units (₹3,000) + Gen 3 hrs (₹4,500) = <b>{inr((comboHall?.rate_half ?? 47000) + 7500)}</b>
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">Big hall half day: {inr(42000 + 7500)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[...(halls.data || [])]
          .sort((a, b) => {
            const aCombo = Boolean(a.is_combo || /combo/i.test(a.name));
            const bCombo = Boolean(b.is_combo || /combo/i.test(b.name));
            if (aCombo !== bCombo) return aCombo ? -1 : 1;
            return (b.capacity || 0) - (a.capacity || 0);
          })
          .map((h, i) => {
            const isCombo = Boolean(h.is_combo || /combo/i.test(h.name));
            return (
            <div key={h.id} style={{ animationDelay: `${i * 70}ms` }}
              className={cn('relative animate-rise overflow-hidden rounded-3xl p-6 transition hover:shadow-xl',
                isCombo ? 'bg-ink-900 text-white shadow-xl ring-1 ring-gold-400/30' : 'border border-gold-200 bg-linear-to-br from-gold-50 via-white to-white')}>
              <div className={cn('pointer-events-none absolute -top-16 -right-16 h-52 w-52 rounded-full blur-3xl', isCombo ? 'bg-gold-400/25' : 'bg-gold-200/50')} />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn('grid h-14 w-14 place-items-center rounded-2xl', isCombo ? 'bg-gold-400 text-ink-900' : 'bg-ink-900 text-gold-300')}>
                    <Landmark size={24} />
                  </div>
                  <div>
                    <p className={cn('text-[11px] font-semibold tracking-wider uppercase', isCombo ? 'text-gold-300' : 'text-gold-600')}>
                      {isCombo ? 'Combo package' : h.capacity >= 300 ? 'Big hall' : 'Small hall'}
                    </p>
                    <h3 className="font-display text-2xl font-semibold">{h.name}</h3>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex">
                    {[[Pencil, 'Edit hall', () => setHallForm({ ...h, isCombo }), ''], [Trash2, 'Delete hall', () => deleteHall(h), 'hover:text-rose-500']].map(([Icon, title, onClick, extra]) => (
                      <button key={title} onClick={onClick} title={title}
                        className={cn('cursor-pointer rounded-lg p-1.5 transition', isCombo ? 'text-ink-200 hover:bg-white/10 hover:text-white' : 'text-stone-400 hover:bg-stone-100 hover:text-ink-900', extra)}>
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {h.description && <p className={cn('relative mt-3 text-sm', isCombo ? 'text-ink-200' : 'text-stone-500')}>{h.description}</p>}
              {h.included && h.included.length > 0 && (
                <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={cn('text-[11px] font-medium', isCombo ? 'text-ink-300' : 'text-stone-400')}>Includes:</span>
                  {h.included.map(inc => (
                    <span key={inc.id} className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                      isCombo ? 'bg-white/15 text-white' : 'bg-white text-ink-900 border border-stone-200 shadow-2xs'
                    )}>
                      {inc.name} ({inc.capacity})
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mt-5 grid grid-cols-3 gap-3">
                {[
                  [<UsersIcon size={14} key="u" />, 'Capacity', `${h.capacity}`],
                  ['₹', 'Full day', inr(h.rate_full)],
                  ['½', 'Half day', inr(h.rate_half)],
                ].map(([icon, l, v]) => (
                  <div key={l} className={cn('rounded-2xl p-3', isCombo ? 'bg-white/5' : 'bg-white shadow-sm ring-1 ring-stone-200/70')}>
                    <p className={cn('flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase', isCombo ? 'text-ink-300' : 'text-stone-400')}>{icon} {l}</p>
                    <p className="mt-1 font-semibold">{v}</p>
                  </div>
                ))}
              </div>
              <div className={cn('relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 text-sm', isCombo ? 'bg-white/5' : 'bg-stone-50')}>
                <div className="min-w-0">
                  {h.today.length ? (
                    <p><Badge tone="rose" dot>Booked today</Badge> <span className="ml-1">{h.today.map(t => `${t.customer_name} (${SLOTS[t.slot]})`).join(', ')}</span></p>
                  ) : (
                    <p><Badge tone="green" dot>Free today</Badge>
                      <span className={cn('ml-2', isCombo ? 'text-ink-200' : 'text-stone-500')}>
                        {h.next ? `Next: ${h.next.customer_name} · ${relDay(h.next.event_date)}` : 'No upcoming events'}
                      </span>
                    </p>
                  )}
                </div>
                <Button size="sm" variant={isCombo ? 'gold' : 'primary'} icon={Plus} onClick={() => setForm({ hallId: h.id })}>Book</Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Event Categories Section (Dropdown + Add Button + Tag Cloud) */}
      <Card className="mt-8 overflow-hidden border border-stone-200">
        <div
          className="flex flex-wrap cursor-pointer items-center justify-between gap-3 p-4 transition hover:bg-stone-50/70 select-none"
          onClick={() => setEventsOpen(p => !p)}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold-100 text-gold-800">
              <PartyPopper size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-ink-900">Event Categories</h3>
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-800">
                  {eventTypesList.length} categories
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Options available for banquet hall event bookings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
            <span>{eventsOpen ? 'Hide categories' : 'Manage categories'}</span>
            <ChevronDown
              size={16}
              className={cn('text-stone-400 transition-transform duration-200', eventsOpen && 'rotate-180')}
            />
          </div>
        </div>

        {eventsOpen && (
          <div className="border-t border-stone-100 bg-stone-50/40 p-4 sm:p-5 space-y-4">
            {isAdmin && (
              <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-3.5 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-900 block">
                  Add New Event Type
                </label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 bg-white text-sm"
                    placeholder="e.g. Sangeet, Naming Ceremony, Anniversary…"
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEventType();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="gold"
                    icon={Plus}
                    loading={savingEvents}
                    onClick={handleAddEventType}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Active Tag Cloud */}
            <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                  Active Event Types ({eventTypesList.length}):
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleRestoreDefaultEventTypes}
                    className="cursor-pointer text-xs font-medium text-gold-700 hover:text-gold-900 hover:underline"
                  >
                    Restore default presets
                  </button>
                )}
              </div>

              {eventTypesList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 p-4 text-center text-xs text-stone-500">
                  No event types configured. {isAdmin ? 'Type a name above and click "Add".' : ''}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {eventTypesList.map(type => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-ink-900 transition hover:border-gold-300 hover:bg-gold-50/50"
                    >
                      <span>{type}</span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEventType(type)}
                          title={`Remove ${type}`}
                          className="cursor-pointer rounded-full p-0.5 text-stone-400 hover:bg-rose-100 hover:text-rose-600 transition"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          <div className="relative w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search customer or phone" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {filter === 'packages' ? (
          packagesList.length ? (
            <ComboTable combos={packagesList} onOpen={setSelectedPackageId} />
          ) : (
            <EmptyState
              icon={Sparkles}
              title={packagesApi.loading ? 'Loading combos…' : 'No combos found'}
              text={q ? 'No combos match your search.' : 'Book a hall, guest rooms and catering supplies on one combined bill.'}
              action={
                <Button variant="gold" icon={Sparkles} onClick={() => setBulkPackageModal(true)}>
                  New combo
                </Button>
              }
            />
          )
        ) : list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Customer</th>
                  <th className="th">Hall</th>
                  <th className="th">Event</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                  <th className="th text-right w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map(b => {
                  const due = b.total - b.paid;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailId(b.id)}
                      className="group cursor-pointer transition-colors duration-150 hover:bg-gold-50/80"
                    >
                      <td className="td whitespace-nowrap">
                        <p className="font-medium group-hover:text-gold-900 transition-colors">{fmtDate(b.event_date)}</p>
                        <p className="text-xs text-stone-500">{SLOTS[b.slot]} · {relDay(b.event_date)}</p>
                      </td>
                      <td className="td">
                        <p className="font-medium text-ink-900 group-hover:text-gold-900 transition-colors">{b.customer_name}</p>
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
          <EmptyState icon={PartyPopper} title={bookings.loading ? 'Loading…' : 'No events found'}
            text={q ? 'Try a different name or phone number.' : 'Book a hall for a wedding, party or function.'}
            action={!q && !bookings.loading && <Button variant="gold" icon={CalendarDays} onClick={() => setForm({})}>New booking</Button>} />
        )}
      </Card>

      {bulkPackageModal && (
        <BulkPackageModal
          onClose={() => setBulkPackageModal(false)}
          onSaved={createdPackage => {
            setBulkPackageModal(false);
            refresh();
            setFilter('packages');
            if (createdPackage) {
              setWaPackage(createdPackage);
            }
          }}
        />
      )}

      {selectedPackageId && (
        <PackageDetailModal
          packageId={selectedPackageId}
          onClose={() => setSelectedPackageId(null)}
          onRefresh={refresh}
          onShareWa={pkg => setWaPackage(pkg)}
        />
      )}

      {waPackage && (
        <WhatsAppModal
          kind="package"
          booking={waPackage}
          onClose={() => setWaPackage(null)}
        />
      )}

      {form && (
        <HallBookingForm booking={form.booking} halls={halls.data} defaultHallId={form.hallId} defaultDate={form.date}
          onClose={() => setForm(null)}
          onSaved={saved => { setForm(null); refresh(); setDetailId(saved.id); }} />
      )}
      {detailId && !form && (
        <BookingDetail kind="hall" id={detailId} onClose={() => setDetailId(null)} onChanged={refresh}
          onEdit={b => setForm({ booking: b })} />
      )}
      {hallForm && <HallForm hall={hallForm} allHalls={halls.data} onClose={() => setHallForm(null)} onSaved={() => { setHallForm(null); refresh(); }} />}
    </>
  );
}

function HallForm({ hall, allHalls = [], onClose, onSaved }) {
  const { toast } = useUI();
  const isCombo = Boolean(hall?.isCombo || hall?.is_combo || /combo/i.test(hall?.name || ''));
  // Only individual standalone halls can be part of a combo
  const baseHalls = allHalls.filter(h => !h.is_combo && !/combo/i.test(h.name));

  const [selectedHallIds, setSelectedHallIds] = useState(() => {
    if (hall?.included_hall_ids) {
      try {
        const ids = typeof hall.included_hall_ids === 'string'
          ? JSON.parse(hall.included_hall_ids)
          : hall.included_hall_ids;
        if (Array.isArray(ids) && ids.length) return ids.map(Number);
      } catch {}
    }
    // For a brand new combo: if standalone halls exist, pre-select them for convenience
    if (isCombo && baseHalls.length >= 2 && !hall?.id) {
      return baseHalls.map(h => h.id);
    }
    return [];
  });

  const selectedHalls = baseHalls.filter(h => selectedHallIds.includes(h.id));
  const combinedCapacity = selectedHalls.reduce((s, h) => s + (Number(h.capacity) || 0), 0);
  const combinedFullRate = selectedHalls.reduce((s, h) => s + (Number(h.rate_full) || 0), 0);
  const combinedHalfRate = selectedHalls.reduce((s, h) => s + (Number(h.rate_half) || 0), 0);

  // Track if user manually typed custom values
  const [customName, setCustomName] = useState(Boolean(hall?.id && hall?.name));
  const [customRateFull, setCustomRateFull] = useState(Boolean(hall?.id && hall?.rate_full));
  const [customRateHalf, setCustomRateHalf] = useState(Boolean(hall?.id && hall?.rate_half));

  const [f, setF] = useState(() => {
    if (hall?.id) {
      return {
        name: hall.name || '',
        capacity: hall.capacity || (isCombo ? combinedCapacity : 100),
        rate_full: hall.rate_full ?? 0,
        rate_half: hall.rate_half ?? 0,
        description: hall.description || '',
      };
    }
    const defaultName = isCombo && selectedHalls.length
      ? `${selectedHalls.map(h => h.name.replace(/Banquet|Hall/gi, '').trim()).join(' + ')} Combo`
      : '';
    const defaultDesc = isCombo && selectedHalls.length
      ? `Combo package combining ${selectedHalls.map(h => h.name).join(' & ')}`
      : '';
    return {
      name: defaultName,
      capacity: isCombo ? (combinedCapacity || 100) : 100,
      rate_full: isCombo && combinedFullRate ? Math.round(combinedFullRate * 0.85) : 0,
      rate_half: isCombo && combinedHalfRate ? Math.round(combinedHalfRate * 0.85) : 0,
      description: defaultDesc,
    };
  });

  const [saving, save] = useSave('/halls', hall?.id, isCombo ? 'Combo package' : 'Hall', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Helper to recompute derived fields dynamically when selected halls change
  const applyHallSelection = nextIds => {
    setSelectedHallIds(nextIds);
    const nextSelected = baseHalls.filter(h => nextIds.includes(h.id));
    const nextCap = nextSelected.reduce((s, h) => s + (Number(h.capacity) || 0), 0);
    const nextFull = nextSelected.reduce((s, h) => s + (Number(h.rate_full) || 0), 0);
    const nextHalf = nextSelected.reduce((s, h) => s + (Number(h.rate_half) || 0), 0);

    setF(prev => {
      const updated = { ...prev };
      // Always update capacity when halls change unless user wants to keep a specific cap
      updated.capacity = nextCap > 0 ? nextCap : 100;

      // Auto update name if user hasn't explicitly customized it
      if (!customName) {
        updated.name = nextSelected.length > 0
          ? `${nextSelected.map(h => h.name.replace(/Banquet|Hall/gi, '').trim()).join(' + ')} Combo`
          : '';
        updated.description = nextSelected.length > 0
          ? `Combo package combining ${nextSelected.map(h => h.name).join(' & ')}`
          : '';
      }

      // Auto update package rates with 15% discount if user hasn't typed custom rates
      if (!customRateFull) {
        updated.rate_full = nextFull > 0 ? Math.round(nextFull * 0.85) : 0;
      }
      if (!customRateHalf) {
        updated.rate_half = nextHalf > 0 ? Math.round(nextHalf * 0.85) : 0;
      }

      return updated;
    });
  };

  const toggleHall = id => {
    const nextIds = selectedHallIds.includes(id)
      ? selectedHallIds.filter(x => x !== id)
      : [...selectedHallIds, id];
    applyHallSelection(nextIds);
  };

  const selectAllHalls = selectAll => {
    const nextIds = selectAll ? baseHalls.map(h => h.id) : [];
    applyHallSelection(nextIds);
  };

  const applyDiscountPercent = pct => {
    if (combinedFullRate > 0) {
      setCustomRateFull(true);
      set('rate_full', Math.round(combinedFullRate * (1 - pct / 100)));
    }
    if (combinedHalfRate > 0) {
      setCustomRateHalf(true);
      set('rate_half', Math.round(combinedHalfRate * (1 - pct / 100)));
    }
  };

  const handleSubmit = e => {
    e?.preventDefault?.();
    if (saving) return;

    const trimmedName = (f.name || '').trim();
    if (!trimmedName) {
      return toast(isCombo ? 'Please enter a combo package name' : 'Please enter a hall name', 'error');
    }

    if (isCombo) {
      if (selectedHallIds.length < 2) {
        return toast('Please select at least 2 halls for a combo package', 'error');
      }
      save({
        ...f,
        name: trimmedName,
        is_combo: 1,
        included_hall_ids: selectedHallIds,
        capacity: Number(f.capacity) || combinedCapacity || 100,
        rate_full: Number(f.rate_full) || 0,
        rate_half: Number(f.rate_half) || 0,
      });
    } else {
      save({
        ...f,
        name: trimmedName,
        is_combo: 0,
        included_hall_ids: '',
        capacity: Number(f.capacity) || 100,
        rate_full: Number(f.rate_full) || 0,
        rate_half: Number(f.rate_half) || 0,
      });
    }
  };

  return (
    <Modal
      size={isCombo ? 'lg' : 'md'}
      title={hall?.id ? (isCombo ? 'Edit combo package' : 'Edit hall') : (isCombo ? 'Add combo package' : 'Add hall')}
      subtitle={isCombo ? 'Select existing halls to dynamically combine into a package booking' : 'Configure banquet hall capacity and slot tariffs'}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="gold"
            loading={saving}
            onClick={handleSubmit}
          >
            {hall?.id ? 'Save changes' : isCombo ? 'Create combo package' : 'Create hall'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dynamic Hall Selection for Combos */}
        {isCombo && (
          <div className="space-y-3.5 rounded-2xl border border-gold-200 bg-gold-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
                  <Layers size={16} className="text-gold-600" />
                  Select Halls to Include in this Combo
                </h4>
                <p className="text-xs text-stone-500">
                  Select 2 or more standalone halls. Booking this combo automatically reserves all selected halls.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-bold text-gold-800">
                  {selectedHallIds.length} of {baseHalls.length} selected
                </span>
                {baseHalls.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => selectAllHalls(true)}
                      className="cursor-pointer text-xs font-medium text-gold-700 hover:text-gold-900 hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-stone-300">·</span>
                    <button
                      type="button"
                      onClick={() => selectAllHalls(false)}
                      className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-800 hover:underline"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {baseHalls.length === 0 ? (
              <p className="text-xs text-stone-500">No standalone halls exist yet. Create individual halls first.</p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {baseHalls.map(bh => {
                  const isSelected = selectedHallIds.includes(bh.id);
                  return (
                    <button
                      type="button"
                      key={bh.id}
                      onClick={() => toggleHall(bh.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between rounded-xl border p-3.5 text-left transition select-none',
                        isSelected
                          ? 'border-gold-500 bg-white shadow-xs ring-2 ring-gold-400'
                          : 'border-stone-200 bg-white/70 hover:border-stone-300 hover:bg-white'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'grid h-5 w-5 shrink-0 place-items-center rounded border transition',
                            isSelected ? 'border-gold-600 bg-gold-600 text-white' : 'border-stone-300 bg-white text-transparent'
                          )}
                        >
                          <Check size={13} className={isSelected ? 'stroke-[3]' : ''} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 text-sm truncate">{bh.name}</p>
                          <p className="text-xs text-stone-500">Up to {bh.capacity} guests</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-gold-800">Full: {inr(bh.rate_full)}</p>
                        <p className="text-[11px] text-stone-500">Half: {inr(bh.rate_half)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Combined Tariff & Capacity Live Summary Box */}
            {selectedHalls.length > 0 && (
              <div className="rounded-xl border border-gold-200 bg-white p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                  <div>
                    <span className="font-semibold text-ink-900">Combined Capacity:</span>{' '}
                    <span className="text-gold-700 font-bold">{combinedCapacity} guests</span>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-900">Regular Total:</span>{' '}
                    <span className="text-stone-600 font-medium">Full {inr(combinedFullRate)} · Half {inr(combinedHalfRate)}</span>
                  </div>
                </div>

                {/* Quick Discount Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] font-medium text-stone-500">Quick rate presets:</span>
                  {[
                    { label: 'Regular sum (0% off)', pct: 0 },
                    { label: '10% off', pct: 10 },
                    { label: '15% off', pct: 15 },
                    { label: '20% off', pct: 20 },
                  ].map(btn => (
                    <button
                      key={btn.pct}
                      type="button"
                      onClick={() => applyDiscountPercent(btn.pct)}
                      className="cursor-pointer rounded-md bg-stone-100 hover:bg-gold-100 hover:text-gold-900 px-2 py-0.5 text-[11px] font-medium text-stone-700 transition"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isCombo ? 'Combo Package Name' : 'Hall name'} className="sm:col-span-2">
            <Input
              required
              value={f.name}
              onChange={e => {
                setCustomName(true);
                set('name', e.target.value);
              }}
              placeholder={isCombo ? 'e.g. Both Halls Combo or Big + Small Combo' : 'e.g. Big Banquet Hall'}
            />
          </Field>

          <Field
            label="Total Capacity (guests)"
            hint={isCombo ? `Sum of selected halls: ${combinedCapacity} guests` : undefined}
          >
            <Input
              type="number"
              min="1"
              value={f.capacity}
              onChange={e => set('capacity', e.target.value)}
            />
          </Field>

          <div />

          <Field
            label="Full day package rate (₹)"
            hint={isCombo && combinedFullRate > 0 && Number(f.rate_full) < combinedFullRate
              ? `Discounted: saves ${inr(combinedFullRate - Number(f.rate_full))}`
              : 'Flat full day rate'}
          >
            <Input
              type="number"
              min="0"
              value={f.rate_full}
              onChange={e => {
                setCustomRateFull(true);
                set('rate_full', e.target.value);
              }}
            />
          </Field>

          <Field
            label="Half day package rate (₹)"
            hint={isCombo && combinedHalfRate > 0 && Number(f.rate_half) < combinedHalfRate
              ? `Discounted: saves ${inr(combinedHalfRate - Number(f.rate_half))}`
              : 'Morning or evening slot'}
          >
            <Input
              type="number"
              min="0"
              value={f.rate_half}
              onChange={e => {
                setCustomRateHalf(true);
                set('rate_half', e.target.value);
              }}
            />
          </Field>

          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={f.description}
              onChange={e => set('description', e.target.value)}
              placeholder={isCombo ? 'e.g. Combo package combining Big and Small banquet halls' : 'Hall features and details'}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
