import { ChevronRight } from 'lucide-react';
import { Badge, cn } from './ui.jsx';
import { SLOTS, fmtDate, inr, relDay } from '../utils.js';

const slotLabel = s => SLOTS[s] || (s === 'half' ? 'Half day' : 'Full day');

/** List of combo bookings (hall + rooms + supplies on one bill). */
export default function ComboTable({ combos, onOpen }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-100 bg-stone-50/60">
          <tr>
            <th className="th">Event Date</th>
            <th className="th">Customer & Event</th>
            <th className="th">Hall</th>
            <th className="th">Rooms</th>
            <th className="th">Supplies</th>
            <th className="th text-right">Combined Bill</th>
            <th className="th">Status</th>
            <th className="th text-right w-16">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {combos.map(c => {
            const total = Number(c.grand_total ?? c.total_amount) || 0;
            const due = Number(c.balance ?? total - c.advance_paid) || 0;
            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="group cursor-pointer transition-colors duration-150 hover:bg-gold-50/80"
              >
                <td className="td whitespace-nowrap">
                  <p className="font-semibold text-ink-900">{fmtDate(c.event_date)}</p>
                  <p className="text-xs text-stone-500">{relDay(c.event_date)}</p>
                </td>
                <td className="td">
                  <p className="font-semibold text-ink-900">{c.customer_name}</p>
                  <p className="text-xs font-medium text-stone-600">{c.event_type || 'Function'}</p>
                  <p className="text-xs text-stone-400">{c.phone}</p>
                </td>
                <td className="td whitespace-nowrap">
                  {c.hall_name ? (
                    <>
                      <span className="font-medium text-ink-900">{c.hall_name}</span>
                      <span className="block text-xs text-stone-400">{slotLabel(c.hall_slot)} · {inr(c.hall_amount)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-stone-400">—</span>
                  )}
                </td>
                <td className="td whitespace-nowrap">
                  {c.rooms_count > 0 ? (
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-ink-800">
                      {c.rooms_count} room{c.rooms_count > 1 ? 's' : ''} · {inr(c.rooms_amount)}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">—</span>
                  )}
                </td>
                <td className="td whitespace-nowrap">
                  {c.supplies_count > 0 ? (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {c.supplies_count} item{c.supplies_count > 1 ? 's' : ''} · {inr(c.supplies_amount)}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">—</span>
                  )}
                </td>
                <td className="td text-right whitespace-nowrap">
                  <p className="font-bold text-ink-900">{inr(total)}</p>
                  <p className={cn('text-xs font-medium', due > 0 ? 'text-rose-600' : 'text-emerald-700')}>
                    {due > 0 ? `${inr(due)} due` : 'Paid'}
                  </p>
                </td>
                <td className="td">
                  {c.status === 'cancelled' ? (
                    <Badge tone="rose">Cancelled</Badge>
                  ) : due === 0 ? (
                    <Badge tone="green" dot>Paid</Badge>
                  ) : (
                    <Badge tone="amber" dot>Confirmed</Badge>
                  )}
                </td>
                <td className="td text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-400 transition group-hover:bg-gold-100/70 group-hover:text-gold-800">
                    View <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
