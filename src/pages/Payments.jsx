import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BedDouble, IndianRupee, PartyPopper, Trash2, Wallet } from 'lucide-react';
import { useApi, useRemove } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, Field, PageHeader, StatCard, cn } from '../components/ui.jsx';
import { DatePicker } from '../components/pickers.jsx';
import { METHODS, addDays, fmtDate, inr, today } from '../utils.js';

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

      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([label, r]) => (
            <button key={label} onClick={() => setRange(r)}
              className={cn('cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition',
                range[0] === r[0] && range[1] === r[1] ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200')}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          <Field label="From"><DatePicker value={range[0]} max={range[1]} onChange={v => setRange([v, range[1]])} /></Field>
          <Field label="To"><DatePicker value={range[1]} min={range[0]} onChange={v => setRange([range[0], v])} /></Field>
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Total collected" value={inr(total)} sub={`${list.length} payment${list.length === 1 ? '' : 's'}`} />
        <StatCard icon={BedDouble} label="Rooms" value={inr(sum(p => p.kind === 'room'))} accent="blue" />
        <StatCard icon={PartyPopper} label="Halls" value={inr(sum(p => p.kind === 'hall'))} accent="gold" />
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
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60">
                <tr><th className="th">Date</th><th className="th">Received from</th><th className="th">For</th><th className="th">Method</th><th className="th">By</th><th className="th text-right">Amount</th>{isAdmin && <th className="th" />}</tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map(p => (
                  <tr key={p.id} className="transition hover:bg-gold-50/40">
                    <td className="td whitespace-nowrap">{fmtDate(p.paid_on)}</td>
                    <td className="td">
                      <button className="cursor-pointer text-left font-medium text-ink-900 hover:text-gold-600" onClick={() => nav(`/${p.kind === 'room' ? 'rooms' : 'halls'}?booking=${p.booking_id}`)}>
                        {p.party || `Booking #${p.booking_id}`}
                      </button>
                      {p.note && <p className="text-xs text-stone-500">{p.note}</p>}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="flex items-center gap-1.5">{p.kind === 'room' ? <BedDouble size={14} className="text-sky-600" /> : <PartyPopper size={14} className="text-gold-600" />}{p.unit || '—'}</span>
                    </td>
                    <td className="td"><Badge>{p.method}</Badge></td>
                    <td className="td whitespace-nowrap text-stone-500">{p.created_by_name || '—'}</td>
                    <td className="td text-right font-semibold whitespace-nowrap text-emerald-700">{inr(p.amount)}</td>
                    {isAdmin && (
                      <td className="td text-right">
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
