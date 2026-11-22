import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { useApi, useCellLabels } from '../hooks.js';
import { Button, Modal, Segmented, cn } from './ui.jsx';
import { fmtDate, inr, today } from '../utils.js';

/*
 * Electricity (and generator) use of the halls: month by month for a year, and day by day for
 * one month. Readings come from the power meter entries on each hall booking.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METRICS = {
  units: { label: 'Units', get: r => Number(r.power_units) || 0, fmt: v => `${Math.round(v).toLocaleString('en-IN')} units` },
  power: { label: 'Power bill', get: r => Number(r.power_amount) || 0, fmt: v => inr(Math.round(v)) },
  gen: { label: 'Generator hours', get: r => Number(r.generator_hours) || 0, fmt: v => `${Math.round(v * 10) / 10} hrs` },
};
const daysIn = (y, m) => new Date(Number(y), Number(m), 0).getDate();

export default function PowerUsageModal({ onClose }) {
  const [year, setYear] = useState(() => today().slice(0, 4));
  const [view, setView] = useState('month'); // 'month' (12 months) | 'day' (one month)
  const [month, setMonth] = useState(() => today().slice(5, 7));
  const [metric, setMetric] = useState('units');
  const { data, loading } = useApi(`/hall-bookings/power-usage?year=${year}`);
  const rows = useMemo(() => data || [], [data]);
  const M = METRICS[metric];

  const bars = useMemo(() => {
    if (view === 'month') {
      const v = Array(12).fill(0);
      for (const r of rows) v[Number(r.event_date.slice(5, 7)) - 1] += M.get(r);
      return v.map((value, i) => ({ key: i, label: MONTHS[i], title: `${MONTHS[i]} ${year}`, value, month: String(i + 1).padStart(2, '0') }));
    }
    const n = daysIn(year, month);
    const v = Array(n).fill(0);
    for (const r of rows) if (r.event_date.slice(5, 7) === month) v[Number(r.event_date.slice(8, 10)) - 1] += M.get(r);
    return v.map((value, i) => ({ key: i, label: String(i + 1), title: fmtDate(`${year}-${month}-${String(i + 1).padStart(2, '0')}`), value }));
  }, [rows, view, month, year, M]);

  const eventsTable = useCellLabels();
  const shownRows = view === 'month' ? rows : rows.filter(r => r.event_date.slice(5, 7) === month);
  const withReadings = shownRows.filter(r => Number(r.power_units) > 0 || Number(r.generator_hours) > 0);
  const sum = f => shownRows.reduce((s, r) => s + f(r), 0);
  const totals = {
    units: sum(METRICS.units.get), power: sum(METRICS.power.get), gen: sum(METRICS.gen.get),
    genAmount: sum(r => Number(r.generator_amount) || 0),
  };
  const max = Math.max(...bars.map(b => b.value), 0);
  const [hover, setHover] = useState(null);
  const period = view === 'month' ? year : `${MONTHS[Number(month) - 1]} ${year}`;

  const stepMonth = d => {
    let m = Number(month) + d, y = Number(year);
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(String(m).padStart(2, '0'));
    setYear(String(y));
  };

  return (
    <Modal size="lg" onClose={onClose} title="Power usage"
      subtitle="Electricity units from the hall meter readings, and generator hours, by month or by day"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        {/* Filters in one row */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month-wise' }, { value: 'day', label: 'Day-wise' }]} />
          <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-1 py-0.5">
            <button type="button" className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Previous"
              onClick={() => (view === 'month' ? setYear(String(Number(year) - 1)) : stepMonth(-1))}><ChevronLeft size={16} /></button>
            <span className="min-w-24 text-center text-sm font-semibold text-ink-900 tabular-nums">{period}</span>
            <button type="button" className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Next"
              onClick={() => (view === 'month' ? setYear(String(Number(year) + 1)) : stepMonth(1))}><ChevronRight size={16} /></button>
          </div>
          <Segmented value={metric} onChange={setMetric}
            options={Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label }))} />
        </div>

        {/* Totals for the period shown */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Units used', METRICS.units.fmt(totals.units)],
            ['Power bill', inr(Math.round(totals.power))],
            ['Generator', `${METRICS.gen.fmt(totals.gen)} · ${inr(Math.round(totals.genAmount))}`],
            ['Events with readings', `${withReadings.length} of ${shownRows.length}`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-stone-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{l}</p>
              <p className="mt-1 text-sm font-semibold text-ink-900 tabular-nums">{v}</p>
            </div>
          ))}
        </div>

        {/* Bars: one series, so no legend; hover or tap a bar for its value */}
        <div className="rounded-2xl border border-stone-200 p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink-900">{M.label} · {view === 'month' ? `by month, ${year}` : `by day, ${period}`}</p>
            <p className="text-xs text-stone-500 tabular-nums">
              {hover != null && bars[hover] ? `${bars[hover].title}: ${M.fmt(bars[hover].value)}` : `Highest: ${M.fmt(max)}`}
            </p>
          </div>
          {loading && !data ? (
            <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
          ) : max === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500">
              No {metric === 'gen' ? 'generator hours' : 'meter readings'} entered for {period} yet.
            </p>
          ) : (
            <div className="flex h-48 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
              {bars.map((b, i) => (
                <button key={b.key} type="button"
                  className="group flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
                  onClick={() => { if (view === 'month') { setMonth(b.month); setView('day'); } else setHover(i); }}
                  aria-label={`${b.title}: ${M.fmt(b.value)}`}
                  title={view === 'month' ? `${b.title}: ${M.fmt(b.value)} (tap for day-wise)` : `${b.title}: ${M.fmt(b.value)}`}>
                  <span className={cn('block w-full rounded-t-[4px] transition-colors',
                    b.value > 0 ? (hover === i ? 'bg-gold-700' : 'bg-gold-500') : 'bg-stone-100')}
                    style={{ height: b.value > 0 ? `${Math.max(2, (b.value / max) * 100)}%` : '2px' }} />
                </button>
              ))}
            </div>
          )}
          {max > 0 && (
            <div className="mt-1.5 flex h-4 gap-[2px]">
              {bars.map((b, i) => (
                // Centred under its bar and allowed past the narrow column, so day numbers are never cut
                <span key={b.key} className="relative min-w-0 flex-1">
                  {(view === 'month' || i === 0 || (i + 1) % 5 === 0) && (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-stone-400 tabular-nums">{b.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
          {view === 'month' && max > 0 && <p className="mt-2 text-[11px] text-stone-400">Tap a month to see it day by day.</p>}
        </div>

        {/* The readings behind the chart */}
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-900">Events in {period}</p>
          {shownRows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-stone-200">
              <table ref={eventsTable} className="table-stack w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Hall · customer</th>
                    <th className="th text-right">Meter</th>
                    <th className="th text-right">Units</th>
                    <th className="th text-right">Power</th>
                    <th className="th text-right">Generator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shownRows.map(r => (
                    <tr key={r.id}>
                      <td className="td whitespace-nowrap">{fmtDate(r.event_date)}</td>
                      <td className="td"><p className="font-medium text-ink-900">{r.hall_name}</p><p className="text-xs text-stone-500">{r.customer_name}</p></td>
                      <td className="td text-right whitespace-nowrap text-xs text-stone-500 tabular-nums">
                        {Number(r.power_end) > Number(r.power_start) ? `${r.power_start} → ${r.power_end}` : '—'}
                      </td>
                      <td className="td text-right tabular-nums">{Number(r.power_units) || '—'}</td>
                      <td className="td text-right tabular-nums">{Number(r.power_amount) ? inr(r.power_amount) : '—'}</td>
                      <td className="td text-right whitespace-nowrap tabular-nums">
                        {Number(r.generator_hours) ? `${r.generator_hours} hrs · ${inr(r.generator_amount)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">No hall events in {period}.</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
            <Zap size={13} /> Readings are entered on each booking with "Add power &amp; generator" from the event day.
          </p>
        </div>
      </div>
    </Modal>
  );
}
