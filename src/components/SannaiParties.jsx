import { useState } from 'react';
import { Plus, Save, Trash2, Users } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { useSettings } from '../settings.jsx';
import { fmtDate, inr } from '../utils.js';
import { Button, Field, Input, Modal, useUI } from './ui.jsx';
import { Select } from './pickers.jsx';

/*
 * The Sannai Melam parties the hall works with (two or three teams). Kept in Settings as a list
 * of { name, phone, players, price }. When booking, a party is picked from a dropdown and its
 * details fill in; a party already booked on that date is marked, so a free one can be chosen.
 */

/** The saved parties. */
export function useSannaiParties() {
  const { settings } = useSettings();
  try {
    const list = JSON.parse(settings.sannai_parties || '[]');
    return Array.isArray(list) ? list.filter(p => p && p.name) : [];
  } catch {
    return [];
  }
}

const OTHER = '__other__';

/**
 * Dropdown of parties for a booking on `date`. `value` is the team name in the form; picking a
 * party calls onPick(party) to fill the name, phone, players and price. `excludeId` is the
 * booking being edited (so it does not count itself as busy).
 */
export function PartyPicker({ value, date, excludeId, onPick, onAdd }) {
  const parties = useSannaiParties();
  const bookings = useApi('/band').data || [];
  const busyWith = name => bookings.find(b => b.status !== 'cancelled' && b.id !== excludeId && b.event_date === date
    && String(b.team || '').trim().toLowerCase() === name.trim().toLowerCase());
  const known = parties.some(p => p.name === value);
  const options = [
    ...parties.map(p => {
      const busy = date && busyWith(p.name);
      return {
        value: p.name,
        label: busy ? `${p.name} · booked on ${fmtDate(date)}` : p.name,
        hint: busy
          ? `Already with ${busy.customer_name}${busy.timing ? ` (${busy.timing})` : ''}`
          : [p.phone, Number(p.players) ? `${p.players} players` : '', Number(p.price) ? `customer ${inr(p.price)}` : '', Number(p.team_price) ? `party ${inr(p.team_price)}` : '']
            .filter(Boolean).join(' · ') || 'Available',
      };
    }),
    { value: OTHER, label: 'Other party (type the name below)' },
  ];
  if (!parties.length) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 text-xs text-stone-500">
        No parties saved yet.{onAdd ? <> <button type="button" onClick={onAdd} className="cursor-pointer font-semibold text-gold-800 underline">Add your parties</button> to pick them here.</> : ' The admin can add them on the Sannai Melam page.'}
      </p>
    );
  }
  return (
    <Select value={known ? value : value ? OTHER : ''} placeholder="Choose a party" options={options}
      onChange={v => onPick(v === OTHER ? null : parties.find(p => p.name === v) || null)} />
  );
}

/** Admin: add, change or remove the parties. */
export function PartiesModal({ onClose }) {
  const { reload } = useSettings();
  const { toast } = useUI();
  const saved = useSannaiParties();
  const blank = { name: '', phone: '', players: '', price: '', team_price: '' };
  const [rows, setRows] = useState(() => (saved.length ? saved : [blank])
    .map(p => ({ name: p.name || '', phone: p.phone || '', players: p.players || '', price: p.price || '', team_price: p.team_price || '' })));
  const [saving, setSaving] = useState(false);
  const change = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    const list = rows.map(r => ({ name: r.name.trim(), phone: r.phone.trim(), players: Number(r.players) || 0, price: Number(r.price) || 0, team_price: Number(r.team_price) || 0 }))
      .filter(r => r.name);
    const names = list.map(r => r.name.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) return toast('Two parties have the same name', 'error');
    setSaving(true);
    try {
      await api('/settings', { method: 'PUT', body: { sannai_parties: JSON.stringify(list) } });
      await reload();
      toast(`${list.length} part${list.length === 1 ? 'y' : 'ies'} saved`);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" onClose={onClose} title="Sannai Melam parties"
      subtitle="The teams you work with. Pick one when booking; its phone, players and both prices fill in."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="gold" icon={Save} loading={saving} onClick={save}>Save parties</Button></>}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[1.3fr_1.1fr_0.6fr_0.9fr_0.9fr_auto]">
            <Field label="Party name" className="col-span-2 sm:col-span-1"><Input value={r.name} onChange={e => change(i, 'name', e.target.value)} placeholder="Party name" /></Field>
            <Field label="Phone"><Input type="tel" value={r.phone} onChange={e => change(i, 'phone', e.target.value)} placeholder="Leader's mobile" /></Field>
            <Field label="Players"><Input type="number" min="0" value={r.players} onChange={e => change(i, 'players', e.target.value)} placeholder="8" /></Field>
            <Field label="Customer price (₹)"><Input type="number" min="0" value={r.price} onChange={e => change(i, 'price', e.target.value)} placeholder="15000" /></Field>
            <Field label="Party price (₹)"><Input type="number" min="0" value={r.team_price} onChange={e => change(i, 'team_price', e.target.value)} placeholder="11000" /></Field>
            <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.name || 'this party'}`}
              className="mb-1 grid size-9 cursor-pointer place-items-center rounded-lg text-stone-400 transition hover:bg-rose-50 hover:text-rose-600">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows(rs => [...rs, { ...blank }])}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 transition hover:bg-gold-50">
          <Plus size={14} /> Add party
        </button>
        <p className="flex items-center gap-1.5 text-[11px] text-stone-400"><Users size={12} /> Bookings already made keep the party details they were saved with.</p>
      </div>
    </Modal>
  );
}
