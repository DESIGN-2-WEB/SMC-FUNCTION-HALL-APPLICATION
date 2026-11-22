import { useMemo, useRef, useState } from 'react';
import { Ban, Camera, CheckCircle2, Flower2, ImagePlus, ListChecks, Pencil, Plus, Printer, RotateCcw, Tags, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove } from '../hooks.js';
import { Badge, Button, Card, EmptyState, Field, Form, Input, Modal, Segmented, Textarea, cn, useUI } from './ui.jsx';
import { Combobox, DatePicker, Select } from './pickers.jsx';
import { esc, fmtDate, inr, today } from '../utils.js';
import WhatsAppModal, { WhatsAppIcon } from './WhatsAppModal.jsx';
import { makePhoto } from '../imageResize.js';

/*
 * Decorations page (its own menu item): plan and price the decoration of each area of the hall
 * (stage, entrance, walkway, photo booths, staircase...) for an event. Prices come from our own
 * price list; the server works out every amount again when a plan is saved.
 */

const DEFAULT_DECOR_AREAS = ['Stage', 'Entrance', 'Walkway', 'Photo booths', 'Main outdoor staircase'];

export const decorAreas = settings =>
  (settings.decor_areas ? settings.decor_areas.split(',') : DEFAULT_DECOR_AREAS).map(s => s.trim()).filter(Boolean);

const STATUS = {
  planned: { label: 'Planned', tone: 'gold' },
  done: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'stone' },
};

const plansAreas = items => [...new Set((items || []).map(i => i.area))];
const n = v => Math.max(0, Number(v) || 0);

export default function DecorationsTab({ isAdmin, settings, reloadSettings, hallBookings }) {
  const { toast, confirm } = useUI();
  const remove = useRemove();
  const plansApi = useApi('/decorations/plans');
  const itemsApi = useApi('/decorations/items');
  const [filter, setFilter] = useState('planned');
  const [editing, setEditing] = useState(null); // plan object, or {} for a new plan
  const [priceList, setPriceList] = useState(false);
  const [share, setShare] = useState(null);

  const areas = decorAreas(settings);
  const plans = plansApi.data || [];
  const shown = filter === 'planned' ? plans.filter(p => p.status === 'planned') : plans;
  const plannedValue = plans.filter(p => p.status === 'planned').reduce((s, p) => s + n(p.total), 0);

  const setStatus = async (p, status) => {
    const words = { done: 'Mark this decoration as done?', cancelled: 'Cancel this decoration plan?', planned: 'Reopen this plan?' };
    if (!(await confirm({ title: words[status], message: `${p.customer_name} · ${fmtDate(p.event_date)}`, danger: status === 'cancelled', confirmText: 'Yes' }))) return;
    try {
      await api(`/decorations/plans/${p.id}/status`, { method: 'PATCH', body: { status } });
      toast(status === 'done' ? 'Marked as done' : status === 'cancelled' ? 'Plan cancelled' : 'Plan reopened');
      plansApi.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const deletePlan = p => remove(`/decorations/plans/${p.id}`, {
    title: 'Delete this decoration plan?',
    message: `${p.customer_name} · ${fmtDate(p.event_date)}. This cannot be undone.`,
    success: 'Plan deleted',
    done: plansApi.reload,
  });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900">Decoration plans</h3>
            <p className="text-xs text-stone-500">
              {plans.filter(p => p.status === 'planned').length} planned · {inr(plannedValue)} to decorate
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={filter} onChange={setFilter}
              options={[{ value: 'planned', label: 'Planned' }, { value: 'all', label: 'All' }]} />
            {isAdmin && <Button variant="outline" icon={Tags} onClick={() => setPriceList(true)}>Price list</Button>}
            <Button variant="gold" icon={Plus} onClick={() => setEditing({})}>Plan decoration</Button>
          </div>
        </div>

        {!plansApi.data ? (
          <p className="p-6 text-sm text-stone-500">Loading…</p>
        ) : shown.length ? (
          <div className="divide-y divide-stone-100">
            {shown.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{p.customer_name}</span>
                    <Badge tone={STATUS[p.status]?.tone}>{STATUS[p.status]?.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {fmtDate(p.event_date)}{p.event_name ? ` · ${p.event_name}` : ''}{p.hall_name ? ` · ${p.hall_name}` : ''} · Bill {p.bill_no || '—'}
                    {p.combo_bill_no && <> · <b className="text-gold-800">on combined bill {p.combo_bill_no}</b></>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plansAreas(p.items).map(a => (
                      <span key={a} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">{a}</span>
                    ))}
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 sm:block sm:w-auto sm:text-right">
                  <p className="font-display text-lg font-semibold text-ink-900">{inr(p.total)}</p>
                  {n(p.discount) > 0 && <p className="text-[11px] text-stone-400">after {inr(p.discount)} discount</p>}
                </div>
                <div className="row-actions flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                  {(p.status === 'planned' || isAdmin) && (
                    <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(p)}>Edit</Button>
                  )}
                  <Button size="sm" variant="outline" icon={WhatsAppIcon} onClick={() => setShare(p)}>Quote</Button>
                  <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDecorPlan(p, settings)} aria-label="Print" title="Print" />
                  {p.status === 'planned' ? (
                    <>
                      <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => setStatus(p, 'done')}>Done</Button>
                      <Button size="sm" variant="danger-soft" icon={Ban} onClick={() => setStatus(p, 'cancelled')} aria-label="Cancel plan" title="Cancel plan" />
                    </>
                  ) : isAdmin && (
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setStatus(p, 'planned')}>Reopen</Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="danger-soft" icon={Trash2} onClick={() => deletePlan(p)} aria-label="Delete plan" title="Delete plan" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Flower2} title={filter === 'planned' ? 'No decorations planned' : 'No decoration plans yet'}
            text="Plan the stage, entrance, walkway, photo booths and staircase for an event and see the total."
            action={<Button variant="gold" icon={Plus} onClick={() => setEditing({})}>Plan decoration</Button>} />
        )}
      </Card>

      {editing && (
        <PlanModal plan={editing} areas={areas} priceItems={itemsApi.data || []} hallBookings={hallBookings}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); plansApi.reload(); }} />
      )}
      {priceList && (
        <PriceListModal areas={areas} items={itemsApi.data || []} settings={settings}
          onChanged={() => itemsApi.reload()} reloadSettings={reloadSettings}
          onClose={() => setPriceList(false)} />
      )}
      {share && <WhatsAppModal kind="decor" booking={share} onClose={() => setShare(null)} />}
    </>
  );
}

