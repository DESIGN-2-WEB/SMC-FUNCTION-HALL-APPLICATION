import { useState } from 'react';
import {
  BedDouble,
  Boxes,
  Check,
  CreditCard,
  Landmark,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { Badge, Button, Card, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';
import { fmtDate, fmtDateTime, inr } from '../utils.js';
import { Select } from './pickers.jsx';
import { WhatsAppIcon } from './WhatsAppModal.jsx';

export default function PackageDetailModal({ packageId, onClose, onRefresh, onShareWa }) {
  const { toast } = useUI();
  const { data: pkg, reload } = useApi(`/packages/${packageId}`);

  // Payment State
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!pkg) return null;

  const isCancelled = pkg.status === 'cancelled';
  const balance = Number(pkg.balance) || 0;

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

  const handleCancelPackage = async () => {
    if (!window.confirm(`Are you sure you want to cancel the entire package for ${pkg.customer_name}? This will release the hall, cancel room reservations, and restore all rented equipment back to inventory.`)) {
      return;
    }
    setCancelling(true);
    try {
      await api(`/packages/${pkg.id}/cancel`, { method: 'PATCH' });
      toast('Event package cancelled. Inventory and bookings restored.');
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
        title={pkg.package_name || 'Event Package Details'}
        subtitle={`${pkg.customer_name} · ${pkg.phone} · ${fmtDate(pkg.event_date)} (${pkg.slot === 'half' ? '½ Day' : 'Full Day'})`}
        onClose={onClose}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {!isCancelled && (
                <Button
                  variant="danger-soft"
                  size="sm"
                  loading={cancelling}
                  onClick={handleCancelPackage}
                >
                  Cancel Package
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                icon={WhatsAppIcon}
                onClick={() => onShareWa?.(pkg)}
                className="text-emerald-700"
              >
                WhatsApp Voucher
              </Button>
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
                  Package Status
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
                <span className="text-xs text-stone-400 block">Package Grand Total</span>
                <span className="font-display text-2xl font-bold text-ink-900">
                  {inr(pkg.total_amount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 text-center">
              <div className="rounded-xl bg-white p-2.5 border border-stone-200/60">
                <span className="text-[11px] text-stone-500 block">Advance Paid</span>
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
                  {inr(pkg.hall_amount || pkg.hall.rent)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="font-semibold text-sm text-ink-900">{pkg.hall.hall_name}</p>
                  <p className="text-xs text-stone-500">
                    Slot: {pkg.hall.slot === 'half' ? 'Half Day' : 'Full Day'} · Date:{' '}
                    {fmtDate(pkg.hall.event_date)}
                  </p>
                </div>
                <Badge tone="green">Hall Booked</Badge>
              </div>
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
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <p className="font-semibold text-ink-900">
                        {r.room_number ? `Room ${r.room_number} — ${r.room_name}` : r.room_name}
                      </p>
                      <p className="text-stone-400 text-[11px]">
                        {fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {r.guests} guests
                      </p>
                    </div>
                    <span className="font-bold text-ink-900">{inr(r.rate)}</span>
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
                      {inr(s.total_rent)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
          title="Record Package Payment"
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
