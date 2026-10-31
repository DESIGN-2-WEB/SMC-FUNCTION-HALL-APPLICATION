import { useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, History, Package, Pencil, Plus, Search, SlidersHorizontal, Trash2, TriangleAlert, Wallet,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import {
  Badge, Button, Card, EmptyState, Field, Form, Input, Modal, PageHeader, PageLoader, Segmented, StatCard, cn, useUI,
} from '../components/ui.jsx';
import { Combobox } from '../components/pickers.jsx';
import { fmtDateTime, inr } from '../utils.js';

const SUPPLY_CATEGORIES = ['Housekeeping', 'Toiletries', 'Beverages', 'Banquet', 'Cleaning', 'Kitchen', 'Electrical'];

export default function Supplies() {
  const { isAdmin } = useAuth();
  const remove = useRemove();
  const supplies = useApi('/supplies');
  const [tab, setTab] = useState('stock');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [move, setMove] = useState(null);
  const [edit, setEdit] = useState(null);
  const [history, setHistory] = useState(null);

  const deleteItem = i => remove(`/supplies/${i.id}`, {
    title: `Delete ${i.name}?`, message: 'The item and its whole stock history will be removed.', success: 'Item deleted', done: supplies.reload,
  });

  if (!supplies.data) return <PageLoader />;
  const items = supplies.data;
  const categories = ['All', ...new Set(items.map(i => i.category))];
  const shown = items.filter(i => (cat === 'All' || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase()));
  const low = items.filter(i => i.low).length;
  const value = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  return (
    <>
      <PageHeader
        title="Supplies"
        subtitle="Housekeeping, toiletries, banquet items and more"
        actions={isAdmin && <Button variant="gold" icon={Plus} onClick={() => setEdit({})}>Add item</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Boxes} label="Items tracked" value={items.length} sub={`${categories.length - 1} categories`} />
        <StatCard icon={TriangleAlert} label="Low stock" value={low} sub={low ? 'Need reordering' : 'All good'} accent={low ? 'rose' : 'green'} />
        <StatCard icon={Wallet} label="Stock value" value={inr(value)} sub="At unit cost" accent="gold" />
      </div>

      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[{ value: 'stock', label: 'Stock', icon: Package }, { value: 'moves', label: 'Movements', icon: History }]} />

      {tab === 'stock' ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={cn('cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition', cat === c ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200')}>
                  {c}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-60">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
              <Input className="pl-9" placeholder="Search items" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          {shown.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60">
                  <tr><th className="th">Item</th><th className="th">Stock level</th><th className="th text-right">Unit cost</th><th className="th text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shown.map(i => {
                    const pct = Math.min(100, (i.quantity / Math.max(i.min_quantity * 2, 1)) * 100);
                    return (
                      <tr key={i.id} className="transition hover:bg-stone-50/60">
                        <td className="td">
                          <p className="font-medium text-ink-900">{i.name}</p>
                          <p className="text-xs text-stone-500">{i.category}</p>
                        </td>
                        <td className="td min-w-52">
                          <div className="flex items-center justify-between gap-2">
                            <span><b className="text-ink-900">{i.quantity}</b> <span className="text-stone-500">{i.unit}</span></span>
                            {i.quantity === 0 ? <Badge tone="rose">Out of stock</Badge> : i.low ? <Badge tone="amber">Low</Badge> : null}
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                            <div className={cn('h-full rounded-full transition-all', i.low ? (i.quantity === 0 ? 'bg-rose-500' : 'bg-amber-400') : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-stone-400">Min level {i.min_quantity}</p>
                        </td>
                        <td className="td text-right whitespace-nowrap">{inr(i.unit_cost)}</td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" icon={ArrowDownToLine} onClick={() => setMove({ item: i, type: 'in' })} className="text-emerald-700">In</Button>
                            <Button size="sm" variant="outline" icon={ArrowUpFromLine} onClick={() => setMove({ item: i, type: 'out' })} className="text-amber-700" disabled={i.quantity <= 0}>Out</Button>
                            <Button size="icon" variant="ghost" title="History" onClick={() => setHistory(i)}><History size={15} /></Button>
                            {isAdmin && <>
                              <Button size="icon" variant="ghost" title="Edit" onClick={() => setEdit(i)}><Pencil size={15} /></Button>
                              <Button size="icon" variant="danger-soft" title="Delete" onClick={() => deleteItem(i)}><Trash2 size={15} /></Button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Package} title="No items" text={q ? 'No items match your search.' : 'Add supply items to start tracking stock.'} />
          )}
        </Card>
      ) : (
        <Card><MovesList /></Card>
      )}

      {move && <MoveModal {...move} onClose={() => setMove(null)} onSaved={() => { setMove(null); supplies.reload(); }} />}
      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); supplies.reload(); }} />}
      {history && (
        <Modal size="lg" title={history.name} subtitle="Stock movement history" onClose={() => setHistory(null)}>
          <div className="-mx-6 -my-5"><MovesList supplyId={history.id} /></div>
        </Modal>
      )}
    </>
  );
}

