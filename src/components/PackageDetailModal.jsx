import { useState } from 'react';
import {
  BedDouble,
  Boxes,
  Check,
  CreditCard,
  Landmark,
  MessageCircle,
  Printer,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { Badge, Button, Card, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';
import { SLOTS, esc, fmtDate, fmtDateTime, inr, nights, today } from '../utils.js';
import { useSettings } from '../settings.jsx';
import { Select } from './pickers.jsx';
import { WhatsAppIcon } from './WhatsAppModal.jsx';

export default function PackageDetailModal({ packageId, onClose, onRefresh, onShareWa }) {
  const { toast } = useUI();
  const { settings } = useSettings();
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
  const grandTotal = Number(pkg.grand_total ?? pkg.total_amount) || 0;

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
        title={`Combo #${pkg.id} · ${pkg.customer_name}`}
        subtitle={`${pkg.customer_name} · ${pkg.phone} · ${fmtDate(pkg.event_date)} (${slotLabel(pkg.slot)})`}
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
                  Cancel Combo
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
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
                </div>
                <Badge tone="green">Hall Booked</Badge>
              </div>
              {Number(pkg.hall.power_amount) > 0 && (
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Power bill ({pkg.hall.power_units} units @ ₹{pkg.hall.power_rate}/unit)</span>
                  <span className="font-bold text-ink-900">{inr(pkg.hall.power_amount)}</span>
                </div>
              )}
              {Number(pkg.hall.generator_amount) > 0 && (
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Generator ({pkg.hall.generator_type || 'Generator'} · {pkg.hall.generator_hours} hrs @ {inr(pkg.hall.generator_rate)}/hr)</span>
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
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <p className="font-semibold text-ink-900">
                        {r.room_number ? `Room ${r.room_number} — ${r.room_name}` : r.room_name}
                      </p>
                      <p className="text-stone-400 text-[11px]">
                        {fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {roomNights(r)} night{roomNights(r) > 1 ? 's' : ''} × {inr(r.rate)} · {r.guests} guests
                      </p>
                    </div>
                    <span className="font-bold text-ink-900">{inr(r.total || r.rate)}</span>
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

const slotLabel = s => SLOTS[s] || (s === 'half' ? 'Half day' : 'Full day');
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
    lines.push(['Banquet Hall', `${pkg.hall.hall_name} · ${slotLabel(pkg.hall.slot)} · ${fmtDate(pkg.hall.event_date)}`, '1', inr(pkg.hall_amount), Number(pkg.hall_amount) || 0]);
    if (Number(pkg.hall.power_amount) > 0)
      lines.push(['Power bill', 'Electricity', `${pkg.hall.power_units} units`, `₹${pkg.hall.power_rate}/unit`, Number(pkg.hall.power_amount)]);
    if (Number(pkg.hall.generator_amount) > 0)
      lines.push(['Generator', pkg.hall.generator_type || 'Generator', `${pkg.hall.generator_hours} hrs`, `${inr(pkg.hall.generator_rate)}/hr`, Number(pkg.hall.generator_amount)]);
  }
  for (const r of pkg.rooms || []) {
    const n = roomNights(r);
    lines.push([`Room ${r.room_number || ''}`.trim(), `${r.room_name} · ${fmtDate(r.check_in)} → ${fmtDate(r.check_out)}`, `${n} night${n > 1 ? 's' : ''}`, `${inr(r.rate)}/night`, Number(r.total || r.rate) || 0]);
  }
  for (const s of pkg.supplies || []) {
    lines.push([s.supply_name, s.supply_category || 'Supplies', `${s.quantity} ${s.supply_unit || 'pcs'}`, inr(s.rent_rate), Number(s.total_rent) || 0]);
  }

  const total = Number(pkg.grand_total ?? pkg.total_amount) || 0;
  const paid = Number(pkg.advance_paid) || 0;
  const due = Math.max(0, total - paid);
  const dueColor = due > 0 ? '#dc2626' : '#6b7280';
  const row = l => `<tr><td><b>${esc(l[0])}</b><div class="muted">${esc(l[1])}</div></td><td class="c">${esc(l[2])}</td><td class="r">${esc(l[3])}</td><td class="r">${esc(inr(l[4]))}</td></tr>`;
  const pays = (pkg.payments || []).map(p => `<tr><td>${esc(fmtDate(p.paid_on))}</td><td>${esc(p.method)}</td><td class="r">${esc(inr(p.amount))}</td></tr>`).join('');

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Combined Bill #C${pkg.id} - ${esc(propName)}</title><style>
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
        <b style="font-size:15px;color:#a57837">COMBINED BILL #C${pkg.id}</b><br>Date: ${esc(fmtDate(today()))}
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