/* ---------- Plan form ---------- */

const newLine = (area, item) => ({
  key: Math.random().toString(36).slice(2),
  area,
  name: item?.name || '',
  unit: item?.unit || 'pcs',
  qty: 1,
  rate: item ? n(item.price) : 0,
});

const decorLineAmount = l => Math.round(n(l.qty) * n(l.rate) * 100) / 100;
export const decorSubtotal = lines => lines.reduce((s, l) => s + (l.name ? decorLineAmount(l) : 0), 0);
const toDecorLines = items => (items || []).map(l => ({ ...newLine(l.area), ...l }));
/** The lines as sent to the server (empty rows dropped; the server prices them again). */
export const decorItemsPayload = lines => lines.filter(l => l.name.trim())
  .map(({ area, name, unit, qty, rate }) => ({ area, name: name.trim(), unit, qty: n(qty), rate: n(rate) }));

/**
 * Area chips (Stage, Entrance...) and, for each ticked area, its items with quantity and rate.
 * Shared by the Decorations page and the hall booking form.
 */
export function DecorLinesEditor({ areas, priceItems, lines, setLines }) {
  const { toast } = useUI();
  // Areas shown: the ones the lines already use, plus any ticked
  const [open, setOpen] = useState(() => plansAreas(lines));
  const allAreas = useMemo(() => [...new Set([...areas, ...plansAreas(lines)])], [areas, lines]);
  const byArea = area => priceItems.filter(i => i.area === area);

  const toggleArea = area => {
    if (open.includes(area)) {
      if (lines.some(l => l.area === area && l.name)) return toast(`Remove the ${area} items first`, 'error');
      setOpen(o => o.filter(a => a !== area));
      setLines(ls => ls.filter(l => l.area !== area));
    } else {
      setOpen(o => [...o, area]);
      // With designs in the price list, the user picks from their photos; otherwise an empty row
      if (!byArea(area).length) setLines(ls => [...ls, newLine(area)]);
    }
  };

  const updateLine = (key, patch) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  // A design is a type (Stage type 1, type 2...), taken once: tapping it adds it, tapping again takes it out
  const isAdded = (area, item) => lines.some(l => l.area === area && l.name.toLowerCase() === item.name.toLowerCase());
  const addDesign = (area, item) => setLines(ls => (
    ls.some(l => l.area === area && l.name.toLowerCase() === item.name.toLowerCase())
      ? ls.filter(l => !(l.area === area && l.name.toLowerCase() === item.name.toLowerCase()))
      : [...ls, newLine(area, item)]
  ));
  const [viewing, setViewing] = useState(null); // price-list item whose large photo is open
  const thumbOf = (area, name) => byArea(area).find(i => i.name.toLowerCase() === String(name).toLowerCase() && i.thumb);
  const pickName = (l, name) => {
    const item = byArea(l.area).find(i => i.name.toLowerCase() === name.toLowerCase());
    updateLine(l.key, item ? { name: item.name, unit: item.unit, rate: n(item.price) } : { name });
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="label">Areas to decorate</span>
        <div className="flex flex-wrap gap-2">
          {allAreas.map(a => {
            const on = open.includes(a);
            return (
              <button key={a} type="button" onClick={() => toggleArea(a)} aria-pressed={on}
                className={cn('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  on ? 'border-ink-900 bg-ink-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-gold-300')}>
                {on ? '✓ ' : '+ '}{a}
              </button>
            );
          })}
        </div>
      </div>

      {open.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-200 p-4 text-center text-sm text-stone-500">
          Tap an area above to start adding items.
        </p>
      )}

      {open.map(area => {
        const rows = lines.filter(l => l.area === area);
        const sub = rows.reduce((s, l) => s + (l.name ? decorLineAmount(l) : 0), 0);
        const names = byArea(area).map(i => i.name);
        return (
          <div key={area} className="rounded-2xl border border-stone-200">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
              <span className="font-semibold text-ink-900">{area}</span>
              <span className="text-sm font-semibold text-ink-900">{inr(sub)}</span>
            </div>
            <div className="space-y-2 p-3">
              {/* The designs of this area from the price list: photo, name and price. Tap to add. */}
              {byArea(area).length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-2 pb-2">
                  {byArea(area).map(item => (
                    <div key={item.id} className={cn('overflow-hidden rounded-xl border bg-white', isAdded(area, item) ? 'border-ink-900 ring-1 ring-ink-900' : 'border-stone-200')}>
                      <button type="button" onClick={() => (item.has_photo ? setViewing(item) : addDesign(area, item))}
                        className="block aspect-[4/3] w-full cursor-pointer bg-stone-100" aria-label={item.has_photo ? `See photo of ${item.name}` : `Add ${item.name}`}>
                        {item.thumb
                          ? <img src={item.thumb} alt={item.name} className="h-full w-full object-cover" />
                          : <span className="grid h-full place-items-center text-stone-300"><Flower2 size={22} /></span>}
                      </button>
                      <div className="p-2">
                        <p className="truncate text-xs font-semibold text-ink-900" title={item.name}>{item.name}</p>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="text-xs text-stone-600">{inr(item.price)}</span>
                          <button type="button" onClick={() => addDesign(area, item)} aria-pressed={isAdded(area, item)}
                            className={cn('cursor-pointer rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                              isAdded(area, item) ? 'bg-ink-900 text-white' : 'bg-gold-100 text-gold-900 hover:bg-gold-200')}>
                            {isAdded(area, item) ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rows.map(l => (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {thumbOf(area, l.name) && (
                      <button type="button" onClick={() => setViewing(thumbOf(area, l.name))} className="h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg"
                        aria-label={`See photo of ${l.name}`}>
                        <img src={thumbOf(area, l.name).thumb} alt="" className="h-full w-full object-cover" />
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <Combobox value={l.name} onChange={v => pickName(l, v)} options={names} placeholder="Type, e.g. Stage type 1" />
                      {n(l.qty) !== 1 && <p className="mt-0.5 text-[11px] text-stone-400">× {l.qty} (from an older plan)</p>}
                    </div>
                  </div>
                  <label className="block">
                    <span className="sr-only">Price</span>
                    <Input type="number" min="0" step="any" value={l.rate} onChange={e => updateLine(l.key, { rate: e.target.value })} aria-label="Price" placeholder="₹ price" />
                  </label>
                  <button type="button" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}
                    className="grid h-10 w-9 cursor-pointer place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove item" title="Remove item">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setLines(ls => [...ls, newLine(area)])}
                className="cursor-pointer text-xs font-medium text-gold-700 hover:text-gold-900 hover:underline">
                + Add another {area.toLowerCase()} type by name
              </button>
            </div>
          </div>
        );
      })}
      {viewing && <DecorPhotoViewer item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** The large photo of a price-list design, fetched when opened. */
function DecorPhotoViewer({ item, onClose }) {
  const big = useApi(`/decorations/items/${item.id}/photo`);
  return (
    <Modal size="lg" onClose={onClose} title={item.name} subtitle={`${item.area} · ${inr(item.price)}`}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {big.data?.photo
        ? <img src={big.data.photo} alt={item.name} className="mx-auto max-h-[65vh] w-auto rounded-xl" />
        : <img src={item.thumb} alt={item.name} className="mx-auto max-h-[65vh] w-auto rounded-xl opacity-80" />}
    </Modal>
  );
}

/** Square photo slot: shows the picture, picks a new one, and can remove it. */
function PhotoSlot({ thumb, onPick, onRemove, onView, busy }) {
  const input = useRef(null);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <button type="button" disabled={busy} onClick={() => (thumb && onView ? onView() : input.current?.click())}
        className="grid h-full w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-stone-300 bg-stone-50 text-stone-400 hover:border-gold-400 hover:text-gold-700"
        aria-label={thumb ? 'See photo' : 'Add photo'} title={thumb ? 'See photo' : 'Add photo'}>
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" />
          : <span className="flex flex-col items-center text-[10px] font-medium"><ImagePlus size={18} />Photo</span>}
      </button>
      {thumb && (
        <>
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="absolute -bottom-1 -left-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-white text-stone-600 shadow ring-1 ring-stone-200 hover:text-gold-700"
            aria-label="Change photo" title="Change photo"><Camera size={12} /></button>
          {onRemove && (
            <button type="button" onClick={onRemove} disabled={busy}
              className="absolute -top-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-white text-stone-500 shadow ring-1 ring-stone-200 hover:text-rose-600"
              aria-label="Remove photo" title="Remove photo"><X size={12} /></button>
          )}
        </>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </div>
  );
}

function PlanModal({ plan, areas, priceItems, hallBookings, onClose, onSaved }) {
  const { toast } = useUI();
  const editing = !!plan.id;
  const [f, setF] = useState(() => ({
    hall_booking_id: plan.hall_booking_id || '',
    customer_name: plan.customer_name || '',
    phone: plan.phone || '',
    event_name: plan.event_name || '',
    event_date: plan.event_date || today(),
    discount: plan.discount || '',
    notes: plan.notes || '',
  }));
  const [lines, setLines] = useState(() => toDecorLines(plan.items));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const linkBooking = id => {
    set('hall_booking_id', id);
    const b = hallBookings.find(x => String(x.id) === String(id));
    if (b) setF(p => ({ ...p, hall_booking_id: id, customer_name: b.customer_name, phone: b.phone || '', event_name: b.event_type || p.event_name, event_date: b.event_date }));
  };

  const subtotal = decorSubtotal(lines);
  const discount = Math.min(subtotal, n(f.discount));
  const total = subtotal - discount;

  const save = async () => {
    const items = decorItemsPayload(lines);
    if (!items.length) return toast('Add at least one decoration item', 'error');
    setSaving(true);
    try {
      const saved = await api(editing ? `/decorations/plans/${plan.id}` : '/decorations/plans', {
        method: editing ? 'PUT' : 'POST',
        body: { ...f, hall_booking_id: f.hall_booking_id || null, discount: n(f.discount), items },
      });
      toast(saved.combo_bill_no ? `${editing ? 'Updated' : 'Planned'} · on the hall's combined bill ${saved.combo_bill_no}` : editing ? 'Decoration plan updated' : 'Decoration planned');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  const bookingOptions = [
    { value: '', label: 'No booking (quote only)' },
    ...hallBookings.map(b => ({ value: b.id, label: `${b.customer_name} · ${fmtDate(b.event_date)}`, hint: [b.hall_name, b.event_type, b.bill_no].filter(Boolean).join(' · ') })),
  ];

  return (
    <Modal size="lg" onClose={onClose}
      title={editing ? 'Edit decoration plan' : 'Plan decoration'}
      subtitle="Pick the areas, then a type for each. Prices come from your price list and can be changed here."
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-500">Total <span className="font-display text-lg font-semibold text-ink-900">{inr(total)}</span></p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="decor-plan" variant="gold" loading={saving}>{editing ? 'Save changes' : 'Save plan'}</Button>
          </div>
        </div>
      )}>
      <Form id="decor-plan" onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Banquet booking" className="sm:col-span-2" as="div">
            <Select value={f.hall_booking_id} onChange={linkBooking} options={bookingOptions} placeholder="No booking (quote only)" />
          </Field>
          <Field label="Customer name">
            <Input required value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Ravi Kumar" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="94411 17278" />
          </Field>
          <Field label="Function">
            <Input value={f.event_name} onChange={e => set('event_name', e.target.value)} placeholder="Wedding" />
          </Field>
          <Field label="Event date" as="div">
            <DatePicker value={f.event_date} onChange={v => set('event_date', v)} />
          </Field>
        </div>

        <DecorLinesEditor areas={areas} priceItems={priceItems} lines={lines} setLines={setLines} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discount (₹)" hint={`Items total ${inr(subtotal)}`}>
            <Input type="number" min="0" step="any" value={f.discount} onChange={e => set('discount', e.target.value)} placeholder="0" />
          </Field>
          <Field label="Notes">
            <Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Colours, flower types, timing…" />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

/* ---------- Price list (admin) ---------- */

function PriceListModal({ areas, items, onChanged, reloadSettings, onClose }) {
  const { toast, confirm } = useUI();
  const [newArea, setNewArea] = useState('');
  const [drafts, setDrafts] = useState({}); // area -> { name, unit, price, photo, thumb }
  const [edits, setEdits] = useState({}); // id -> { name, unit, price }
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(null); // item id (or 'new:area') while a photo is saved
  const [viewing, setViewing] = useState(null);

  // A photo saves straight away for an item already in the list
  const savePhoto = async (item, file) => {
    setPhotoBusy(item.id);
    try {
      const pic = file ? await makePhoto(file) : { photo: '', thumb: '' };
      await api(`/decorations/items/${item.id}`, { method: 'PUT', body: { area: item.area, name: item.name, unit: item.unit, price: n(item.price), ...pic } });
      toast(file ? 'Photo saved' : 'Photo removed');
      onChanged();
    } catch (err) { toast(err.message, 'error'); }
    setPhotoBusy(null);
  };
  const draftPhoto = async (area, file) => {
    setPhotoBusy(`new:${area}`);
    try {
      const pic = await makePhoto(file);
      setDrafts(p => ({ ...p, [area]: { ...(p[area] || {}), ...pic } }));
    } catch (err) { toast(err.message, 'error'); }
    setPhotoBusy(null);
  };

  const saveAreas = async list => {
    await api('/settings', { method: 'PUT', body: { decor_areas: list.join(', ') } });
    await reloadSettings();
  };

  const addArea = async () => {
    const a = newArea.trim();
    if (!a) return toast('Type the area name first', 'error');
    if (a.includes(',')) return toast('An area name cannot have a comma', 'error');
    if (areas.some(x => x.toLowerCase() === a.toLowerCase())) return toast(`"${a}" is already an area`, 'error');
    setBusy(true);
    try { await saveAreas([...areas, a]); setNewArea(''); toast(`Added ${a}`); } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const removeArea = async a => {
    if (items.some(i => i.area === a)) return toast(`Delete the items in ${a} first`, 'error');
    if (!(await confirm({ title: `Remove the ${a} area?`, message: 'Plans already made keep their items.', danger: true, confirmText: 'Remove' }))) return;
    try { await saveAreas(areas.filter(x => x !== a)); toast(`Removed ${a}`); } catch (err) { toast(err.message, 'error'); }
  };

  const addItem = async area => {
    const d = drafts[area] || {};
    if (!d.name?.trim()) return toast('Type the item name first', 'error');
    try {
      await api('/decorations/items', { method: 'POST', body: { area, name: d.name, unit: d.unit || 'pcs', price: n(d.price), ...(d.photo ? { photo: d.photo, thumb: d.thumb } : {}) } });
      setDrafts(p => ({ ...p, [area]: {} }));
      onChanged();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveItem = async item => {
    const e = edits[item.id];
    try {
      await api(`/decorations/items/${item.id}`, { method: 'PUT', body: { area: item.area, name: e.name, unit: e.unit, price: n(e.price) } });
      setEdits(p => { const c = { ...p }; delete c[item.id]; return c; });
      toast('Saved');
      onChanged();
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteItem = async item => {
    if (!(await confirm({ title: `Delete ${item.name}?`, message: 'Plans already made keep this item.', danger: true, confirmText: 'Delete' }))) return;
    try { await api(`/decorations/items/${item.id}`, { method: 'DELETE' }); onChanged(); } catch (err) { toast(err.message, 'error'); }
  };

  const allAreas = [...new Set([...areas, ...items.map(i => i.area)])];

  return (
    <Modal size="lg" onClose={onClose} title="Decoration price list"
      subtitle="Each type with its photo, name and the price you charge, e.g. Stage type 1. Plans start with these."
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {viewing && <DecorPhotoViewer item={viewing} onClose={() => setViewing(null)} />}
      <div className="space-y-5">
        <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-3.5">
          <span className="label">Add an area</span>
          <div className="flex gap-2">
            <Input className="flex-1 bg-white" value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Corridor"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }} />
            <Button variant="gold" icon={Plus} loading={busy} onClick={addArea}>Add</Button>
          </div>
        </div>

        {allAreas.map(area => {
          const rows = items.filter(i => i.area === area);
          const d = drafts[area] || {};
          const setD = (k, v) => setDrafts(p => ({ ...p, [area]: { ...(p[area] || {}), [k]: v } }));
          return (
            <div key={area} className="rounded-2xl border border-stone-200">
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
                <span className="flex items-center gap-2 font-semibold text-ink-900"><ListChecks size={16} className="text-gold-600" />{area}</span>
                {areas.includes(area) && (
                  <button type="button" onClick={() => removeArea(area)} className="cursor-pointer text-xs text-stone-400 hover:text-rose-600">Remove area</button>
                )}
              </div>
              <div className="space-y-2 p-3">
                {rows.length === 0 && <p className="text-xs text-stone-400">No items yet.</p>}
                {rows.map(item => {
                  const e = edits[item.id];
                  const val = e || { name: item.name, unit: item.unit, price: item.price };
                  const change = (k, v) => setEdits(p => ({ ...p, [item.id]: { ...val, [k]: v } }));
                  return (
                    <div key={item.id} className="flex items-start gap-2">
                      <PhotoSlot thumb={item.thumb} busy={photoBusy === item.id} onPick={f => savePhoto(item, f)}
                        onRemove={item.thumb ? () => savePhoto(item, null) : null} onView={() => setViewing(item)} />
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                        <Input className="col-span-2 sm:col-span-1" value={val.name} onChange={ev => change('name', ev.target.value)} aria-label="Type name" />
                        <Input className="col-span-2 sm:col-span-1" type="number" min="0" step="any" value={val.price} onChange={ev => change('price', ev.target.value)} aria-label="Price" placeholder="₹ price" />
                      </div>
                      {e ? (
                        <Button size="sm" variant="gold" onClick={() => saveItem(item)}>Save</Button>
                      ) : (
                        <button type="button" onClick={() => deleteItem(item)} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${item.name}`} title="Delete">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-start gap-2 border-t border-dashed border-stone-200 pt-2">
                  <PhotoSlot thumb={d.thumb} busy={photoBusy === `new:${area}`} onPick={f => draftPhoto(area, f)}
                    onRemove={d.thumb ? () => setDrafts(p => ({ ...p, [area]: { ...(p[area] || {}), photo: '', thumb: '' } })) : null} />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <Input className="col-span-2 sm:col-span-1" value={d.name || ''} onChange={ev => setD('name', ev.target.value)} placeholder={`New type, e.g. ${area} type 1`} aria-label="New type name"
                      onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addItem(area); } }} />
                    <Input className="col-span-2 sm:col-span-1" type="number" min="0" step="any" value={d.price || ''} onChange={ev => setD('price', ev.target.value)} placeholder="₹ price" aria-label="New type price" />
                  </div>
                  <Button size="sm" variant="outline" icon={Plus} onClick={() => addItem(area)} aria-label={`Add item to ${area}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------- Print ---------- */

function printDecorPlan(plan, settings) {
  const propName = settings?.property_name || 'SMC Function Hall (A/C)';
  const bannerName = settings?.banner_name || '';
  const tagline = settings?.property_tagline || 'Kalyana Mandapam & Function Hall';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const items = plan.items || [];
  const sections = plansAreas(items).map(area => {
    const rows = items.filter(i => i.area === area);
    const sub = rows.reduce((s, i) => s + n(i.amount), 0);
    return `<tr class="area"><td colspan="3">${esc(area)}</td><td class="r">${esc(inr(sub))}</td></tr>` +
      rows.map(i => `<tr><td>${esc(i.name)}</td><td class="c">${n(i.qty) !== 1 ? esc(`× ${i.qty}`) : ''}</td><td class="r">${esc(inr(i.rate))}</td><td class="r">${esc(inr(i.amount))}</td></tr>`).join('');
  }).join('');

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Decoration ${esc(plan.bill_no || '')} - ${esc(propName)}</title><style>
    body{font-family:Georgia,serif;color:#0e1a2b;max-width:700px;margin:30px auto;padding:0 24px}
    h1{margin:0;font-size:24px}.banner{font-size:12px;color:#a57837;font-weight:bold;margin-top:2px}
    .sub,.addr{font-family:Arial,sans-serif;font-size:12px;color:#555;margin-top:2px}.addr{font-size:11px;color:#777}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #d4ad5e;padding-bottom:16px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px}td,th{padding:7px 4px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
    th{font-size:11px;text-transform:uppercase;color:#888}.r{text-align:right;white-space:nowrap}.c{text-align:center;white-space:nowrap}
    .area td{background:#faf6ec;font-weight:bold;color:#7a5a20}.tot td{font-weight:bold;border:none;font-size:14px}
    h3{font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;color:#888;margin:24px 0 8px}
    .foot{margin-top:40px;padding-top:16px;border-top:1px dashed #ddd;font-family:Arial,sans-serif;font-size:11px;color:#777;text-align:center}
  </style></head><body>
    <div class="head">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="/logo.jpg" style="height:62px;width:auto;border-radius:8px" alt="" />
        <div>
          <h1>${esc(propName)}</h1>
          ${bannerName ? `<div class="banner">Proprietor: ${esc(bannerName)}</div>` : ''}
          <div class="sub">${esc(tagline)}</div>
          <div class="addr">${esc(address)}<br>Contact: ${esc(phone)}</div>
        </div>
      </div>
      <div style="text-align:right;font-family:Arial,sans-serif;font-size:12px;white-space:nowrap">
        <b style="font-size:15px;color:#a57837">DECORATION BILL NO: ${esc(plan.bill_no || '—')}</b><br>Date: ${esc(fmtDate(today()))}
        ${plan.status === 'cancelled' ? '<br><b style="color:#dc2626">CANCELLED</b>' : ''}
      </div>
    </div>
    <table>
      <tr><td style="width:30%;color:#888">Customer</td><td><b>${esc(plan.customer_name)}</b></td></tr>
      <tr><td style="color:#888">Phone</td><td>${esc(plan.phone || '—')}</td></tr>
      <tr><td style="color:#888">Event</td><td>${esc(plan.event_name || '—')} · ${esc(fmtDate(plan.event_date))}${plan.hall_name ? ` · ${esc(plan.hall_name)}` : ''}</td></tr>
    </table>
    <h3>Decoration by area</h3>
    <table>
      <tr><th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
      ${sections || '<tr><td colspan="4">No items</td></tr>'}
      ${n(plan.discount) > 0 ? `<tr class="tot"><td colspan="3" class="r">Items total</td><td class="r">${esc(inr(plan.subtotal))}</td></tr>
      <tr class="tot"><td colspan="3" class="r">Discount</td><td class="r">- ${esc(inr(plan.discount))}</td></tr>` : ''}
      <tr class="tot"><td colspan="3" class="r">Decoration total</td><td class="r">${esc(inr(plan.total))}</td></tr>
    </table>
    ${plan.notes ? `<h3>Notes</h3><p style="font-family:Arial,sans-serif;font-size:13px">${esc(plan.notes)}</p>` : ''}
    <div class="foot">Thank you for choosing ${esc(propName)}.<br>${esc(address)} · Phone: ${esc(phone)}</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
