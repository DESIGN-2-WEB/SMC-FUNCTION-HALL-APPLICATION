import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BedDouble, Drum, IndianRupee, PartyPopper, Trash2, Wallet } from 'lucide-react';
import { useApi, useRemove } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, StatCard } from '../components/ui.jsx';
import { DatePicker } from '../components/pickers.jsx';
import { METHODS, addDays, fmtDate, inr, today } from '../utils.js';
import { useRowsReveal } from '../motion.js';

const monthStart = d => `${d.slice(0, 8)}01`;
const prevMonth = () => {
  const d = new Date();
  d.setDate(0);
  const end = d.toLocaleDateString('en-CA');
  return [monthStart(end), end];
};

export default function Payments() {
  const { isAdmin } = useAuth();
  const removeRequest = useRemove();
  const nav = useNavigate();
  const [range, setRange] = useState([monthStart(today()), today()]);
  const { data, reload } = useApi(`/payments?from=${range[0]}&to=${range[1]}`);

  const presets = [
    ['Today', [today(), today()]],
    ['Last 7 days', [addDays(today(), -6), today()]],
    ['This month', [monthStart(today()), today()]],
    ['Last month', prevMonth()],
  ];

  const list = data || [];
  const rowsRef = useRowsReveal([list.length, data]);
  const sum = f => list.filter(f).reduce((s, p) => s + p.amount, 0);
  const total = sum(() => true);

  const remove = p => removeRequest(`/payments/${p.id}`, {
    title: 'Delete payment?',
    message: `${inr(p.amount)} from ${p.party} will be removed and the booking balance updated.`,
    success: 'Payment deleted',
    done: reload,
  });

  return (
    <>
      <PageHeader title="Payments" subtitle="All money received for rooms and halls" />

      {/* Period: quick choices on the left, the exact dates on the right, all on one line */}
      <Card className="mb-6 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={presets.find(([, r]) => range[0] === r[0] && range[1] === r[1])?.[0] || ''}
          onChange={label => setRange(presets.find(([l]) => l === label)[1])}
          options={presets.map(([label]) => ({ value: label, label }))}
          className="self-start max-sm:grid max-sm:w-full max-sm:grid-cols-2 [&>button]:justify-center"
        />
        {/* Phones: one date per line with its name; wider screens: "date to date" */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <label className="flex min-w-0 items-center gap-2">
            <span className="w-9 shrink-0 text-xs font-medium text-stone-500 sm:sr-only">From</span>
            <DatePicker className="min-w-0 flex-1" value={range[0]} max={range[1]} onChange={v => setRange([v, range[1]])} />
          </label>
          <span className="hidden text-sm text-stone-400 sm:block">to</span>
          <label className="flex min-w-0 items-center gap-2">
            <span className="w-9 shrink-0 text-xs font-medium text-stone-500 sm:sr-only">To</span>
            <DatePicker className="min-w-0 flex-1" value={range[1]} min={range[0]} onChange={v => setRange([range[0], v])} />
          </label>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard className="col-span-2 sm:col-span-1" icon={Wallet} label="Total collected" count={total} format={inr} sub={`${list.length} payment${list.length === 1 ? '' : 's'}`} />
        <StatCard icon={BedDouble} label="Rooms" count={sum(p => p.kind === 'room')} format={inr} accent="blue" />
        <StatCard icon={PartyPopper} label="Halls" count={sum(p => p.kind === 'hall')} format={inr} accent="gold" />
      </div>

      {total > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {METHODS.map(m => {
            const v = sum(p => p.method === m);
            return v ? <Badge key={m} tone="stone" className="px-3 py-1 text-sm">{m}: <b className="text-ink-900">{inr(v)}</b></Badge> : null;
          })}
        </div>
      )}

      <Card>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60">
                <tr><th className="th">Date</th><th className="th">Received from</th><th className="th">For</th><th className="th">Method</th><th className="th">By</th><th className="th text-right">Amount</th>{isAdmin && <th className="th" />}</tr>
              </thead>
              <tbody ref={rowsRef} className="divide-y divide-stone-100">
                {list.map(p => (
                  <tr key={p.id} className="transition hover:bg-gold-50/40">
                    <td className="td whitespace-nowrap max-lg:order-3 max-lg:whitespace-normal max-lg:text-xs max-lg:text-stone-500">
                      {fmtDate(p.paid_on)}<span className="lg:hidden"> · {p.unit || '—'} · {p.method}{p.created_by_name ? ` · by ${p.created_by_name}` : ''}</span>
                    </td>
                    <td className="td min-w-56 max-lg:order-1 max-lg:min-w-0">
                      <button className="cursor-pointer text-left font-medium text-ink-900 hover:text-gold-600" onClick={() => nav(p.kind === 'band' ? '/sannai-melam' : `/${p.kind === 'room' ? 'rooms' : 'halls'}?booking=${p.booking_id}`)}>
                        {p.party || `Booking #${p.booking_id}`}
                      </button>
                      {p.note && <p className="text-xs text-stone-500">{p.note}</p>}
                    </td>
                    <td className="td whitespace-nowrap max-lg:hidden">
                      <span className="flex items-center gap-1.5">{p.kind === 'room' ? <BedDouble size={14} className="text-sky-600" /> : p.kind === 'band' ? <Drum size={14} className="text-violet-600" /> : <PartyPopper size={14} className="text-gold-600" />}{p.unit || '—'}</span>
                    </td>
                    <td className="td max-lg:hidden"><Badge>{p.method}</Badge></td>
                    <td className="td max-w-36 text-stone-500 max-lg:hidden">{p.created_by_name || '—'}</td>
                    <td className="td text-right font-semibold whitespace-nowrap text-emerald-700 max-lg:order-2">{inr(p.amount)}</td>
                    {isAdmin && (
                      <td className="td text-right max-lg:order-4 max-lg:-my-1 max-lg:self-center">
                        <Button size="icon" variant="danger-soft" title="Delete payment" onClick={() => remove(p)}><Trash2 size={15} /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={IndianRupee} title="No payments in this period" text="Payments are added from a booking's detail screen." />
        )}
      </Card>
    </>
  );
}
