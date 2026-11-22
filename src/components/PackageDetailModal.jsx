import { useState } from 'react';
import { BedDouble, Boxes, CreditCard, Drum, Flower2, Landmark, Pencil, Plus, Printer, Trash2, Zap } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { Badge, Button, Card, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';
import { esc, fmtDate, fmtDateTime, generatorRows, generatorText, inr, nights, slotName, today } from '../utils.js';
import { useSettings } from '../settings.jsx';
import { useAuth } from '../auth.jsx';
import { ExtraChargesForm } from './ExtraChargesForm.jsx';
import AddHallExtras from './AddHallExtras.jsx';
import { Select } from './pickers.jsx';
import { WhatsAppIcon } from './WhatsAppModal.jsx';

export default function PackageDetailModal({ packageId, onClose, onRefresh, onShareWa, onDeleted }) {
  const { toast, confirm } = useUI();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const { data: pkg, reload } = useApi(`/packages/${packageId}`);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [addingExtras, setAddingExtras] = useState(false);
  const [roomEdit, setRoomEdit] = useState(null); // { id, rate } while the admin changes a room's price

  // Payment State
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!pkg) return null;

  const isCancelled = pkg.status === 'cancelled';
  const balance = Number(pkg.balance) || 0;
  const grandTotal = Number(pkg.grand_total ?? pkg.total_amount) || 0;
  // Power & generator for the combo's hall: staff from the event day while the hall booking is
  // open, admin any time (same rule as the hall booking itself)
  const hall = pkg.hall;
  const hasExtras = hall && (Number(hall.power_amount) > 0 || Number(hall.generator_amount) > 0);
  const endPending = hall && Number(hall.power_start) > 0 && !(Number(hall.power_end) > 0);
  const canAddExtras = hall && !isCancelled && hall.status !== 'cancelled'
    && (isAdmin || (['tentative', 'confirmed'].includes(hall.status) && hall.event_date <= today()) || (hall.status === 'completed' && endPending));

  const handlePayment = async e => {
    e?.preventDefault?.();
    const amt = Number(payAmount) || 0;
    if (amt <= 0) return toast('Please enter a valid payment amount', 'error');
    if (amt > balance) return toast(`Amount cannot exceed pending balance of ${inr(balance)}`, 'error');

    setPaying(true);
    try {
      await api(`/packages/${pkg.id}/payment`, {
        method: 'POST',
        body: { amount: amt, method: payMethod, note: payNote.trim() },
      });
      toast(`Payment of ${inr(amt)} recorded`);
      setPayModal(false);
      setPayAmount('');
      reload();
      onRefresh?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPaying(false);
    }
  };

  // Admin only: remove the combo for good (the server refuses anyone else)
  const handleDeletePackage = async () => {
    const paid = Number(pkg.advance_paid) || 0;
    const ok = await confirm({
      title: pkg.bill_no ? `Delete combo ${pkg.bill_no}?` : 'Delete this combo?',
      message: [
        `This permanently removes ${pkg.customer_name}'s combo: the hall booking, ${pkg.rooms?.length || 0} room booking(s) and ${pkg.supplies?.length || 0} supply item(s).`,
        paid > 0 && `${inr(paid)} of payments received will also be deleted from the records.`,
        'Supplies still out go back to stock. This cannot be undone. To keep it on record, use Cancel Combo instead.',
      ].filter(Boolean).join(' '),
      danger: true,
      confirmText: 'Delete combo',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api(`/packages/${pkg.id}`, { method: 'DELETE' });
      toast('Combo deleted');
      if (onDeleted) onDeleted();
      else { onRefresh?.(); onClose(); }
    } catch (err) {
      toast(err.message, 'error');
      setDeleting(false);
    }
  };

  // Admin: change one room's rate per night; the combo bill follows
  const saveRoomRate = async () => {
    const rate = Number(roomEdit.rate);
    if (!(rate >= 0) || roomEdit.rate === '') return toast('Enter a valid rate per night', 'error');
    try {
      await api(`/packages/${pkg.id}/rooms/${roomEdit.id}`, { method: 'PATCH', body: { rate } });
      toast('Room price updated');
      setRoomEdit(null);
      reload();
      onRefresh?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleCancelPackage = async () => {
    if (!window.confirm(`Are you sure you want to cancel the entire combo for ${pkg.customer_name}? This will release the hall, cancel room reservations, and restore all rented equipment back to inventory.`)) {
      return;
    }
    setCancelling(true);
    try {
      await api(`/packages/${pkg.id}/cancel`, { method: 'PATCH' });
      toast('Combo cancelled. Hall, rooms and supplies released.');
      reload();
      onRefresh?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Modal
        size="lg"
        title={`Combo ${pkg.bill_no || `#${pkg.id}`} · ${pkg.customer_name}`}
        subtitle={`${pkg.customer_name} · ${pkg.phone} · ${fmtDate(pkg.event_date)} (${slotLabel(pkg.slot)})`}
        onClose={onClose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {!isCancelled && (
                <Button
                  variant="danger-soft"
                  size="sm"
                  loading={cancelling}
                  onClick={handleCancelPackage}
                >
                  Cancel Combo
                </Button>
              )}
              {isAdmin && (
                <Button variant="danger-soft" size="sm" icon={Trash2} loading={deleting} onClick={handleDeletePackage}>
                  Delete combo
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" icon={Printer} onClick={() => printComboBill(pkg, settings)}>
                Print combined bill
              </Button>
              <Button
                variant="outline"
                icon={WhatsAppIcon}
                onClick={() => onShareWa?.(pkg)}
                className="text-emerald-700"
              >
                WhatsApp Voucher
              </Button>
              {pkg.hall && !isCancelled && ['tentative', 'confirmed'].includes(pkg.hall.status) && (
                <Button variant="outline" icon={Plus} onClick={() => setAddingExtras(true)}>Add more</Button>
              )}
              {balance > 0 && !isCancelled && (
                <Button variant="gold" icon={CreditCard} onClick={() => setPayModal(true)}>
                  Take Payment ({inr(balance)})
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Status & Financial Banner */}
          <div className="rounded-2xl border border-gold-200 bg-gradient-to-br from-gold-50/80 to-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-200/60 pb-3">
              <div>
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
                  Combo Status
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {isCancelled ? (
                    <Badge tone="rose">Cancelled</Badge>
                  ) : balance === 0 ? (
                    <Badge tone="green" dot>
                      Fully Paid
                    </Badge>
                  ) : (
                    <Badge tone="amber" dot>
                      Confirmed (Pending Due)
                    </Badge>
                  )}
                  <span className="text-xs text-stone-500 font-medium">
                    Created on {fmtDateTime(pkg.created_at)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-stone-400 block">Combined Bill Total</span>
                <span className="font-display text-2xl font-bold text-ink-900">
                  {inr(grandTotal)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 text-center">
              <div className="rounded-xl bg-white p-2.5 border border-stone-200/60">
                <span className="text-[11px] text-stone-500 block">Paid</span>
                <span className="font-bold text-sm text-emerald-700">
                  {inr(pkg.advance_paid)}
                </span>
              </div>
              <div className="rounded-xl bg-white p-2.5 border border-stone-200/60">
                <span className="text-[11px] text-stone-500 block">Pending Balance</span>
                <span className={cn('font-bold text-sm', balance > 0 ? 'text-rose-600' : 'text-stone-700')}>
                  {inr(balance)}
                </span>
              </div>
              <div className="rounded-xl bg-white p-2.5 border border-stone-200/60">
                <span className="text-[11px] text-stone-500 block">Payment Method</span>
                <span className="font-bold text-sm text-ink-900">{pkg.payment_method || 'Cash'}</span>
              </div>
            </div>
          </div>

          {/* Section: Banquet Hall */}
          {pkg.hall && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  <Landmark size={15} className="text-gold-700" />
                  <span>1. Banquet Hall</span>
                </div>
                <span className="font-bold text-xs text-ink-900">
                  {inr((Number(pkg.hall_amount) || 0) + (Number(pkg.extras_amount) || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="font-semibold text-sm text-ink-900">{pkg.hall.hall_name}</p>
                  <p className="text-xs text-stone-500">
                    Slot: {slotLabel(pkg.hall.slot)} · Date:{' '}
                    {fmtDate(pkg.hall.event_date)}
                  </p>
                  {Number(pkg.hall.discount) > 0 && (
                    <p className="text-xs text-emerald-700">
                      Hall {inr(Number(pkg.hall_amount) + Number(pkg.hall.discount))} − {inr(pkg.hall.discount)} discount = {inr(pkg.hall_amount)}
                    </p>
                  )}
                </div>
                <Badge tone="green">Hall Booked</Badge>
              </div>
              {chargesOpen ? (
                <ExtraChargesForm
                  booking={pkg.hall}
                  billTotal={grandTotal}
                  billPaid={Number(pkg.advance_paid) || 0}
                  onCancel={() => setChargesOpen(false)}
                  onDone={async () => { setChargesOpen(false); await reload(); onRefresh?.(); }}
                />
              ) : canAddExtras ? (
                <Button size="sm" variant="outline" icon={Zap} onClick={() => setChargesOpen(true)}>
                  {endPending ? 'Add end reading' : hasExtras ? 'Change power & generator bill' : 'Add power & generator bill'}
                </Button>
              ) : !isCancelled && hall.status !== 'completed' && (
                <p className="text-xs text-stone-500">Power & generator bill can be added from {fmtDate(hall.event_date)}.</p>
              )}
              {endPending && (
                <p className="text-xs font-semibold text-amber-700">Meter start reading {pkg.hall.power_start} saved · end reading pending</p>
              )}
              {Number(pkg.hall.power_amount) > 0 && (
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Power bill ({pkg.hall.power_units} units @ ₹{pkg.hall.power_rate}/unit)</span>
                  <span className="font-bold text-ink-900">{inr(pkg.hall.power_amount)}</span>
                </div>
              )}
              {Number(pkg.hall.generator_amount) > 0 && (
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Generator ({generatorText(pkg.hall)})</span>
                  <span className="font-bold text-ink-900">{inr(pkg.hall.generator_amount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Section: Reserved Rooms */}
          {pkg.rooms && pkg.rooms.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  <BedDouble size={15} className="text-gold-700" />
                  <span>2. Reserved Guest Rooms ({pkg.rooms.length} rooms)</span>
                </div>
                <span className="font-bold text-xs text-ink-900">
                  {inr(pkg.rooms_amount)}
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                {pkg.rooms.map(r => (
                  <div key={r.id} className="py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">
                          {r.room_number ? `Room ${r.room_number} — ${r.room_name}` : r.room_name}
                        </p>
                        <p className="text-stone-400 text-[11px]">
                          {fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {roomNights(r)} night{roomNights(r) > 1 ? 's' : ''} × {inr(r.rate)} · {r.guests} guests
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="font-bold text-ink-900">{inr(r.total || r.rate)}</span>
                        {isAdmin && !isCancelled && r.status !== 'cancelled' && roomEdit?.id !== r.id && (
                          <button type="button" onClick={() => setRoomEdit({ id: r.id, rate: r.rate })}
                            className="cursor-pointer rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-ink-900"
                            aria-label={`Change price of ${r.room_name}`} title="Change price">
                            <Pencil size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                    {roomEdit?.id === r.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-gold-50 p-2">
                        <span className="text-stone-600">Rate per night (₹)</span>
                        <Input type="number" min="0" className="h-8 w-28 py-1 text-sm" autoFocus value={roomEdit.rate}
                          onChange={e => setRoomEdit(x => ({ ...x, rate: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveRoomRate(); } }} />
                        <span className="text-stone-500">= {inr((Number(roomEdit.rate) || 0) * roomNights(r))}</span>
                        <Button size="sm" variant="gold" onClick={saveRoomRate}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setRoomEdit(null)}>Cancel</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Catering & Equipment Rentals */}
          {pkg.supplies && pkg.supplies.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  <Boxes size={15} className="text-gold-700" />
                  <span>3. Catering & Function Equipment ({pkg.supplies.length} items)</span>
                </div>
                <span className="font-bold text-xs text-ink-900">
                  {inr(pkg.supplies_amount)}
                </span>
              </div>
              <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto pr-1">
                {pkg.supplies.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-900 truncate">{s.supply_name}</p>
                      <p className="text-stone-400 text-[11px]">
                        {s.quantity} {s.supply_unit || 'pcs'} @ ₹{s.rent_rate}
                      </p>
                    </div>
                    <span className="font-bold text-ink-900 whitespace-nowrap">
                      {inr((Number(s.total_rent) || 0) + (Number(s.discount) || 0))}
                    </span>
                  </div>
                ))}
              </div>
              {(() => {
                const adj = pkg.supplies.reduce((t, s) => t + (Number(s.discount) || 0), 0);
                if (!adj) return null;
                return (
                  <div className="flex items-center justify-between border-t border-stone-100 pt-1.5 text-xs text-stone-600">
                    <span>{adj > 0 ? 'Supplies discount (full set price)' : 'Full set price adjustment'}</span>
                    <span className="font-semibold">{adj > 0 ? '−' : '+'} {inr(Math.abs(adj))}</span>
                  </div>
                );
              })()}
            </div>
          )}

          {addingExtras && (
            <AddHallExtras hallBooking={pkg.hall} onClose={() => setAddingExtras(false)}
              onDone={() => { setAddingExtras(false); reload(); onRefresh?.(); }} />
          )}

          {/* Section: Sannai Melam (a performance on this bill) */}
          {pkg.band?.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-1.5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  <Drum size={15} className="text-gold-700" />
                  <span>Sannai Melam</span>
                </div>
                <span className="font-bold text-xs text-ink-900">{inr(pkg.band_amount)}</span>
              </div>
              {pkg.band.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">{[b.timing, b.team, Number(b.players) ? `${b.players} players` : ''].filter(Boolean).join(' · ') || 'Sannai Melam'}</span>
                  <span className="font-semibold text-ink-900">{inr(b.amount)}</span>
                </div>
              ))}
              <p className="text-[11px] text-stone-400">Send the timing to the team from the Sannai Melam page.</p>
            </div>
          )}

          {/* Section: Decoration (edited on the Decorations page; the bill follows) */}
          {pkg.decor?.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  <Flower2 size={15} className="text-gold-700" />
                  <span>Decoration</span>
                </div>
                <span className="font-bold text-xs text-ink-900">{inr(pkg.decor_amount)}</span>
              </div>
              {pkg.decor.map(plan => (
                <div key={plan.id} className="space-y-1">
                  {[...new Set(plan.items.map(i => i.area))].map(area => (
                    <div key={area} className="flex items-center justify-between text-xs">
                      <span className="text-stone-600">{area}: {plan.items.filter(i => i.area === area).map(i => i.name).join(', ')}</span>
                      <span className="font-semibold text-ink-900 whitespace-nowrap">{inr(plan.items.filter(i => i.area === area).reduce((s, i) => s + (Number(i.amount) || 0), 0))}</span>
                    </div>
                  ))}
                  {Number(plan.discount) > 0 && (
                    <div className="flex items-center justify-between text-xs text-stone-500"><span>Discount</span><span>− {inr(plan.discount)}</span></div>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-stone-400">To change items, edit this plan on the Decorations page. The combined bill updates by itself.</p>
            </div>
          )}

          {/* Payments */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
              <CreditCard size={15} className="text-gold-700" />
              <span>Payments received</span>
            </div>
            {pkg.payments?.length ? (
              <div className="divide-y divide-stone-100">
                {pkg.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-stone-600">{fmtDate(p.paid_on)} · {p.method}</span>
                    <span className="font-bold text-emerald-700">{inr(p.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400">No payments yet.</p>
            )}
          </div>

          {/* Notes */}
          {pkg.notes && (
            <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              <span className="font-semibold text-ink-900 block mb-0.5">Notes:</span>
              <p>{pkg.notes}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* TAKE PAYMENT MODAL */}
      {payModal && (
        <Modal
          size="sm"
          title="Record Combo Payment"
          subtitle={`Customer: ${pkg.customer_name} · Pending balance: ${inr(balance)}`}
          onClose={() => setPayModal(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setPayModal(false)}>
                Cancel
              </Button>
              <Button
                form="package-pay-form"
                type="submit"
                variant="gold"
                loading={paying}
              >
                Record Payment
              </Button>
            </>
          }
        >
          <Form id="package-pay-form" onSubmit={handlePayment} className="space-y-4">
            <Field label="Amount to Collect (₹) *">
              <Input
                type="number"
                min="1"
                max={balance}
                step="any"
                required
                autoFocus
                placeholder={String(balance)}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
              />
            </Field>

            <Field label="Payment Method">
              <Select
                className="bg-white"
                value={payMethod}
                onChange={v => setPayMethod(v)}
                options={[
                  { value: 'Cash', label: 'Cash' },
                  { value: 'UPI', label: 'UPI (PhonePe / Google Pay / Paytm)' },
                  { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                  { value: 'Card', label: 'Debit / Credit Card' },
                ]}
              />
            </Field>

            <Field label="Note / Reference">
              <Input
                placeholder="e.g. Final settlement, UPI Txn ID…"
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
              />
            </Field>
          </Form>
        </Modal>
      )}
    </>
  );
}

const slotLabel = slotName;
const roomNights = r => Math.max(1, nights(r.check_in, r.check_out));

/** One printable bill for everything in the combo: hall, extras, rooms, supplies, payments. */
export function printComboBill(pkg, settings) {
  const propName = settings?.property_name || 'SMC Function Hall (A/C)';
  const bannerName = settings?.banner_name || '';
  const tagline = settings?.property_tagline || 'Kalyana Mandapam & Function Hall';
  const address = settings?.address || '';
  const phone = settings?.phone || '';

  // [item, details, qty, rate, amount]
  const lines = [];
  if (pkg.hall) {
    const hallDisc = Number(pkg.hall.discount) || 0;
    lines.push(['Banquet Hall', `${pkg.hall.hall_name} · ${slotLabel(pkg.hall.slot)} · ${fmtDate(pkg.hall.event_date)}`, '1',
      inr((Number(pkg.hall_amount) || 0) + hallDisc), (Number(pkg.hall_amount) || 0) + hallDisc]);
    if (hallDisc) lines.push(['Hall discount', '', '', '', -hallDisc]);
    if (Number(pkg.hall.power_amount) > 0)
      lines.push(['Power bill', 'Electricity', `${pkg.hall.power_units} units`, `₹${pkg.hall.power_rate}/unit`, Number(pkg.hall.power_amount)]);
    if (Number(pkg.hall.generator_amount) > 0)
      for (const g of generatorRows(pkg.hall))
        lines.push(['Generator', g.type, `${g.hours} hrs`, `${inr(g.rate)}/hr`, Math.round(g.hours * g.rate)]);
  }
  for (const r of pkg.rooms || []) {
    const n = roomNights(r);
    lines.push([`Room ${r.room_number || ''}`.trim(), `${r.room_name} · ${fmtDate(r.check_in)} → ${fmtDate(r.check_out)}`, `${n} night${n > 1 ? 's' : ''}`, `${inr(r.rate)}/night`, Number(r.total || r.rate) || 0]);
  }
  for (const s of pkg.supplies || []) {
    lines.push([s.supply_name, s.supply_category || 'Supplies', `${s.quantity} ${s.supply_unit || 'pcs'}`, inr(s.rent_rate), (Number(s.total_rent) || 0) + (Number(s.discount) || 0)]);
  }
  const suppliesDiscount = (pkg.supplies || []).reduce((t, s) => t + (Number(s.discount) || 0), 0);
  if (suppliesDiscount) lines.push([suppliesDiscount > 0 ? 'Supplies discount' : 'Full set price adjustment', 'Full set price', '', '', -suppliesDiscount]);
  for (const b of pkg.band || []) lines.push(['Sannai Melam', [b.timing, b.team].filter(Boolean).join(' · '), '', '', Number(b.amount) || 0]);
  for (const plan of pkg.decor || []) {
    for (const i of plan.items || []) lines.push([i.name, `Decoration · ${i.area}`, Number(i.qty) === 1 ? '' : `× ${i.qty}`, inr(i.rate), Number(i.amount) || 0]);
    if (Number(plan.discount) > 0) lines.push(['Decoration discount', '', '', '', -Number(plan.discount)]);
  }

  const total = Number(pkg.grand_total ?? pkg.total_amount) || 0;
  const paid = Number(pkg.advance_paid) || 0;
  const due = Math.max(0, total - paid);
  const dueColor = due > 0 ? '#dc2626' : '#6b7280';
  const row = l => `<tr><td><b>${esc(l[0])}</b><div class="muted">${esc(l[1])}</div></td><td class="c">${esc(l[2])}</td><td class="r">${esc(l[3])}</td><td class="r">${esc(inr(l[4]))}</td></tr>`;
  const pays = (pkg.payments || []).map(p => `<tr><td>${esc(fmtDate(p.paid_on))}</td><td>${esc(p.method)}</td><td class="r">${esc(inr(p.amount))}</td></tr>`).join('');

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Combined Bill ${esc(pkg.bill_no || '')} - ${esc(propName)}</title><style>
    body{font-family:Georgia,serif;color:#0e1a2b;max-width:700px;margin:30px auto;padding:0 24px}
    h1{margin:0;font-size:24px}.banner{font-size:12px;color:#a57837;font-weight:bold;margin-top:2px}
    .sub,.addr{font-family:Arial,sans-serif;font-size:12px;color:#555;margin-top:2px}.addr{font-size:11px;color:#777}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #d4ad5e;padding-bottom:16px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px}td,th{padding:7px 4px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
    th{font-size:11px;text-transform:uppercase;color:#888}.r{text-align:right;white-space:nowrap}.c{text-align:center;white-space:nowrap}
    .muted{color:#888;font-size:11px;margin-top:2px}.tot td{font-weight:bold;border:none;font-size:14px}
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
        <b style="font-size:15px;color:#a57837">COMBINED BILL NO: ${esc(pkg.bill_no || '—')}</b><br>Date: ${esc(fmtDate(today()))}
        ${pkg.status === 'cancelled' ? '<br><b style="color:#dc2626">CANCELLED</b>' : ''}
      </div>
    </div>
    <table>
      <tr><td style="width:30%;color:#888">Customer</td><td><b>${esc(pkg.customer_name)}</b></td></tr>
      <tr><td style="color:#888">Phone</td><td>${esc(pkg.phone || '—')}</td></tr>
      <tr><td style="color:#888">Event</td><td>${esc(pkg.event_type || '—')} · ${esc(fmtDate(pkg.event_date))}</td></tr>
    </table>
    <h3>Bill items</h3>
    <table>
      <tr><th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
      ${lines.map(row).join('') || '<tr><td colspan="4">No items</td></tr>'}
      <tr class="tot"><td colspan="3" class="r">Combined Total</td><td class="r">${esc(inr(total))}</td></tr>
      <tr class="tot"><td colspan="3" class="r" style="color:#059669">Paid</td><td class="r" style="color:#059669">${esc(inr(paid))}</td></tr>
      <tr class="tot"><td colspan="3" class="r" style="color:${dueColor}">Balance Due</td><td class="r" style="color:${dueColor}">${esc(inr(due))}</td></tr>
    </table>
    <h3>Payments</h3>
    <table><tr><th>Date</th><th>Method</th><th class="r">Amount</th></tr>${pays || '<tr><td colspan="3">No payments recorded</td></tr>'}</table>
    <div class="foot">Thank you for choosing ${esc(propName)}.<br>${esc(address)} · Phone: ${esc(phone)}</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
