import { Plus, X } from 'lucide-react';
import { inr } from '../utils.js';
import { Field, Input } from './ui.jsx';
import { Select } from './pickers.jsx';

/** Total of a list of generators. */
export const genTotal = rows => rows.reduce((s, r) => s + (r.type ? Math.round((Number(r.hours) || 0) * (Number(r.rate) || 0)) : 0), 0);

/**
 * The generators run for one event: one row per generator (say the big one for 4 hours and the
 * small one for 2), each with its own rate from Settings. `onChange` gets the new list.
 * `locked` shows them without letting them change.
 */
export default function GeneratorRows({ rows, onChange, priceList, locked }) {
  const rateOf = type => {
    const listed = priceList.find(g => g.name === type);
    return Number(listed ? listed.rate : rows.find(r => r.type === type)?.rate) || 0;
  };
  // A generator saved earlier but since removed from Settings still shows with its old rate
  const options = [
    ...priceList.map(g => ({ value: g.name, label: `${g.name} (${inr(g.rate)}/hr)` })),
    ...rows.filter(r => r.type && !priceList.some(g => g.name === r.type))
      .map(r => ({ value: r.type, label: `${r.type} (${inr(r.rate)}/hr)` })),
  ];
  const change = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    // Suggest a generator not used yet in this bill
    const next = priceList.find(g => !rows.some(r => r.type === g.name)) || priceList[0];
    onChange([...rows, { type: next?.name || '', hours: '', rate: Number(next?.rate) || 0 }]);
  };

  if (locked) {
    return rows.length
      ? <ul className="space-y-1 text-xs text-stone-600">{rows.map((r, i) => <li key={i}>{r.type} · {r.hours} hrs × {inr(r.rate)} = <b className="text-ink-900">{inr(Math.round(r.hours * r.rate))}</b></li>)}</ul>
      : <p className="text-xs text-stone-500">No generator used</p>;
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-stone-500">No generator used</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2 sm:grid-cols-[1fr_6.5rem_6rem_auto]">
          <Field label={rows.length > 1 ? `Generator ${i + 1}` : 'Generator'} as="div">
            <Select value={r.type} onChange={v => change(i, { type: v, rate: rateOf(v) })} options={options} />
          </Field>
          <Field label="Hours">
            <Input type="number" min="0" step="0.5" placeholder="0" value={r.hours} onChange={e => change(i, { hours: e.target.value })} />
          </Field>
          <p className="hidden pb-2.5 text-right text-sm font-semibold text-ink-900 sm:block">{inr(Math.round((Number(r.hours) || 0) * r.rate))}</p>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove this generator"
            className="mb-1 grid size-9 place-items-center rounded-lg text-stone-400 transition hover:bg-rose-50 hover:text-rose-600">
            <X size={16} />
          </button>
        </div>
      ))}
      {rows.length < 6 && (
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 transition hover:bg-gold-50">
          <Plus size={14} /> {rows.length ? 'Add another generator' : 'Add generator'}
        </button>
      )}
    </div>
  );
}