function MovesList({ supplyId }) {
  const { data } = useApi(`/supplies/moves${supplyId ? `?supply_id=${supplyId}` : ''}`);
  if (!data) return <PageLoader />;
  if (!data.length) return <EmptyState icon={History} title="No movements yet" />;
  const META = {
    in: ['Received', 'bg-emerald-50 text-emerald-600', ArrowDownToLine],
    out: ['Issued', 'bg-amber-50 text-amber-600', ArrowUpFromLine],
    adjust: ['Corrected', 'bg-sky-50 text-sky-600', SlidersHorizontal],
  };
  return (
    <div className="divide-y divide-stone-100">
      {data.map(m => {
        const [label, tone, Icon] = META[m.type];
        return (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3">
            <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tone)}><Icon size={16} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm"><b className="font-semibold">{label}</b> {!supplyId && <>· {m.supply_name}</>}</p>
              <p className="truncate text-xs text-stone-500">{fmtDateTime(m.created_at)} · {m.created_by_name || 'System'}{m.note ? ` · ${m.note}` : ''}</p>
            </div>
            <div className="text-right">
              <p className={cn('font-semibold', m.quantity >= 0 ? 'text-emerald-600' : 'text-amber-600')}>{m.quantity > 0 ? '+' : ''}{m.quantity} {m.unit}</p>
              <p className="text-xs text-stone-400">Balance {m.balance}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoveModal({ item, type: initial, onClose, onSaved }) {
  const { toast } = useUI();
  const [type, setType] = useState(initial);
  const [f, setF] = useState({ quantity: '', note: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api(`/supplies/${item.id}/move`, { method: 'POST', body: { ...f, type } });
      toast(type === 'in' ? 'Stock received' : 'Stock issued');
      onSaved();
    } catch (err) { toast(err.message, 'error'); setSaving(false); }
  };
  const after = Number(f.quantity || 0) * (type === 'in' ? 1 : -1) + item.quantity;
  return (
    <Modal size="sm" title={item.name} subtitle={`Current stock: ${item.quantity} ${item.unit}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button form="move-form" type="submit" variant={type === 'in' ? 'success' : 'gold'} loading={saving}>{type === 'in' ? 'Add stock' : 'Issue stock'}</Button></>}>
      <Form id="move-form" onSubmit={submit} className="space-y-4">
        <Segmented value={type} onChange={setType} className="w-full"
          options={[{ value: 'in', label: 'Stock in', icon: ArrowDownToLine }, { value: 'out', label: 'Stock out', icon: ArrowUpFromLine }]} />
        <Field label={`Quantity (${item.unit})`} hint={f.quantity ? `Stock after: ${after} ${item.unit}` : undefined}>
          <Input type="number" min="0.01" step="any" required autoFocus value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
        </Field>
        <Field label="Note">
          <Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={type === 'in' ? 'Supplier / bill no.' : 'Used for… (room 101, wedding, etc.)'} />
        </Field>
      </Form>
    </Modal>
  );
}

function ItemModal({ item, onClose, onSaved }) {
  const [f, setF] = useState(() => item.id ? { ...item } : { name: '', category: '', unit: 'pcs', quantity: 0, min_quantity: 0, unit_cost: 0 });
  const [saving, save] = useSave('/supplies', item.id, 'Item', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={item.id ? 'Edit item' : 'Add supply item'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="item-form" type="submit" loading={saving}>Save</Button></>}>
      <Form id="item-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" className="sm:col-span-2"><Input required value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Category">
          <Combobox value={f.category} onChange={v => set('category', v)} options={SUPPLY_CATEGORIES} placeholder="Housekeeping, Banquet…" />
        </Field>
        <Field label="Unit"><Input value={f.unit} onChange={e => set('unit', e.target.value)} placeholder="pcs, kg, litres…" /></Field>
        <Field label="Quantity in stock" hint={item.id ? 'Changing this records a correction' : undefined}>
          <Input type="number" min="0" step="any" value={f.quantity} onChange={e => set('quantity', e.target.value)} />
        </Field>
        <Field label="Minimum level" hint="Alert when stock falls to this"><Input type="number" min="0" step="any" value={f.min_quantity} onChange={e => set('min_quantity', e.target.value)} /></Field>
        <Field label="Unit cost (₹)"><Input type="number" min="0" step="any" value={f.unit_cost} onChange={e => set('unit_cost', e.target.value)} /></Field>
      </Form>
    </Modal>
  );
}
