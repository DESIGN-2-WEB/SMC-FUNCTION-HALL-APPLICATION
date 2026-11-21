import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Flower2, ListChecks, Pencil, Plus, Printer, RotateCcw, Tags, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove } from '../hooks.js';
import { Badge, Button, Card, EmptyState, Field, Form, Input, Modal, Segmented, Textarea, cn, useUI } from './ui.jsx';
import { Combobox, DatePicker, Select } from './pickers.jsx';
import { esc, fmtDate, inr, today } from '../utils.js';
import WhatsAppModal, { WhatsAppIcon } from './WhatsAppModal.jsx';

/*
 * Decorations page (its own menu item): plan and price the decoration of each area of the hall
 * (stage, entrance, walkway, photo booths, staircase...) for an event. Prices come from our own
 * price list; the server works out every amount again when a plan is saved.
 */

export const DEFAULT_DECOR_AREAS = ['Stage', 'Entrance', 'Walkway', 'Photo booths', 'Main outdoor staircase'];

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
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plansAreas(p.items).map(a => (
                      <span key={a} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">{a}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-semibold text-ink-900">{inr(p.total)}</p>
                  {n(p.discount) > 0 && <p className="text-[11px] text-stone-400">after {inr(p.discount)} discount</p>}
                </div>
                <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
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
  const [lines, setLines] = useState(() => (plan.items || []).map(l => ({ ...newLine(l.area), ...l })));
  // Areas shown in the form: the ones the plan already uses, plus any ticked
  const [open, setOpen] = useState(() => plansAreas(plan.items));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const allAreas = useMemo(() => [...new Set([...areas, ...plansAreas(lines)])], [areas, lines]);
  const byArea = area => priceItems.filter(i => i.area === area);

  const toggleArea = area => {
    if (open.includes(area)) {
      if (lines.some(l => l.area === area && l.name)) return toast(`Remove the ${area} items first`, 'error');
      setOpen(o => o.filter(a => a !== area));
      setLines(ls => ls.filter(l => l.area !== area));
    } else {
      setOpen(o => [...o, area]);
      // Start with the area's first price-list item, or an empty row
      setLines(ls => [...ls, newLine(area, byArea(area)[0])]);
    }
  };

  const updateLine = (key, patch) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const pickName = (l, name) => {
    const item = byArea(l.area).find(i => i.name.toLowerCase() === name.toLowerCase());
    updateLine(l.key, item ? { name: item.name, unit: item.unit, rate: n(item.price) } : { name });
  };

  const linkBooking = id => {
    set('hall_booking_id', id);
    const b = hallBookings.find(x => String(x.id) === String(id));
    if (b) setF(p => ({ ...p, hall_booking_id: id, customer_name: b.customer_name, phone: b.phone || '', event_name: b.event_type || p.event_name, event_date: b.event_date }));
  };

  const amount = l => Math.round(n(l.qty) * n(l.rate) * 100) / 100;
  const subtotal = lines.reduce((s, l) => s + (l.name ? amount(l) : 0), 0);
  const discount = Math.min(subtotal, n(f.discount));
  const total = subtotal - discount;

  const save = async () => {
    const items = lines.filter(l => l.name.trim()).map(({ area, name, unit, qty, rate }) => ({ area, name: name.trim(), unit, qty: n(qty), rate: n(rate) }));
    if (!items.length) return toast('Add at least one decoration item', 'error');
    setSaving(true);
    try {
      await api(editing ? `/decorations/plans/${plan.id}` : '/decorations/plans', {
        method: editing ? 'PUT' : 'POST',
        body: { ...f, hall_booking_id: f.hall_booking_id || null, discount: n(f.discount), items },
      });
      toast(editing ? 'Decoration plan updated' : 'Decoration planned');
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
      subtitle="Pick the areas, then the items and quantities. Rates come from your price list and can be changed here."
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
          const sub = rows.reduce((s, l) => s + (l.name ? amount(l) : 0), 0);
          const names = byArea(area).map(i => i.name);
          return (
            <div key={area} className="rounded-2xl border border-stone-200">
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
                <span className="font-semibold text-ink-900">{area}</span>
                <span className="text-sm font-semibold text-ink-900">{inr(sub)}</span>
              </div>
              <div className="space-y-2 p-3">
                {rows.map(l => (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_auto]">
                    <div className="min-w-0">
                      <Combobox value={l.name} onChange={v => pickName(l, v)} options={names} placeholder="Item, e.g. Flower backdrop" />
                    </div>
                    <div className="col-span-2 row-start-2 grid grid-cols-3 gap-2 sm:contents">
                      <label className="block">
                        <span className="text-[11px] text-stone-400 sm:hidden">Qty</span>
                        <Input type="number" min="0" step="any" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} aria-label="Quantity" />
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-stone-400 sm:hidden">Rate (₹)</span>
                        <Input type="number" min="0" step="any" value={l.rate} onChange={e => updateLine(l.key, { rate: e.target.value })} aria-label="Rate" />
                      </label>
                      <div className="flex h-10 items-center justify-end text-sm font-medium text-ink-900 tabular-nums">
                        {inr(amount(l))}
                      </div>
                    </div>
                    <button type="button" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}
                      className="col-start-2 row-start-1 grid h-10 w-9 cursor-pointer place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:col-start-5"
                      aria-label="Remove item" title="Remove item">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setLines(ls => [...ls, newLine(area)])}
                  className="cursor-pointer text-xs font-medium text-gold-700 hover:text-gold-900 hover:underline">
                  + Add item to {area}
                </button>
              </div>
            </div>
          );
        })}

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
  const [drafts, setDrafts] = useState({}); // area -> { name, unit, price }
  const [edits, setEdits] = useState({}); // id -> { name, unit, price }
  const [busy, setBusy] = useState(false);

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
      await api('/decorations/items', { method: 'POST', body: { area, name: d.name, unit: d.unit || 'pcs', price: n(d.price) } });
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
      subtitle="The price you charge for each item. Plans start with these rates."
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
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
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_auto] items-center gap-2">
                      <Input value={val.name} onChange={ev => change('name', ev.target.value)} aria-label="Item name" />
                      <Input value={val.unit} onChange={ev => change('unit', ev.target.value)} aria-label="Unit" />
                      <Input type="number" min="0" step="any" value={val.price} onChange={ev => change('price', ev.target.value)} aria-label="Price" />
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
                <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_auto] items-center gap-2 border-t border-dashed border-stone-200 pt-2">
                  <Input value={d.name || ''} onChange={ev => setD('name', ev.target.value)} placeholder="New item" aria-label="New item name"
                    onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addItem(area); } }} />
                  <Input value={d.unit || ''} onChange={ev => setD('unit', ev.target.value)} placeholder="pcs" aria-label="New item unit" />
                  <Input type="number" min="0" step="any" value={d.price || ''} onChange={ev => setD('price', ev.target.value)} placeholder="₹ price" aria-label="New item price" />
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

export function printDecorPlan(plan, settings) {
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
      rows.map(i => `<tr><td>${esc(i.name)}</td><td class="c">${esc(`${i.qty} ${i.unit || 'pcs'}`)}</td><td class="r">${esc(inr(i.rate))}</td><td class="r">${esc(inr(i.amount))}</td></tr>`).join('');
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
