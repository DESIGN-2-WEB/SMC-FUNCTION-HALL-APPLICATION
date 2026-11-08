import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { IndianRupee, Layers, Plus, Search, Wallet } from 'lucide-react';
import { useApi, useDebounced } from '../hooks.js';
import BulkPackageModal from '../components/BulkPackageModal.jsx';
import PackageDetailModal from '../components/PackageDetailModal.jsx';
import ComboTable from '../components/ComboTable.jsx';
import WhatsAppModal from '../components/WhatsAppModal.jsx';
import { Button, Card, EmptyState, Input, PageHeader, Segmented, StatCard } from '../components/ui.jsx';
import { inr, today } from '../utils.js';

const FILTERS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Combo: book any mix of hall, rooms and supplies together, on one combined bill. */
export default function Combos() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('upcoming');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const combos = useApi(`/packages?q=${encodeURIComponent(dq)}`);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [waCombo, setWaCombo] = useState(null);

  // Dashboard's "Combo" button opens the new-combo form straight away
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const all = combos.data || [];
  const active = all.filter(c => c.status !== 'cancelled');
  const list = all.filter(c =>
    filter === 'all' ? true
      : filter === 'cancelled' ? c.status === 'cancelled'
        : c.status !== 'cancelled' && c.event_date >= today());
  if (filter === 'upcoming') list.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.id - b.id);
  const value = active.reduce((n, c) => n + (Number(c.grand_total ?? c.total_amount) || 0), 0);
  const due = active.reduce((n, c) => n + (Number(c.balance) || 0), 0);

  return (
    <>
      <PageHeader
        title="Combo"
        subtitle="Pick any mix of hall, rooms and supplies for one customer, and bill it all together"
        actions={<Button variant="gold" icon={Plus} onClick={() => setCreating(true)}>New combo</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Layers} label="Active combos" value={active.length} sub={`${list.length} shown`} />
        <StatCard icon={Wallet} label="Combined bills" value={inr(value)} sub="Active combos" accent="green" />
        <StatCard icon={IndianRupee} label="Pending dues" value={inr(due)} sub="Still to collect" accent="rose" />
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
          <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          <div className="relative w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search customer or phone" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {list.length ? (
          <ComboTable combos={list} onOpen={setOpenId} />
        ) : (
          <EmptyState
            icon={Layers}
            title={combos.loading ? 'Loading combos…' : 'No combos here yet'}
            text={q ? 'No combos match your search.' : 'A combo puts a hall, guest rooms and catering supplies on one combined bill.'}
            action={!q && !combos.loading && <Button variant="gold" icon={Plus} onClick={() => setCreating(true)}>New combo</Button>}
          />
        )}
      </Card>

      {creating && (
        <BulkPackageModal
          onClose={() => setCreating(false)}
          onSaved={created => {
            setCreating(false);
            combos.reload();
            if (created) setOpenId(created.id);
          }}
        />
      )}

      {openId && (
        <PackageDetailModal
          packageId={openId}
          onClose={() => setOpenId(null)}
          onRefresh={combos.reload}
          onShareWa={c => setWaCombo(c)}
        />
      )}

      {waCombo && <WhatsAppModal kind="package" booking={waCombo} onClose={() => setWaCombo(null)} />}
    </>
  );
}
