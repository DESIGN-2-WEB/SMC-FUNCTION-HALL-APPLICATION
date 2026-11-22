import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api.js';
import { Button, Field, Input, Modal, useUI } from './ui.jsx';
import { Select } from './pickers.jsx';
import { METHODS, fmtDate, inr } from '../utils.js';
import HallAddons, { useHallAddons } from './HallAddons.jsx';

/*
 * Rooms, supplies, decoration or Sannai Melam asked for after the hall was booked. A plain hall
 * booking becomes one combined bill (its payments so far count); a combined bill just grows.
 */
export default function AddHallExtras({ hallBooking: hb, onClose, onDone }) {
  const { toast } = useUI();
  const addons = useHallAddons(hb.event_date);
  const [advance, setAdvance] = useState('');
  const [method, setMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!addons.any) return toast('Pick a room, supply item, decoration or Sannai Melam to add', 'error');
    const problem = addons.problem();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    try {
      const pkg = await api(`/packages/from-hall/${hb.id}`, {
        method: 'POST',
        body: { ...addons.payload(), advance: Number(advance) || 0, payment_method: method },
      });
      toast(`Added. Combined bill ${pkg.bill_no} is now ${inr(pkg.grand_total)}`);
      onDone(pkg);
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" onClose={onClose} title="Add rooms, supplies, decoration or Sannai Melam"
      subtitle={`${hb.customer_name} · ${hb.hall_name || 'Hall'} · ${fmtDate(hb.event_date)}. Everything goes on one combined bill.`}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-500">Adding <span className="font-display text-lg font-semibold text-ink-900">{inr(addons.total)}</span></p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="gold" icon={Plus} loading={saving} onClick={save}>Add to booking</Button>
          </div>
        </div>
      )}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HallAddons addons={addons} />
        {addons.any && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-dashed border-gold-300 bg-gold-50/50 p-4 sm:col-span-2">
            <Field label="Payment received now (₹)"><Input type="number" min="0" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="0" /></Field>
            <Field label="Payment method" as="div"><Select value={method} onChange={setMethod} options={METHODS} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
