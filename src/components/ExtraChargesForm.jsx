import { useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import { inr } from '../utils.js';
import { Button, Field, Form, Input, useUI } from './ui.jsx';
import { Select } from './pickers.jsx';

/**
 * Power meter reading and generator hours for a hall booking, entered inside the booking panel
 * from the event day. Their charges are added to the hall bill; the server works out the
 * amounts from the booking's and Settings' rates.
 */
export function ExtraChargesForm({ booking: b, billTotal = b.total, billPaid = b.paid, onCancel, onDone }) {
  const { settings } = useSettings();
  const { toast } = useUI();
  const powerRate = Number(b.power_rate) || Number(settings.power_rate) || 15;
  let generators = [];
  try {
    generators = typeof settings.generators === 'string' ? JSON.parse(settings.generators) : settings.generators || [];
  } catch {
    generators = [];
  }
  if (!Array.isArray(generators)) generators = [];
  const [f, setF] = useState({
    power_start: b.power_start || '', power_end: b.power_end || '', power_units: b.power_units || '',
    generator_type: b.generator_type || '', generator_hours: b.generator_hours || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (k === 'power_start' || k === 'power_end') {
      const start = Number(next.power_start) || 0;
      const end = Number(next.power_end) || 0;
      next.power_units = next.power_end !== '' && end >= start ? end - start : '';
    }
    return next;
  });

  const listed = generators.find(g => g.name === f.generator_type);
  const genRate = Number(listed ? listed.rate : f.generator_type === b.generator_type ? b.generator_rate : 0) || 0;
  const powerAmount = Math.round((Number(f.power_units) || 0) * powerRate);
  const genAmount = f.generator_type ? Math.round((Number(f.generator_hours) || 0) * genRate) : 0;
  // The bill without any earlier power/generator charges (hall rent or a custom amount; for a
  // combo, the whole combo bill)
  const base = (Number(billTotal) || 0) - (Number(b.power_amount) || 0) - (Number(b.generator_amount) || 0);
  const newTotal = base + powerAmount + genAmount;
  const due = newTotal - (Number(billPaid) || 0);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/hall-bookings/${b.id}/extra-charges`, {
        method: 'POST',
        body: {
          power_start: Number(f.power_start) || 0,
          power_end: Number(f.power_end) || 0,
          power_units: Number(f.power_units) || 0,
          generator_type: f.generator_type,
          generator_hours: f.generator_type ? Number(f.generator_hours) || 0 : 0,
        },
      });
      toast(`Power & generator saved · bill now ${inr(newTotal)}`);
      await onDone();
    } catch (e) {
      toast(e.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Form onSubmit={submit} className="mb-3 space-y-3 rounded-xl border border-gold-300 bg-white p-3">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">Power bill · {inr(powerRate)}/unit</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start reading">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_start} onChange={e => set('power_start', e.target.value)} />
          </Field>
          <Field label="End reading">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_end} onChange={e => set('power_end', e.target.value)} />
          </Field>
          <Field label="Units used">
            <Input type="number" min="0" step="any" placeholder="0" value={f.power_units} onChange={e => set('power_units', e.target.value)} />
          </Field>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">Generator bill</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Generator">
            <Select
              value={f.generator_type}
              onChange={v => set('generator_type', v)}
              options={[{ value: '', label: 'Not used' }, ...generators.map(g => ({ value: g.name, label: `${g.name} (${inr(g.rate)}/hr)` }))]}
            />
          </Field>
          <Field label="Hours used">
            <Input type="number" min="0" step="0.5" placeholder="0" disabled={!f.generator_type} value={f.generator_hours} onChange={e => set('generator_hours', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <p className="text-xs text-stone-600">
          Power + generator <b className="text-gold-800">{inr(powerAmount + genAmount)}</b> · new bill <b className="text-ink-900">{inr(newTotal)}</b>
          {' · '}
          <span className={due > 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>
            {due > 0 ? `${inr(due)} to collect` : 'fully paid'}
          </span>
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" variant="gold" icon={Zap} loading={saving}>Save</Button>
        </div>
      </div>
    </Form>
  );
}
