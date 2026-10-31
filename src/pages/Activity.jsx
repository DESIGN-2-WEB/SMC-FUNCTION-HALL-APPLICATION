import { useState } from 'react';
import { History, Search } from 'lucide-react';
import { useApi } from '../hooks.js';
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, PageLoader } from '../components/ui.jsx';
import { fmtDate } from '../utils.js';

export default function Activity() {
  const { data } = useApi('/activity');
  const [q, setQ] = useState('');
  if (!data) return <PageLoader />;

  const needle = q.toLowerCase();
  const rows = data.filter(a => `${a.user_name} ${a.action} ${a.details}`.toLowerCase().includes(needle));
  const groups = rows.reduce((g, a) => {
    const day = a.created_at.slice(0, 10);
    (g[day] ||= []).push(a);
    return g;
  }, {});

  return (
    <>
      <PageHeader title="Activity Log" subtitle="Who did what — the latest 300 actions"
        actions={
          <div className="relative w-64">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Filter activity" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        } />
      {rows.length ? (
        <div className="space-y-6">
          {Object.entries(groups).map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold tracking-wider text-stone-400 uppercase">{fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <Card className="divide-y divide-stone-100">
                {items.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                    <Avatar name={a.user_name || '?'} className="h-8 w-8 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <b className="font-semibold">{a.user_name || 'Deleted user'}</b>{' '}
                        {a.role === 'admin' && <Badge tone="gold" className="mr-1 px-1.5 py-0 text-[10px]">admin</Badge>}
                        <span className="text-stone-600">{a.action}</span>
                      </p>
                      {a.details && <p className="mt-0.5 text-xs text-stone-500">{a.details}</p>}
                    </div>
                    <p className="shrink-0 text-xs text-stone-400">{a.created_at.slice(11, 16)}</p>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={History} title="No activity" /></Card>
      )}
    </>
  );
}
