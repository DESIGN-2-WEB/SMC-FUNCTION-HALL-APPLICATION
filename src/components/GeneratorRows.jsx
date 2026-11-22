import { inr } from '../utils.js';
import { Input, cn } from './ui.jsx';

/** Total of a list of generators. */
export const genTotal = rows => rows.reduce((s, r) => s + (r.type ? Math.round((Number(r.hours) || 0) * (Number(r.rate) || 0)) : 0), 0);

/** One entry per generator: a generator listed twice (saved by the older form) is joined, hours added up. */
function merged(rows) {
  const out = [];
  for (const r of rows) {
    if (!r?.type) continue;
    const same = out.find(x => x.type === r.type);
    if (!same) out.push({ ...r });
    else if (r.hours !== '' && r.hours != null) same.hours = (Number(same.hours) || 0) + (Number(r.hours) || 0);
  }
  return out;
}

/**
 * The generators run for one event: one line for each generator in Settings (say the 120 kVA
 * and the 30 kVA), each ticked when it was used, with its own hours and rate. A generator can
 * be on the bill only once. `onChange` gets the list of the ticked ones. `locked` shows them
 * without letting them change.
 */
export default function GeneratorRows({ rows, onChange, priceList, locked }) {
  const used = merged(rows);

  if (locked) {
    return used.length
      ? <ul className="space-y-1 text-xs text-stone-600">{used.map(r => <li key={r.type}>{r.type} · {Number(r.hours) || 0} hrs × {inr(r.rate)} = <b className="text-ink-900">{inr(Math.round((Number(r.hours) || 0) * r.rate))}</b></li>)}</ul>
      : <p className="text-xs text-stone-500">No generator used</p>;
  }

  // Every generator from Settings, plus one saved earlier that has since been removed from Settings
  const lines = [
    ...priceList.map(g => ({ type: g.name, rate: Number(g.rate) || 0 })),
    ...used.filter(r => !priceList.some(g => g.name === r.type)).map(r => ({ type: r.type, rate: Number(r.rate) || 0 })),
  ];
  // Keep the list in the same order as the lines
  const emit = next => onChange(lines.map(l => next.find(r => r.type === l.type)).filter(Boolean));
  const toggle = (line, on) => emit(on ? [...used, { type: line.type, hours: '', rate: line.rate }] : used.filter(r => r.type !== line.type));
  const setHours = (line, hours) => {
    const has = used.some(r => r.type === line.type);
    // Typing hours ticks the generator
    emit(has ? used.map(r => (r.type === line.type ? { ...r, hours } : r)) : [...used, { type: line.type, hours, rate: line.rate }]);
  };

  if (!lines.length) return <p className="text-xs text-stone-500">No generators are set up in Settings.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {lines.map((line, i) => {
        const r = used.find(x => x.type === line.type);
        const on = !!r;
        const amount = on ? Math.round((Number(r.hours) || 0) * line.rate) : 0;
        return (
          <div key={line.type} className={cn('flex items-center gap-2 px-3 py-2.5 sm:gap-3', i > 0 && 'border-t border-stone-100', on && 'bg-gold-50/40')}>
            <label className="flex flex-1 cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={on} onChange={e => toggle(line, e.target.checked)}
                className="size-4 shrink-0 cursor-pointer accent-gold-600" />
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-sm font-medium text-ink-900">{line.type}</span>
                <span className="block whitespace-nowrap text-xs text-stone-500">{inr(line.rate)}/hr</span>
              </span>
            </label>
            <Input type="number" min="0" step="0.5" placeholder="Hours" aria-label={`Hours for ${line.type}`}
              className="w-20 shrink-0 sm:w-24" value={on ? r.hours : ''} onChange={e => setHours(line, e.target.value)} />
            <span className={cn('w-16 shrink-0 text-right text-sm font-semibold sm:w-20', on ? 'text-ink-900' : 'text-stone-300')}>{inr(amount)}</span>
          </div>
        );
      })}
    </div>
  );
}
