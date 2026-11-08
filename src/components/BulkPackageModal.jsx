import { useMemo, useState } from 'react';
import {
  BedDouble,
  Boxes,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Handshake,
  Landmark,
  Layers,
  PartyPopper,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users as UsersIcon,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
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
  Segmented,
  Textarea,
  cn,
  useUI,
} from './ui.jsx';
import { SLOTS, addDays, fmtDate, inr, nights, today } from '../utils.js';
import { Select } from './pickers.jsx';

export default function BulkPackageModal({ onClose, onSaved }) {
  const { settings } = useSettings();
  const { toast } = useUI();

  // Load halls, rooms, and supplies
  const hallsApi = useApi('/halls');
  const roomsApi = useApi('/rooms');
  const suppliesApi = useApi('/supplies');

  // Customer & Event State
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const eventTypes = (settings.event_types || 'Wedding, Other').split(',').map(s => s.trim()).filter(Boolean);
  const [eventType, setEventType] = useState(() => eventTypes[0] || 'Wedding');
  const [eventDate, setEventDate] = useState(() => today());
  const [slot, setSlot] = useState('full');
  const [checkInDate, setCheckInDate] = useState(() => today());
  const [checkOutDate, setCheckOutDate] = useState(() => addDays(today(), 1));
  const [notes, setNotes] = useState('');

  // Hall Selection
  const [selectedHallId, setSelectedHallId] = useState(null); // null means no hall
  const [customHallRent, setCustomHallRent] = useState('');

  // Rooms Selection: map of roomId -> { selected: boolean, rate: number }
  const [selectedRooms, setSelectedRooms] = useState({});

  // Supplies Selection: map of supplyId -> { quantity: number, rate: number }
  const [selectedSupplies, setSelectedSupplies] = useState({});
  const [supplySearch, setSupplySearch] = useState('');
  const [supplyCat, setSupplyCat] = useState('All');

  // Payment State
  const [advance, setAdvance] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);

  // Sync check-in / check-out when event date changes
  const handleEventDateChange = d => {
    setEventDate(d);
    setCheckInDate(d);
    setCheckOutDate(addDays(d, 1));
  };

  const halls = hallsApi.data || [];
  const rooms = roomsApi.data || [];
  const supplies = suppliesApi.data || [];

  // Filter supplies by category and search
  const supplyCategories = ['All', ...new Set(supplies.map(s => s.category).filter(Boolean))];
  const filteredSupplies = supplies.filter(s => {
    if (supplyCat !== 'All' && s.category !== supplyCat) return false;
    if (!supplySearch) return true;
    const q = supplySearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q);
  });

  // Calculate Hall Amount
  const chosenHall = halls.find(h => h.id === selectedHallId);
  const defaultHallRent = chosenHall ? (slot === 'full' ? chosenHall.rate_full : chosenHall.rate_half) : 0;
  const hallAmount = chosenHall ? (customHallRent !== '' ? Number(customHallRent) || 0 : defaultHallRent) : 0;

  // Calculate Rooms Amount (rate per night x nights)
  const stayNights = Math.max(1, nights(checkInDate, checkOutDate));
  const roomsAmount = Object.entries(selectedRooms).reduce((sum, [rId, rData]) => {
    if (!rData.selected) return sum;
    return sum + (Number(rData.rate) || 0) * stayNights;
  }, 0);

  const selectedRoomsCount = Object.values(selectedRooms).filter(r => r.selected).length;

  // Calculate Supplies Amount
  const suppliesAmount = Object.entries(selectedSupplies).reduce((sum, [sId, sData]) => {
    const qty = Number(sData.quantity) || 0;
    const rate = Number(sData.rate) || 0;
    return sum + qty * rate;
  }, 0);

  const selectedSuppliesCount = Object.values(selectedSupplies).filter(s => (Number(s.quantity) || 0) > 0).length;

  // Grand Total
  const grandTotal = hallAmount + roomsAmount + suppliesAmount;
  const advanceAmount = Math.min(grandTotal, Math.max(0, Number(advance) || 0));
  const balanceDue = Math.max(0, grandTotal - advanceAmount);

  // Room Toggle Helper
  const toggleRoom = r => {
    setSelectedRooms(prev => {
      const current = prev[r.id];
      if (current?.selected) {
        const next = { ...prev };
        delete next[r.id];
        return next;
      }
      return {
        ...prev,
        [r.id]: { selected: true, rate: r.rate, guests: r.capacity || 2 },
      };
    });
  };

  const selectAllRooms = () => {
    const next = {};
    rooms.forEach(r => {
      next[r.id] = { selected: true, rate: r.rate, guests: r.capacity || 2 };
    });
    setSelectedRooms(next);
  };

  const clearAllRooms = () => setSelectedRooms({});

  // Supply Quantity Helper
  const updateSupplyQty = (item, qty) => {
    const validQty = Math.max(0, Math.min(item.quantity, Number(qty) || 0));
    setSelectedSupplies(prev => {
      if (validQty <= 0) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return {
        ...prev,
        [item.id]: {
          quantity: validQty,
          rate: prev[item.id]?.rate !== undefined ? prev[item.id].rate : (item.rent_rate || 0),
        },
      };
    });
  };

  // Submit Handler
  const handleSubmit = async e => {
    e?.preventDefault?.();
    if (!customerName.trim()) return toast('Customer name is required', 'error');
    if (!phone.trim()) return toast('Customer phone is required', 'error');
    if (!eventDate) return toast('Event date is required', 'error');
    if (!selectedHallId && selectedRoomsCount === 0 && selectedSuppliesCount === 0) {
      return toast('Please select at least a Hall, Rooms, or Catering items', 'error');
    }
    if (selectedRoomsCount > 0 && !(checkOutDate > checkInDate)) {
      return toast('Rooms check-out must be after check-in', 'error');
    }

    setSaving(true);
    try {
      // Format rooms payload
      const roomsPayload = Object.entries(selectedRooms)
        .filter(([, r]) => r.selected)
        .map(([rId, r]) => ({
          room_id: Number(rId),
          check_in: checkInDate,
          check_out: checkOutDate,
          rate: Number(r.rate) || 0,
          guests: Number(r.guests) || 2,
        }));

      // Format supplies payload
      const suppliesPayload = Object.entries(selectedSupplies)
        .filter(([, s]) => Number(s.quantity) > 0)
        .map(([sId, s]) => ({
          supply_id: Number(sId),
          quantity: Number(s.quantity),
          rent_rate: Number(s.rate) || 0,
        }));

      const payload = {
        customer_name: customerName.trim(),
        phone: phone.trim(),
        event_type: eventType,
        event_date: eventDate,
        slot,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        hall_id: selectedHallId,
        hall_rent: chosenHall ? hallAmount : 0,
        rooms: roomsPayload,
        supplies: suppliesPayload,
        advance: advanceAmount,
        payment_method: paymentMethod,
        notes: notes.trim(),
      };

      const res = await api('/packages', {
        method: 'POST',
        body: payload,
      });

      toast(`Combo booked for ${customerName}. Total: ${inr(grandTotal)}`);
      onSaved(res);
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      size="xl"
      title="New Combo Booking"
      subtitle="Pick any mix of hall, rooms and supplies. Everything goes on one combined bill."
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-xs text-stone-500 font-medium block">Combo Total:</span>
            <span className="font-display text-xl font-bold text-ink-900">{inr(grandTotal)}</span>
            {advanceAmount > 0 && (
              <span className="text-xs text-emerald-700 ml-2 font-medium">
                (Adv: {inr(advanceAmount)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              form="bulk-package-form"
              type="submit"
              variant="gold"
              icon={Sparkles}
              loading={saving}
            >
              Confirm Combo Booking
            </Button>
          </div>
        </div>
      }
    >
      <Form id="bulk-package-form" onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: CUSTOMER & EVENT SCHEDULE */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3.5">
          <div className="flex items-center gap-2 border-b border-stone-200/80 pb-2">
            <PartyPopper size={16} className="text-gold-700" />
            <h3 className="font-semibold text-xs tracking-wider uppercase text-ink-900">
              1. Customer & Event Information
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Customer / Party Name *">
              <Input
                required
                autoFocus
                placeholder="e.g. Ramesh Kumar"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </Field>
            <Field label="Mobile Phone *">
              <Input
                required
                placeholder="10-digit mobile number"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Event / Occasion">
              <Select
                className="bg-white"
                value={eventType}
                onChange={v => setEventType(v)}
                options={eventTypes}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Event Date *">
              <Input
                type="date"
                required
                value={eventDate}
                onChange={e => handleEventDateChange(e.target.value)}
              />
            </Field>
            <Field label="Hall Slot">
              <Segmented
                value={slot}
                onChange={setSlot}
                className="w-full bg-white border border-stone-200"
                options={Object.entries(SLOTS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Rooms Check-in">
                <Input
                  type="date"
                  value={checkInDate}
                  onChange={e => setCheckInDate(e.target.value)}
                />
              </Field>
              <Field label="Rooms Check-out">
                <Input
                  type="date"
                  value={checkOutDate}
                  onChange={e => setCheckOutDate(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* SECTION 2: BANQUET HALL SELECTION */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-gold-700" />
              <h3 className="font-semibold text-xs tracking-wider uppercase text-ink-900">
                2. Banquet Hall Selection
              </h3>
            </div>
            {chosenHall && (
              <span className="text-xs font-bold text-ink-900">
                Hall Subtotal: {inr(hallAmount)}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {halls.map(h => {
              const isCombo = !!h.is_combo;
              const rate = slot === 'full' ? h.rate_full : h.rate_half;
              const isSelected = selectedHallId === h.id;

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHallId(isSelected ? null : h.id)}
                  className={cn(
                    'relative cursor-pointer rounded-xl border p-3.5 transition select-none',
                    isSelected
                      ? 'border-gold-500 bg-gold-50/70 ring-2 ring-gold-400'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-ink-900">{h.name}</p>
                    {isCombo && (
                      <span className="rounded-full bg-gold-200 px-2 py-0.5 text-[10px] font-bold text-gold-900 uppercase">
                        Combo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Capacity: {h.capacity} guests</p>
                  <p className="font-bold text-ink-900 text-sm mt-2">
                    {inr(rate)}{' '}
                    <span className="text-[11px] font-normal text-stone-500">
                      ({SLOTS[slot]})
                    </span>
                  </p>
                  {isSelected && (
                    <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-gold-500 text-ink-900 text-xs">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {chosenHall && (
            <div className="flex items-center justify-between rounded-xl bg-stone-50 p-3 text-xs">
              <span className="text-stone-600">
                Selected: <b>{chosenHall.name}</b> (Standard rate: {inr(defaultHallRent)})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-stone-500">Override Rent:</span>
                <Input
                  className="w-28 text-xs h-8 bg-white"
                  type="number"
                  placeholder={String(defaultHallRent)}
                  value={customHallRent}
                  onChange={e => setCustomHallRent(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: GUEST ROOMS SELECTION */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <BedDouble size={16} className="text-gold-700" />
              <h3 className="font-semibold text-xs tracking-wider uppercase text-ink-900">
                3. Select Guest Rooms ({selectedRoomsCount} selected)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllRooms}
                className="cursor-pointer text-xs font-semibold text-gold-700 hover:text-gold-900 hover:underline"
              >
                Select All
              </button>
              <span className="text-stone-300">·</span>
              <button
                type="button"
                onClick={clearAllRooms}
                className="cursor-pointer text-xs text-stone-400 hover:text-stone-600"
              >
                Clear
              </button>
              {roomsAmount > 0 && (
                <span className="ml-2 text-xs font-bold text-ink-900">
                  Rooms: {inr(roomsAmount)} ({stayNights} night{stayNights > 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map(r => {
              const isSelected = !!selectedRooms[r.id]?.selected;
              return (
                <div
                  key={r.id}
                  onClick={() => toggleRoom(r)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-xl border p-3 transition select-none',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      readOnly
                      checked={isSelected}
                      className="h-4 w-4 rounded accent-emerald-600"
                    />
                    <div>
                      <p className="font-semibold text-xs text-ink-900">
                        {r.number} — {r.name}
                      </p>
                      <p className="text-[11px] text-stone-400">{r.type}</p>
                    </div>
                  </div>
                  <span className="font-bold text-xs text-ink-900">{inr(r.rate)}<span className="font-normal text-stone-400">/night</span></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 4: CATERING & FUNCTION EQUIPMENT SELECTION */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <Boxes size={16} className="text-gold-700" />
              <h3 className="font-semibold text-xs tracking-wider uppercase text-ink-900">
                4. Catering & Equipment Rentals ({selectedSuppliesCount} items)
              </h3>
            </div>
            {suppliesAmount > 0 && (
              <span className="text-xs font-bold text-ink-900">
                Equipment: {inr(suppliesAmount)}
              </span>
            )}
          </div>

          {/* Quick Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {supplyCategories.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSupplyCat(c)}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                    supplyCat === c
                      ? 'bg-ink-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-52">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400"
              />
              <Input
                className="pl-8 text-xs h-7"
                placeholder="Search items / తెలుగు..."
                value={supplySearch}
                onChange={e => setSupplySearch(e.target.value)}
              />
            </div>
          </div>

          {/* Equipment Grid */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-stone-100 border border-stone-100 rounded-xl p-2 bg-stone-50/30">
            {filteredSupplies.map(item => {
              const currentQty = selectedSupplies[item.id]?.quantity || 0;
              const isPicked = currentQty > 0;
              const itemTotal = currentQty * (item.rent_rate || 0);

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between gap-3 pt-1.5 pb-1 px-2 rounded-lg transition',
                    isPicked ? 'bg-amber-50/80 font-medium' : 'hover:bg-white'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-900 font-semibold truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-stone-400">
                      <span>{item.category}</span>
                      <span>·</span>
                      <span>
                        Rate: ₹{item.rent_rate}/{item.unit}
                      </span>
                      <span>·</span>
                      <span className="text-emerald-700 font-medium">
                        {item.quantity} available
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isPicked && (
                      <span className="text-xs font-bold text-amber-900">
                        {inr(itemTotal)}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max={item.quantity}
                        className="w-18 text-center text-xs h-7 bg-white"
                        placeholder="0"
                        value={currentQty || ''}
                        onChange={e => updateSupplyQty(item, e.target.value)}
                      />
                      <span className="text-[11px] text-stone-400">{item.unit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: CONSOLIDATED PRICING & ADVANCE */}
        <div className="rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50/80 to-amber-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gold-200 pb-2.5">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-gold-700" />
              <h3 className="font-semibold text-xs tracking-wider uppercase text-ink-900">
                5. Combined Bill & Advance
              </h3>
            </div>
            <span className="text-xs font-semibold text-stone-600">One combined bill</span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-3 border border-gold-200/60 shadow-xs">
              <span className="text-[11px] text-stone-500 font-medium block">🏛️ Hall Rent</span>
              <p className="font-display text-lg font-bold text-ink-900 mt-1">{inr(hallAmount)}</p>
              <span className="text-[11px] text-stone-400">
                {chosenHall ? chosenHall.name : 'No hall'}
              </span>
            </div>

            <div className="rounded-xl bg-white p-3 border border-gold-200/60 shadow-xs">
              <span className="text-[11px] text-stone-500 font-medium block">
                🛏️ Rooms ({selectedRoomsCount})
              </span>
              <p className="font-display text-lg font-bold text-ink-900 mt-1">{inr(roomsAmount)}</p>
              <span className="text-[11px] text-stone-400">
                {selectedRoomsCount ? `${selectedRoomsCount} room${selectedRoomsCount > 1 ? 's' : ''} × ${stayNights} night${stayNights > 1 ? 's' : ''}` : 'No rooms'}
              </span>
            </div>

            <div className="rounded-xl bg-white p-3 border border-gold-200/60 shadow-xs">
              <span className="text-[11px] text-stone-500 font-medium block">
                📦 Equipment ({selectedSuppliesCount})
              </span>
              <p className="font-display text-lg font-bold text-ink-900 mt-1">
                {inr(suppliesAmount)}
              </p>
              <span className="text-[11px] text-stone-400">Catering rentals</span>
            </div>

            <div className="rounded-xl bg-ink-900 text-white p-3 shadow-sm shadow-ink-900/10">
              <span className="text-[11px] text-gold-300 font-semibold uppercase tracking-wider block">
                ⭐ Grand Total
              </span>
              <p className="font-display text-xl font-bold text-white mt-1">{inr(grandTotal)}</p>
              <span className="text-[11px] text-stone-300">
                Due: {inr(balanceDue)}
              </span>
            </div>
          </div>

          {/* Advance Input & Preset Chips */}
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-gold-200/60">
            <div>
              <label className="text-xs font-semibold text-ink-900 block mb-1">
                Advance Payment Received (₹)
              </label>
              <Input
                type="number"
                min="0"
                max={grandTotal}
                placeholder="0"
                className="bg-white text-base font-semibold"
                value={advance}
                onChange={e => setAdvance(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: 'No advance (₹0)', val: '0' },
                  { label: '₹10,000', val: '10000' },
                  { label: '₹25,000', val: '25000' },
                  { label: `Full Fee (${inr(grandTotal)})`, val: String(grandTotal) },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAdvance(p.val)}
                    className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-xs text-stone-700 hover:border-gold-400 hover:bg-gold-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-900 block mb-1">
                Payment Method
              </label>
              <Select
                className="bg-white"
                value={paymentMethod}
                onChange={v => setPaymentMethod(v)}
                options={[
                  { value: 'Cash', label: 'Cash' },
                  { value: 'UPI', label: 'UPI (PhonePe / Google Pay / Paytm)' },
                  { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                  { value: 'Card', label: 'Debit / Credit Card' },
                ]}
              />

              <Field label="Special Notes / Instructions" className="mt-2">
                <Input
                  placeholder="e.g. Early check-in requested, extra chairs on stage…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>
      </Form>
    </Modal>
  );
}
