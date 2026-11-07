import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Handshake,
  History,
  Layers,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Form,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  StatCard,
  cn,
  useUI,
} from '../components/ui.jsx';
import { Combobox, Select } from '../components/pickers.jsx';
import { addDays, fmtDate, fmtDateTime, inr, today } from '../utils.js';
import WhatsAppModal, { WhatsAppIcon } from '../components/WhatsAppModal.jsx';

const DEFAULT_SUPPLY_CATEGORIES = [
  'Cooking Vessels',
  'Kitchen Utensils & Accessories',
  'Serving & Tableware',
  'Stoves & Fuel',
  'Furniture & Tents',
  'Containers & Water',
];

export default function Supplies() {
  const { isAdmin } = useAuth();
  const { settings, reload: reloadSettings } = useSettings();
  const { toast } = useUI();
  const remove = useRemove();

  const supplies = useApi('/supplies');
  const rentalsApi = useApi('/supplies/rentals?status=all');
  const hallBookingsApi = useApi('/hall-bookings?status=active');

  const [tab, setTab] = useState('stock'); // 'stock' | 'rentals' | 'moves'
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [rentalFilter, setRentalFilter] = useState('active'); // 'active' | 'all'
  const [rentalSearch, setRentalSearch] = useState('');
  const [rentalViewMode, setRentalViewMode] = useState('orders'); // 'orders' | 'items'
  const [expandedOrders, setExpandedOrders] = useState({});

  // Modals state
  const [rentModalItem, setRentModalItem] = useState(null); // item object or {}
  const [returnRental, setReturnRental] = useState(null); // rental object
  const [groupReturnOrder, setGroupReturnOrder] = useState(null); // group object
  const [moveItem, setMoveItem] = useState(null); // { item, type: 'in' | 'out' }
  const [editItem, setEditItem] = useState(null); // item object
  const [historyItem, setHistoryItem] = useState(null); // item object
  const [waShare, setWaShare] = useState(null); // { item, move }

  // Supply Categories Section State
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const configuredCategories = useMemo(() => {
    return (settings.supply_categories || DEFAULT_SUPPLY_CATEGORIES.join(', '))
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }, [settings.supply_categories]);

  const saveCategories = async updatedList => {
    setSavingCat(true);
    try {
      const updatedString = updatedList.join(', ');
      await api('/settings', { method: 'PUT', body: { supply_categories: updatedString } });
      await reloadSettings();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingCat(false);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      return toast('Please enter a category name', 'error');
    }
    if (configuredCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      return toast(`"${trimmed}" already exists in categories`, 'error');
    }
    const updated = [...configuredCategories, trimmed];
    await saveCategories(updated);
    setNewCatName('');
    toast(`Added "${trimmed}" to categories`);
  };

  const handleRemoveCategory = async catToRemove => {
    if (!catToRemove) return;
    const updated = configuredCategories.filter(c => c.toLowerCase() !== catToRemove.toLowerCase());
    await saveCategories(updated);
    if (cat === catToRemove) setCat('All');
    toast(`Removed "${catToRemove}" from categories`);
  };

  const handleRestoreDefaultCategories = async () => {
    await saveCategories(DEFAULT_SUPPLY_CATEGORIES);
    toast('Restored default categories');
  };

  const reloadAll = () => {
    supplies.reload();
    rentalsApi.reload();
  };

  const deleteItem = i =>
    remove(`/supplies/${i.id}`, {
      title: `Delete ${i.name}?`,
      message: 'The equipment item and its stock history will be permanently removed.',
      success: 'Item deleted',
      done: reloadAll,
    });

  const items = supplies.data || [];
  const allRentals = rentalsApi.data || [];
  const activeRentals = useMemo(() => allRentals.filter(r => r.status === 'rented'), [allRentals]);

  const categories = useMemo(
    () => ['All', ...new Set([...configuredCategories, ...items.map(i => i.category).filter(Boolean)])],
    [configuredCategories, items]
  );

  // Filtered Stock Items
  const shownItems = useMemo(
    () => items.filter(i => (cat === 'All' || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase())),
    [items, cat, q]
  );

  // Filtered Rentals
  const shownRentals = useMemo(() => {
    return allRentals.filter(r => {
      if (rentalFilter === 'active' && r.status !== 'rented') return false;
      if (!rentalSearch) return true;
      const query = rentalSearch.toLowerCase();
      return (
        (r.customer_name || '').toLowerCase().includes(query) ||
        (r.phone || '').toLowerCase().includes(query) ||
        (r.event_name || '').toLowerCase().includes(query) ||
        (r.supply_name || '').toLowerCase().includes(query)
      );
    });
  }, [allRentals, rentalFilter, rentalSearch]);

  // Group rentals by rental_group_id (for bulk orders)
  const groupedRentals = useMemo(() => {
    const map = new Map();
    for (const r of shownRentals) {
      const key = r.rental_group_id || `single_${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          groupId: r.rental_group_id,
          customer_name: r.customer_name,
          phone: r.phone,
          event_name: r.event_name,
          rent_date: r.rent_date,
          expected_return_date: r.expected_return_date,
          advance_amount: Number(r.advance_amount) || 0,
          payment_method: r.payment_method || 'Cash',
          notes: r.notes,
          items: [],
          total_rent: 0,
          total_pieces: 0,
          hasRented: false,
          hasReturned: false,
        });
      }
      const grp = map.get(key);
      grp.items.push(r);
      grp.total_rent += Number(r.total_rent) || 0;
      grp.total_pieces += Number(r.quantity) || 0;
      if (r.status === 'rented') grp.hasRented = true;
      if (r.status === 'returned') grp.hasReturned = true;
    }
    return Array.from(map.values());
  }, [shownRentals]);

  const toggleOrderExpand = key => {
    setExpandedOrders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!supplies.data || !rentalsApi.data) return <PageLoader />;

  // Overview metrics
  const totalUnits = items.reduce((s, i) => s + (Number(i.total_quantity) || Number(i.quantity) || 0), 0);
  const rentedUnits = items.reduce((s, i) => s + (Number(i.rented_quantity) || 0), 0);
  const availableUnits = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const activeRentalsValue = activeRentals.reduce((s, r) => s + (Number(r.total_rent) || 0), 0);

  return (
    <>
      <PageHeader
        title="Function Supplies & Equipment Rentals"
        subtitle="Rent out banquet chairs, tables, utensils, sound & stage equipment to functions and track returns"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="gold"
              icon={Handshake}
              onClick={() => setRentModalItem({})}
            >
              Rent Out Equipment
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => setEditItem({})}
              >
                Add New Item
              </Button>
            )}
          </div>
        }
      />

      {/* Top Stat Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Boxes}
          label="Total Inventory"
          value={totalUnits.toLocaleString('en-IN')}
          sub={`${items.length} equipment items owned`}
          accent="ink"
        />
        <StatCard
          icon={Handshake}
          label="With Functions"
          value={rentedUnits.toLocaleString('en-IN')}
          sub={`${activeRentals.length} active rentals`}
          accent="amber"
        />
        <StatCard
          icon={Package}
          label="Available Stock"
          value={availableUnits.toLocaleString('en-IN')}
          sub="Ready to issue to events"
          accent="green"
        />
        <StatCard
          icon={Wallet}
          label="Active Rent Value"
          value={inr(activeRentalsValue)}
          sub="Pending equipment rent"
          accent="gold"
        />
      </div>

      {/* Supply Item Categories Section (Collapsible + Add + Tag Cloud) */}
      <Card className="mb-6 overflow-hidden border border-stone-200">
        <div
          className="flex flex-wrap cursor-pointer items-center justify-between gap-3 p-4 transition hover:bg-stone-50/70 select-none"
          onClick={() => setCatOpen(p => !p)}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold-100 text-gold-800">
              <Boxes size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-ink-900">Equipment Categories</h3>
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-800">
                  {configuredCategories.length} categories
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Organize banquet furniture, linens, cooking vessels, sound & stage equipment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
            <span>{catOpen ? 'Hide categories' : 'Manage categories'}</span>
            <ChevronDown
              size={16}
              className={cn('text-stone-400 transition-transform duration-200', catOpen && 'rotate-180')}
            />
          </div>
        </div>

        {catOpen && (
          <div className="border-t border-stone-100 bg-stone-50/40 p-4 sm:p-5 space-y-4">
            {isAdmin && (
              <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-3.5 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-900 block">
                  Add New Category
                </label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 bg-white text-sm"
                    placeholder="e.g. Crockery, Generator Sets, Stage Backdrop, Mandapam…"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="gold"
                    icon={Plus}
                    loading={savingCat}
                    onClick={handleAddCategory}
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
                  Active Categories ({configuredCategories.length}):
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleRestoreDefaultCategories}
                    className="cursor-pointer text-xs font-medium text-gold-700 hover:text-gold-900 hover:underline"
                  >
                    Restore default presets
                  </button>
                )}
              </div>

              {configuredCategories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 p-4 text-center text-xs text-stone-500">
                  No supply categories configured. {isAdmin ? 'Type a name above and click "Add".' : ''}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {configuredCategories.map(c => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-ink-900 transition hover:border-gold-300 hover:bg-gold-50/50"
                    >
                      <span>{c}</span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(c)}
                          title={`Remove ${c}`}
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

      {/* Main Tabs */}
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stock', label: 'Equipment & Stock', icon: Boxes },
          {
            value: 'rentals',
            label: `Function Rentals (${activeRentals.length})`,
            icon: Handshake,
          },
          { value: 'moves', label: 'Movement Logs', icon: History },
        ]}
      />

      {/* TAB 1: EQUIPMENT INVENTORY & STOCK */}
      {tab === 'stock' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition',
                    cat === c ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
              />
              <Input
                className="pl-9"
                placeholder="Search equipment…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>

          {shownItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60">
                  <tr>
                    <th className="th">Equipment / Item</th>
                    <th className="th min-w-64">Stock Status (Available / Rented)</th>
                    <th className="th text-right">Rent Rate</th>
                    <th className="th text-right min-w-44">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shownItems.map(i => {
                    const total = Number(i.total_quantity) || Number(i.quantity) || 1;
                    const available = Number(i.quantity) || 0;
                    const rented = Number(i.rented_quantity) || 0;
                    const availPct = Math.min(100, Math.round((available / total) * 100));
                    const rentPct = Math.min(100 - availPct, Math.round((rented / total) * 100));

                    return (
                      <tr key={i.id} className="transition hover:bg-stone-50/60">
                        <td className="td">
                          <p className="font-semibold text-ink-900">{i.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-stone-500">{i.category}</span>
                            <span className="text-stone-300">·</span>
                            <span className="text-xs font-mono text-stone-400">Total: {total} {i.unit}</span>
                          </div>
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span>
                              <b className="text-ink-900 text-sm">{available}</b>{' '}
                              <span className="text-emerald-700 font-medium">available</span>
                              {rented > 0 && (
                                <span className="text-stone-400 ml-1.5">
                                  ({rented} <span className="text-amber-700 font-medium">rented</span>)
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {available === 0 ? (
                                <Badge tone="rose">All out</Badge>
                              ) : i.low ? (
                                <Badge tone="amber">Low stock</Badge>
                              ) : (
                                <Badge tone="green">In stock</Badge>
                              )}
                            </div>
                          </div>
                          {/* Visual progress bar: green = available, amber = rented */}
                          <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-stone-100">
                            <div
                              className="bg-emerald-500 transition-all"
                              style={{ width: `${availPct}%` }}
                              title={`${available} available (${availPct}%)`}
                            />
                            <div
                              className="bg-amber-400 transition-all"
                              style={{ width: `${rentPct}%` }}
                              title={`${rented} rented (${rentPct}%)`}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400">
                            <span>{availPct}% available</span>
                            <span>Min alert: {i.min_quantity}</span>
                          </div>
                        </td>
                        <td className="td text-right whitespace-nowrap">
                          <p className="font-semibold text-ink-900">
                            ₹{i.rent_rate || 0}
                            <span className="text-xs font-normal text-stone-500">/{i.unit}</span>
                          </p>
                          <p className="text-[11px] text-stone-400">per function</p>
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="gold"
                              icon={ArrowUpFromLine}
                              disabled={available <= 0}
                              onClick={() => setRentModalItem(i)}
                              title={available <= 0 ? 'No units available to rent' : `Rent out ${i.name}`}
                            >
                              Rent Out
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={ArrowDownToLine}
                              onClick={() => setMoveItem({ item: i, type: 'in' })}
                              className="text-emerald-700"
                              title="Restock / Add more units"
                            >
                              In
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Stock History"
                              onClick={() => setHistoryItem(i)}
                            >
                              <History size={15} />
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Edit Item"
                                  onClick={() => setEditItem(i)}
                                >
                                  <Pencil size={15} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="danger-soft"
                                  title="Delete Item"
                                  onClick={() => deleteItem(i)}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Boxes}
              title="No equipment items"
              text={q ? 'No items match your search.' : 'Add equipment to start tracking function rentals.'}
            />
          )}
        </Card>
      )}

      {/* TAB 2: FUNCTION EQUIPMENT RENTALS */}
      {tab === 'rentals' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={rentalFilter === 'active' ? 'primary' : 'outline'}
                onClick={() => setRentalFilter('active')}
              >
                Active with Functions ({activeRentals.length})
              </Button>
              <Button
                size="sm"
                variant={rentalFilter === 'all' ? 'primary' : 'outline'}
                onClick={() => setRentalFilter('all')}
              >
                All Rentals ({allRentals.length})
              </Button>
              <div className="h-4 w-px bg-stone-200 mx-1 hidden sm:block" />
              <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRentalViewMode('orders')}
                  className={cn(
                    'cursor-pointer rounded-md px-2.5 py-1 font-medium transition',
                    rentalViewMode === 'orders' ? 'bg-white text-ink-900 shadow-2xs font-semibold' : 'text-stone-500 hover:text-ink-900'
                  )}
                >
                  By Orders ({groupedRentals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRentalViewMode('items')}
                  className={cn(
                    'cursor-pointer rounded-md px-2.5 py-1 font-medium transition',
                    rentalViewMode === 'items' ? 'bg-white text-ink-900 shadow-2xs font-semibold' : 'text-stone-500 hover:text-ink-900'
                  )}
                >
                  All Items ({shownRentals.length})
                </button>
              </div>
            </div>
            <div className="relative w-full sm:w-64">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
              />
              <Input
                className="pl-9"
                placeholder="Search customer, event, item…"
                value={rentalSearch}
                onChange={e => setRentalSearch(e.target.value)}
              />
            </div>
          </div>

          {rentalViewMode === 'orders' ? (
            groupedRentals.length ? (
              <div className="divide-y divide-stone-100">
                {groupedRentals.map(grp => {
                  const isExpanded = !!expandedOrders[grp.key];
                  const hasActive = grp.hasRented;
                  return (
                    <div key={grp.key} className="p-4 transition hover:bg-stone-50/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                            hasActive ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          )}>
                            <Boxes size={20} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-ink-900 text-sm">{grp.customer_name}</h4>
                              {grp.groupId && (
                                <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600">
                                  {grp.groupId}
                                </span>
                              )}
                              {hasActive ? (
                                <Badge tone="amber" dot>Out on Rent</Badge>
                              ) : (
                                <Badge tone="green">Returned</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mt-1">
                              {grp.event_name && (
                                <span className="font-medium text-stone-700">{grp.event_name}</span>
                              )}
                              {grp.phone && (
                                <>
                                  <span className="text-stone-300">·</span>
                                  <span>{grp.phone}</span>
                                </>
                              )}
                              <span className="text-stone-300">·</span>
                              <span>Dispatched: {fmtDate(grp.rent_date)}</span>
                              {grp.expected_return_date && (
                                <>
                                  <span className="text-stone-300">·</span>
                                  <span>Due: {fmtDate(grp.expected_return_date)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Financials & Actions */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-display text-base font-bold text-ink-900">{inr(grp.total_rent)}</p>
                            <p className="text-[11px] text-stone-400">
                              {grp.items.length} {grp.items.length === 1 ? 'item' : 'items'} ({grp.total_pieces} pcs)
                              {grp.advance_amount > 0 && ` · ${inr(grp.advance_amount)} adv`}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {hasActive && (
                              <Button
                                size="sm"
                                variant="success"
                                icon={RotateCcw}
                                onClick={() => {
                                  if (grp.groupId && grp.items.length > 1) {
                                    setGroupReturnOrder(grp);
                                  } else {
                                    setReturnRental(grp.items[0]);
                                  }
                                }}
                              >
                                {grp.items.length > 1 ? 'Return Order' : 'Return'}
                              </Button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setWaShare({
                                  isBulk: true,
                                  order: {
                                    rental_group_id: grp.groupId || grp.key,
                                    customer_name: grp.customer_name,
                                    phone: grp.phone,
                                    event_name: grp.event_name,
                                    rent_date: grp.rent_date,
                                    expected_return_date: grp.expected_return_date,
                                    advance_amount: grp.advance_amount,
                                    payment_method: grp.payment_method,
                                    notes: grp.notes,
                                    items: grp.items,
                                    total_rent: grp.total_rent,
                                  },
                                });
                              }}
                              title="Share Catering Dispatch Slip on WhatsApp"
                              className="cursor-pointer rounded-lg p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition shrink-0"
                            >
                              <WhatsAppIcon size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleOrderExpand(grp.key)}
                              className="cursor-pointer rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-ink-900 transition shrink-0"
                              title={isExpanded ? 'Collapse items' : 'View rented items'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Items List */}
                      {isExpanded && (
                        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                          <p className="text-xs font-semibold text-ink-900 mb-2">Itemized Equipment Breakdown:</p>
                          <div className="divide-y divide-stone-200/80 rounded-lg border border-stone-200 bg-white overflow-hidden">
                            {grp.items.map(it => {
                              const isItemRented = it.status === 'rented';
                              return (
                                <div key={it.id} className="flex items-center justify-between gap-2 p-2.5 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink-900">{it.supply_name}</p>
                                    <p className="text-[11px] text-stone-400">{it.supply_category}</p>
                                  </div>
                                  <div className="text-center font-mono text-stone-700">
                                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-bold">
                                      {it.quantity} {it.supply_unit}
                                    </span>
                                  </div>
                                  <div className="text-right whitespace-nowrap">
                                    <span className="font-semibold text-ink-900">{inr(it.total_rent)}</span>
                                    <span className="text-[11px] text-stone-400 ml-1">(₹{it.rent_rate}/{it.supply_unit})</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isItemRented ? (
                                      <>
                                        <Badge tone="amber" dot>Rented</Badge>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          icon={RotateCcw}
                                          onClick={() => setReturnRental(it)}
                                        >
                                          Return
                                        </Button>
                                      </>
                                    ) : (
                                      <Badge tone="green">Returned</Badge>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Handshake}
                title={rentalFilter === 'active' ? 'No active orders' : 'No rental records'}
                text={rentalFilter === 'active' ? 'All catering equipment is currently in stock.' : 'No equipment rentals logged yet.'}
              />
            )
          ) : (
            shownRentals.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50/60">
                    <tr>
                      <th className="th">Customer / Function</th>
                      <th className="th">Equipment Rented</th>
                      <th className="th">Rent & Return Dates</th>
                      <th className="th text-right">Rent Charges</th>
                      <th className="th">Status</th>
                      <th className="th text-right min-w-44">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {shownRentals.map(r => {
                      const isRented = r.status === 'rented';
                      return (
                        <tr key={r.id} className="transition hover:bg-stone-50/60">
                          <td className="td">
                            <p className="font-semibold text-ink-900">{r.customer_name}</p>
                            {r.event_name && (
                              <p className="text-xs text-stone-600 font-medium">{r.event_name}</p>
                            )}
                            {r.phone && <p className="text-xs text-stone-400">{r.phone}</p>}
                          </td>
                          <td className="td">
                            <p className="font-semibold text-ink-900">{r.supply_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                                {r.quantity} {r.supply_unit}
                              </span>
                              <span className="text-xs text-stone-400">· {r.supply_category}</span>
                            </div>
                          </td>
                          <td className="td text-xs">
                            <p className="text-stone-700">
                              <span className="text-stone-400">Rented:</span> {fmtDate(r.rent_date)}
                            </p>
                            <p className="text-stone-600 mt-0.5">
                              <span className="text-stone-400">Return:</span>{' '}
                              {r.expected_return_date ? fmtDate(r.expected_return_date) : 'After function'}
                            </p>
                            {r.return_date && (
                              <p className="text-emerald-700 font-medium mt-0.5">
                                Returned: {fmtDate(r.return_date)}
                              </p>
                            )}
                          </td>
                          <td className="td text-right whitespace-nowrap">
                            <p className="font-bold text-ink-900">{inr(r.total_rent || 0)}</p>
                            <p className="text-[11px] text-stone-400">
                              ₹{r.rent_rate || 0}/{r.supply_unit}
                            </p>
                          </td>
                          <td className="td">
                            {isRented ? (
                              <Badge tone="amber" dot>
                                With Function
                              </Badge>
                            ) : (
                              <div>
                                <Badge tone="green">Returned</Badge>
                                {r.returned_quantity < r.quantity && (
                                  <p className="text-[11px] text-rose-600 mt-0.5">
                                    {r.quantity - r.returned_quantity} missing/damaged
                                  </p>
                                )}
                                {r.damage_notes && (
                                  <p className="text-[11px] text-stone-500 mt-0.5 italic">
                                    {r.damage_notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="td">
                            <div className="flex items-center justify-end gap-1.5">
                              {isRented && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  icon={RotateCcw}
                                  onClick={() => setReturnRental(r)}
                                  title="Receive items back into inventory"
                                >
                                  Receive Back
                                </Button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setWaShare({
                                    item: {
                                      name: r.supply_name,
                                      unit: r.supply_unit,
                                      category: r.supply_category,
                                    },
                                    move: r,
                                  })
                                }
                                title="Share Rental Slip on WhatsApp"
                                className="cursor-pointer rounded-lg p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition shrink-0"
                              >
                                <WhatsAppIcon size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Handshake}
                title={rentalFilter === 'active' ? 'No active rentals' : 'No rental records'}
                text={
                  rentalFilter === 'active'
                    ? 'All function equipment is currently in stock. Click "Rent Out Equipment" to issue items to an event.'
                    : 'No equipment rentals logged yet.'
                }
              />
            )
          )}
        </Card>
      )}

      {/* TAB 3: MOVEMENT HISTORY & AUDIT LOG */}
      {tab === 'moves' && (
        <Card>
          <MovesList onShareWa={setWaShare} />
        </Card>
      )}

      {/* BULK RENT OUT MODAL */}
      {rentModalItem && (
        <BulkRentModal
          initialItem={rentModalItem.id ? rentModalItem : null}
          items={items}
          activeBookings={hallBookingsApi.data || []}
          onClose={() => setRentModalItem(null)}
          onSaved={res => {
            setRentModalItem(null);
            reloadAll();
            // Prompt WhatsApp voucher share
            if (res) {
              if (res.rental_group_id || res.rentals) {
                setWaShare({ isBulk: true, order: res });
              } else {
                const matchedItem = items.find(i => i.id === res.supply_id) || rentModalItem;
                setWaShare({ item: matchedItem, move: res });
              }
            }
          }}
        />
      )}

      {/* GROUP RETURN MODAL */}
      {groupReturnOrder && (
        <GroupReturnModal
          group={groupReturnOrder}
          onClose={() => setGroupReturnOrder(null)}
          onSaved={() => {
            setGroupReturnOrder(null);
            reloadAll();
          }}
        />
      )}

      {/* RETURN RECEIPT MODAL */}
      {returnRental && (
        <ReturnModal
          rental={returnRental}
          onClose={() => setReturnRental(null)}
          onSaved={() => {
            setReturnRental(null);
            reloadAll();
          }}
        />
      )}

      {/* RESTOCK / INWARD STOCK MODAL */}
      {moveItem && (
        <MoveModal
          {...moveItem}
          onClose={() => setMoveItem(null)}
          onSaved={() => {
            setMoveItem(null);
            reloadAll();
          }}
        />
      )}

      {/* ADD / EDIT ITEM MODAL */}
      {editItem && (
        <ItemModal
          item={editItem}
          categories={configuredCategories}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            reloadAll();
          }}
        />
      )}

      {/* HISTORY MODAL */}
      {historyItem && (
        <Modal
          size="lg"
          title={historyItem.name}
          subtitle={`Movement and rental logs (${historyItem.unit})`}
          onClose={() => setHistoryItem(null)}
        >
          <div className="-mx-6 -my-5">
            <MovesList supplyId={historyItem.id} onShareWa={setWaShare} />
          </div>
        </Modal>
      )}

      {/* WHATSAPP SHARE MODAL */}
      {waShare && (
        <WhatsAppModal
          kind={waShare.isBulk ? 'bulk_rental' : 'supply'}
          booking={waShare.order}
          supplyItem={waShare.item}
          supplyMove={waShare.move}
          onClose={() => setWaShare(null)}
        />
      )}
    </>
  );
}

/**
 * Bulk Rent Out Modal: Issues equipment items in bulk to a function/caterer/customer.
 */
function BulkRentModal({ initialItem, items = [], activeBookings = [], onClose, onSaved }) {
  const { toast } = useUI();

  // Cart of equipment items being rented
  const [selectedItems, setSelectedItems] = useState(() => {
    if (initialItem?.id) {
      return [
        {
          supply_id: initialItem.id,
          name: initialItem.name,
          unit: initialItem.unit || 'pcs',
          category: initialItem.category || '',
          available: Number(initialItem.quantity) || 0,
          quantity: 1,
          rent_rate: Number(initialItem.rent_rate) || 0,
        },
      ];
    }
    return [];
  });

  const [itemToAdd, setItemToAdd] = useState('');

  const [f, setF] = useState({
    customer_name: '',
    phone: '',
    event_name: '',
    rent_date: today(),
    expected_return_date: addDays(today(), 1),
    advance_amount: '',
    payment_method: 'Cash',
    notes: '',
  });

  const [saving, setSaving] = useState(false);

  // Quick fill from active hall bookings (using custom Select)
  const handleSelectBooking = bookingId => {
    if (!bookingId) return;
    const b = activeBookings.find(x => String(x.id) === String(bookingId));
    if (b) {
      setF(prev => ({
        ...prev,
        customer_name: b.customer_name || '',
        phone: b.phone || '',
        event_name: `${b.event_type || 'Function'} (${b.hall_name || 'Banquet Hall'})`,
        rent_date: b.event_date || today(),
        expected_return_date: addDays(b.event_date || today(), 1),
      }));
      toast(`Selected ${b.customer_name}'s function`);
    }
  };

  // Add an item to selectedItems
  const addItem = supplyId => {
    if (!supplyId) return;
    const found = items.find(i => String(i.id) === String(supplyId));
    if (!found) return;

    if (found.quantity <= 0) {
      return toast(`"${found.name}" is currently out of stock`, 'error');
    }

    if (selectedItems.some(i => String(i.supply_id) === String(found.id))) {
      return toast(`"${found.name}" is already in the rental list`, 'error');
    }

    setSelectedItems(prev => [
      ...prev,
      {
        supply_id: found.id,
        name: found.name,
        unit: found.unit || 'pcs',
        category: found.category || '',
        available: Number(found.quantity) || 0,
        quantity: 1,
        rent_rate: Number(found.rent_rate) || 0,
      },
    ]);
    setItemToAdd('');
  };

  const updateItemQty = (supply_id, newQty) => {
    setSelectedItems(prev =>
      prev.map(it => {
        if (it.supply_id === supply_id) {
          const val = Number(newQty);
          const clamped = isNaN(val) ? 1 : Math.max(1, Math.min(it.available, val));
          return { ...it, quantity: clamped };
        }
        return it;
      })
    );
  };

  const updateItemRate = (supply_id, newRate) => {
    setSelectedItems(prev =>
      prev.map(it => {
        if (it.supply_id === supply_id) {
          return { ...it, rent_rate: Math.max(0, Number(newRate) || 0) };
        }
        return it;
      })
    );
  };

  const removeItem = supply_id => {
    setSelectedItems(prev => prev.filter(it => it.supply_id !== supply_id));
  };

  const totalPieces = selectedItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalRent = selectedItems.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.rent_rate) || 0),
    0
  );
  const adv = Number(f.advance_amount) || 0;
  const balance = Math.max(0, totalRent - adv);

  const submit = async e => {
    e?.preventDefault?.();
    if (!f.customer_name.trim()) {
      return toast('Customer or function in-charge name is required', 'error');
    }
    if (!selectedItems.length) {
      return toast('Please select at least one equipment item to rent', 'error');
    }

    for (const it of selectedItems) {
      if (it.quantity > it.available) {
        return toast(`Only ${it.available} ${it.unit} available for "${it.name}"`, 'error');
      }
    }

    setSaving(true);
    try {
      const res = await api('/supplies/rent-bulk', {
        method: 'POST',
        body: {
          customer_name: f.customer_name.trim(),
          phone: f.phone.trim(),
          event_name: f.event_name.trim(),
          rent_date: f.rent_date,
          expected_return_date: f.expected_return_date,
          advance_amount: adv,
          payment_method: f.payment_method,
          notes: f.notes.trim(),
          items: selectedItems.map(it => ({
            supply_id: it.supply_id,
            quantity: it.quantity,
            rent_rate: it.rent_rate,
          })),
        },
      });

      toast(`Dispatched ${totalPieces} items in bulk to ${f.customer_name}`);
      onSaved(res);
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  // Build options for the item picker (custom searchable Select!)
  const itemOptions = items.map(i => ({
    value: String(i.id),
    label: `${i.name} (${i.quantity} available — ₹${i.rent_rate}/${i.unit})`,
    hint: `${i.category} · In stock: ${i.quantity} ${i.unit}`,
    disabled: i.quantity <= 0,
  }));

  // Build options for booking quick autofill (custom Select!)
  const bookingOptions = [
    { value: '', label: '-- Choose active banquet booking to auto-fill --' },
    ...activeBookings.map(b => ({
      value: String(b.id),
      label: `${b.customer_name} · ${b.hall_name} (${b.event_type || 'Function'}) on ${fmtDate(b.event_date)}`,
      hint: b.phone ? `Phone: ${b.phone}` : undefined,
    })),
  ];

  return (
    <Modal
      size="xl"
      title="Rent Out Catering & Event Equipment"
      subtitle="Rent multiple catering items, cooking vessels, stoves & tableware in bulk for functions"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="bulk-rent-form"
            type="submit"
            variant="gold"
            icon={Handshake}
            loading={saving}
            disabled={selectedItems.length === 0}
          >
            Confirm & Dispatch ({selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} · {inr(totalRent)})
          </Button>
        </>
      }
    >
      <Form id="bulk-rent-form" onSubmit={submit} className="space-y-4">
        {/* Quick autofill from Hall Bookings */}
        {activeBookings.length > 0 && (
          <div className="rounded-2xl border border-gold-200 bg-gold-50/70 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-gold-600" />
                Quick Autofill from Active Function:
              </span>
              <span className="text-[11px] text-gold-800">Optional shortcut</span>
            </div>
            <Select
              className="bg-white text-xs"
              value=""
              placeholder="-- Choose active banquet booking to auto-fill --"
              onChange={handleSelectBooking}
              options={bookingOptions}
            />
          </div>
        )}

        {/* Customer & Event Details */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer / Caterer In-Charge *">
            <Input
              required
              autoFocus
              placeholder="e.g. Ramesh Kumar / Sai Catering"
              value={f.customer_name}
              onChange={e => setF({ ...f, customer_name: e.target.value })}
            />
          </Field>
          <Field label="Mobile Phone">
            <Input
              placeholder="For sending WhatsApp dispatch slip"
              value={f.phone}
              onChange={e => setF({ ...f, phone: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Function / Event Name" className="sm:col-span-1">
            <Input
              placeholder="e.g. Marriage, Reception"
              value={f.event_name}
              onChange={e => setF({ ...f, event_name: e.target.value })}
            />
          </Field>
          <Field label="Dispatch / Rent Date *">
            <Input
              type="date"
              required
              value={f.rent_date}
              onChange={e => setF({ ...f, rent_date: e.target.value })}
            />
          </Field>
          <Field label="Expected Return Date">
            <Input
              type="date"
              value={f.expected_return_date}
              onChange={e => setF({ ...f, expected_return_date: e.target.value })}
            />
          </Field>
        </div>

        {/* Bulk Equipment Selection Bar */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
                <Boxes size={16} className="text-gold-600" />
                Select Equipment Items to Rent ({selectedItems.length} added)
              </h4>
              <p className="text-xs text-stone-500">
                Choose any item from the searchable dropdown to add it to this bulk order
              </p>
            </div>
            {selectedItems.length > 0 && (
              <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-900">
                {totalPieces} pcs total · {inr(totalRent)}
              </span>
            )}
          </div>

          <div>
            <Select
              searchable
              className="bg-white"
              value={itemToAdd}
              placeholder="🔍 Search & select equipment to add (English or Telugu)…"
              onChange={addItem}
              options={itemOptions}
            />
          </div>

          {/* Rented Items List */}
          {selectedItems.length > 0 ? (
            <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
              <div className="grid grid-cols-12 gap-2 bg-stone-50/80 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                <div className="col-span-5">Equipment Item</div>
                <div className="col-span-2 text-center">In Stock</div>
                <div className="col-span-2 text-center">Qty to Rent</div>
                <div className="col-span-2 text-right">Rent Rate (₹)</div>
                <div className="col-span-1 text-right"></div>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-stone-100">
                {selectedItems.map(it => {
                  const lineTotal = (Number(it.quantity) || 0) * (Number(it.rent_rate) || 0);
                  const isStockExceeded = it.quantity > it.available;
                  return (
                    <div key={it.supply_id} className="grid grid-cols-12 items-center gap-2 px-3 py-2.5 text-xs transition hover:bg-stone-50/50">
                      <div className="col-span-5 min-w-0">
                        <p className="font-semibold text-ink-900 truncate">{it.name}</p>
                        <p className="text-[11px] text-stone-400">{it.category}</p>
                      </div>
                      <div className="col-span-2 text-center font-mono">
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-700 font-medium">
                          {it.available} {it.unit}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            min="1"
                            max={it.available}
                            value={it.quantity}
                            onChange={e => updateItemQty(it.supply_id, e.target.value)}
                            className={cn(
                              "w-16 rounded-lg border py-1 text-center font-bold text-xs outline-none focus:border-gold-500",
                              isStockExceeded ? "border-rose-400 bg-rose-50 text-rose-700" : "border-stone-200 bg-white text-ink-900"
                            )}
                          />
                        </div>
                        {isStockExceeded && (
                          <p className="text-[10px] text-rose-600 text-center font-semibold mt-0.5">Exceeds stock!</p>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-stone-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={it.rent_rate}
                            onChange={e => updateItemRate(it.supply_id, e.target.value)}
                            className="w-16 rounded-lg border border-stone-200 bg-white py-1 px-1.5 text-right font-medium text-xs outline-none focus:border-gold-500"
                          />
                        </div>
                        <p className="text-[11px] text-gold-800 font-bold mt-0.5">Total: {inr(lineTotal)}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(it.supply_id)}
                          className="cursor-pointer rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Remove item from order"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center text-xs text-stone-500">
              <Boxes size={28} className="mx-auto mb-2 text-stone-300" />
              <p className="font-semibold text-stone-700">No equipment items selected yet</p>
              <p className="text-stone-400 mt-0.5">Choose an item from the dropdown above to add it to this bulk order.</p>
            </div>
          )}
        </div>

        {/* Financials & Advance Payment */}
        <div className="rounded-2xl border border-gold-300 bg-gold-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-200/80 pb-2.5">
            <div>
              <h4 className="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-gold-600" />
                Equipment Rental Advance & Billing
              </h4>
              <p className="text-xs text-stone-500">
                {adv > 0
                  ? (adv >= totalRent ? 'Full rental fee collected upfront' : `${inr(adv)} advance paid · Balance ${inr(balance)} due on return`)
                  : 'Record advance deposit or leave empty to collect upon return'}
              </p>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-900">
                Grand Total: {inr(totalRent)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field
                label="Advance Received (₹)"
                hint={adv > 0 ? (adv >= totalRent ? '100% upfront fee' : `Balance due on return: ${inr(balance)}`) : `Advance deposit towards ${inr(totalRent)}`}
              >
                <Input
                  type="number"
                  min="0"
                  max={totalRent || undefined}
                  step="any"
                  placeholder="0"
                  value={f.advance_amount}
                  onChange={e => setF({ ...f, advance_amount: e.target.value })}
                  className="bg-white font-medium"
                />
              </Field>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setF({ ...f, advance_amount: '' })}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                    !adv ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                  )}
                >
                  No advance (₹0)
                </button>
                {totalRent > 1000 && (
                  <button
                    type="button"
                    onClick={() => setF({ ...f, advance_amount: Math.min(1000, totalRent) })}
                    className={cn(
                      'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                      adv === Math.min(1000, totalRent) ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                    )}
                  >
                    ₹1,000
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setF({ ...f, advance_amount: totalRent })}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                    adv === totalRent && totalRent > 0 ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                  )}
                >
                  Full fee ({inr(totalRent)})
                </button>
              </div>
            </div>

            <div>
              <Field label="Payment Method">
                <Select
                  className="bg-white font-medium"
                  value={f.payment_method}
                  onChange={v => setF({ ...f, payment_method: v })}
                  options={[
                    { value: 'Cash', label: 'Cash' },
                    { value: 'UPI', label: 'UPI (PhonePe / Google Pay / Paytm)' },
                    { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                    { value: 'Card', label: 'Debit / Credit Card' },
                  ]}
                />
              </Field>
            </div>
          </div>

          <Field label="Delivery / Return Notes">
            <Input
              placeholder="e.g. Delivered by loading auto, to be returned by 5 PM Sunday"
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
              className="bg-white"
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

/**
 * Group Return Modal: Return all items in a bulk rental order in one click.
 */
function GroupReturnModal({ group, onClose, onSaved }) {
  const { toast } = useUI();
  const [damageNotes, setDamageNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const activeItems = (group?.items || []).filter(i => i.status === 'rented');

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/supplies/rentals/group/${group.groupId}/return`, {
        method: 'POST',
        body: {
          damage_notes: damageNotes.trim(),
          notes: notes.trim(),
        },
      });
      toast(`All ${activeItems.length} items from order marked as returned`);
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      size="md"
      title={`Return Order: ${group.customer_name}`}
      subtitle={`Order #${group.groupId || 'DISPATCH'} · ${activeItems.length} active items returning into stock`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="gold"
            icon={RotateCcw}
            loading={saving}
            onClick={submit}
          >
            Confirm Return of All Items
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <p className="text-xs font-semibold text-ink-900 mb-2">Items being returned into inventory:</p>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto divide-y divide-stone-100 text-xs">
            {activeItems.map(it => (
              <li key={it.id} className="pt-1.5 flex items-center justify-between">
                <span className="font-medium text-ink-900">{it.supply_name}</span>
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                  {it.quantity} {it.supply_unit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Field label="Missing / Damaged Items Note" hint="Leave blank if all items returned in good condition">
          <Input
            placeholder="e.g. 1 plate broken, 2 spoons missing"
            value={damageNotes}
            onChange={e => setDamageNotes(e.target.value)}
          />
        </Field>

        <Field label="Return Remarks">
          <Input
            placeholder="e.g. Checked by storekeeper, balance settled in cash"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Return Modal: Receives rented items back from a function.
 */
function ReturnModal({ rental, onClose, onSaved }) {
  const { toast } = useUI();
  const [returnedQty, setReturnedQty] = useState(String(rental.quantity));
  const [damageNotes, setDamageNotes] = useState('');
  const [notes, setNotes] = useState(rental.notes || '');
  const [saving, setSaving] = useState(false);

  const returnedNum = Number(returnedQty) || 0;
  const differenceLost = Math.max(0, rental.quantity - returnedNum);

  const submit = async () => {
    if (returnedNum < 0) {
      return toast('Returned quantity cannot be negative', 'error');
    }
    if (returnedNum > rental.quantity) {
      return toast(`Returned quantity cannot exceed rented quantity (${rental.quantity})`, 'error');
    }

    setSaving(true);
    try {
      await api(`/supplies/rentals/${rental.id}/return`, {
        method: 'POST',
        body: {
          returned_quantity: returnedNum,
          damage_notes: damageNotes.trim(),
          notes: notes.trim(),
        },
      });
      toast(`Received ${returnedNum} ${rental.supply_unit} back into inventory`);
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      size="md"
      title="Receive Equipment Return"
      subtitle={`Return from ${rental.customer_name}${rental.event_name ? ` (${rental.event_name})` : ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="return-form"
            type="submit"
            variant="success"
            icon={RotateCcw}
            loading={saving}
          >
            Confirm & Return to Stock
          </Button>
        </>
      }
    >
      <Form id="return-form" onSubmit={submit} className="space-y-4">
        {/* Rental Summary Card */}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Rented Equipment
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {rental.quantity} {rental.supply_unit} Rented
            </span>
          </div>
          <p className="font-semibold text-ink-900 text-base">{rental.supply_name}</p>
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-stone-600 border-t border-stone-200/60">
            <div>
              <span className="text-stone-400">Rented Date:</span> {fmtDate(rental.rent_date)}
            </div>
            <div>
              <span className="text-stone-400">Total Rent:</span> {inr(rental.total_rent)}
            </div>
          </div>
        </div>

        <Field
          label={`Quantity Returned (${rental.supply_unit}) *`}
          hint={
            differenceLost > 0 ? (
              <span className="text-rose-600 font-medium">
                ⚠️ {differenceLost} {rental.supply_unit} missing or damaged! Total inventory will be adjusted.
              </span>
            ) : (
              'Full quantity returned in complete count'
            )
          }
        >
          <Input
            type="number"
            min="0"
            max={rental.quantity}
            step="any"
            required
            autoFocus
            value={returnedQty}
            onChange={e => setReturnedQty(e.target.value)}
          />
        </Field>

        <Field label="Condition / Damage Notes">
          <Input
            placeholder="e.g. All in good condition / 2 chairs broken during function"
            value={damageNotes}
            onChange={e => setDamageNotes(e.target.value)}
          />
        </Field>

        <Field label="General Notes">
          <Input
            placeholder="Additional remarks…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </Field>
      </Form>
    </Modal>
  );
}

/**
 * Move Modal: Handles manual stock additions (purchases) or adjustments.
 */
function MoveModal({ item, type: initial, onClose, onSaved }) {
  const { toast } = useUI();
  const [type, setType] = useState(initial);
  const [f, setF] = useState({ quantity: '', note: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/supplies/${item.id}/move`, { method: 'POST', body: { ...f, type } });
      toast(type === 'in' ? 'Stock received' : 'Stock retired/issued');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  const after = Number(f.quantity || 0) * (type === 'in' ? 1 : -1) + item.quantity;

  return (
    <Modal
      size="sm"
      title={item.name}
      subtitle={`Current stock: ${item.quantity} ${item.unit}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="move-form"
            type="submit"
            variant={type === 'in' ? 'success' : 'gold'}
            loading={saving}
          >
            {type === 'in' ? 'Add Stock' : 'Retire Stock'}
          </Button>
        </>
      }
    >
      <Form id="move-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={type}
          onChange={setType}
          className="w-full"
          options={[
            { value: 'in', label: 'Stock In (Purchase)', icon: ArrowDownToLine },
            { value: 'out', label: 'Stock Out (Retire)', icon: ArrowUpFromLine },
          ]}
        />
        <Field
          label={`Quantity (${item.unit})`}
          hint={f.quantity ? `Stock after: ${after} ${item.unit}` : undefined}
        >
          <Input
            type="number"
            min="0.01"
            step="any"
            required
            autoFocus
            value={f.quantity}
            onChange={e => setF({ ...f, quantity: e.target.value })}
          />
        </Field>
        <Field label="Note / Bill Reference">
          <Input
            value={f.note}
            onChange={e => setF({ ...f, note: e.target.value })}
            placeholder={
              type === 'in' ? 'e.g. New stock purchased, Bill #124' : 'e.g. Broken/retired units'
            }
          />
        </Field>
      </Form>
    </Modal>
  );
}

/**
 * Item Modal: Add or edit master equipment items (Admin only).
 */
function ItemModal({ item, categories = DEFAULT_SUPPLY_CATEGORIES, onClose, onSaved }) {
  const [f, setF] = useState(() =>
    item.id
      ? { ...item }
      : {
          name: '',
          category: categories[0] || 'Banquet Furniture',
          unit: 'pcs',
          total_quantity: 100,
          quantity: 100,
          min_quantity: 10,
          rent_rate: 15,
          unit_cost: 0,
        }
  );

  const [saving, save] = useSave('/supplies', item.id, 'Equipment Item', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal
      title={item.id ? `Edit: ${item.name}` : 'Add New Equipment Item'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="item-form" type="submit" loading={saving}>
            Save Equipment
          </Button>
        </>
      }
    >
      <Form id="item-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Equipment Name *" className="sm:col-span-2">
          <Input
            required
            placeholder="e.g. Banquet Chairs, Buffet Warmers, PA System"
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Combobox
            value={f.category}
            onChange={v => set('category', v)}
            options={categories}
            placeholder="Banquet Furniture, Linens…"
          />
        </Field>
        <Field label="Unit">
          <Input
            value={f.unit}
            onChange={e => set('unit', e.target.value)}
            placeholder="pcs, sets, rolls, pairs…"
          />
        </Field>
        <Field
          label="Total Inventory Owned"
          hint={item.id ? 'Total units in property inventory' : undefined}
        >
          <Input
            type="number"
            min="0"
            step="any"
            value={f.total_quantity}
            onChange={e => {
              const val = e.target.value;
              setF(prev => ({
                ...prev,
                total_quantity: val,
                // if creating new item, quantity matches total_quantity
                ...(!item.id ? { quantity: val } : {}),
              }));
            }}
          />
        </Field>
        <Field label="Rent Rate per Function (₹)">
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 15 for chair, 100 for table"
            value={f.rent_rate}
            onChange={e => set('rent_rate', e.target.value)}
          />
        </Field>
        <Field label="Asset / Replacement Cost (₹)" hint="Original purchase or replacement cost">
          <Input
            type="number"
            min="0"
            step="any"
            value={f.unit_cost}
            onChange={e => set('unit_cost', e.target.value)}
          />
        </Field>
        <Field label="Minimum Alert Threshold" hint="Alert when stock falls below this">
          <Input
            type="number"
            min="0"
            step="any"
            value={f.min_quantity}
            onChange={e => set('min_quantity', e.target.value)}
          />
        </Field>
      </Form>
    </Modal>
  );
}

/**
 * MovesList: Renders inward/outward and rental movements.
 */
function MovesList({ supplyId, onShareWa }) {
  const { data } = useApi(`/supplies/moves${supplyId ? `?supply_id=${supplyId}` : ''}`);
  if (!data) return <PageLoader />;
  if (!data.length) return <EmptyState icon={History} title="No movement records yet" />;

  const META = {
    in: ['Received / Returned', 'bg-emerald-50 text-emerald-600', ArrowDownToLine],
    out: ['Issued / Rented', 'bg-amber-50 text-amber-600', ArrowUpFromLine],
    adjust: ['Corrected', 'bg-sky-50 text-sky-600', SlidersHorizontal],
  };

  return (
    <div className="divide-y divide-stone-100">
      {data.map(m => {
        const meta = META[m.type] || ['Movement', 'bg-stone-50 text-stone-600', History];
        const [label, tone, Icon] = meta;
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-stone-50/50 transition"
          >
            <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tone)}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <b className="font-semibold text-ink-900">{label}</b>
                {!supplyId && (
                  <span className="text-stone-700 font-medium"> · {m.supply_name}</span>
                )}
              </p>
              <p className="truncate text-xs text-stone-500 mt-0.5">
                {fmtDateTime(m.created_at)} · {m.created_by_name || 'Staff'}
                {m.note ? ` · ${m.note}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'font-semibold text-sm',
                  m.quantity >= 0 ? 'text-emerald-600' : 'text-amber-600'
                )}
              >
                {m.quantity > 0 ? '+' : ''}
                {m.quantity} {m.unit}
              </p>
              <p className="text-xs text-stone-400">Balance: {m.balance}</p>
            </div>
            {onShareWa && (
              <button
                type="button"
                onClick={() =>
                  onShareWa({
                    item: {
                      name: m.supply_name || 'Equipment',
                      unit: m.unit,
                      category: 'Equipment',
                    },
                    move: m,
                  })
                }
                title="Share movement receipt on WhatsApp"
                className="ml-1 cursor-pointer rounded-lg p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition shrink-0"
              >
                <WhatsAppIcon size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
