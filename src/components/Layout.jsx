import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  BedDouble, History, KeyRound, LayoutDashboard, LogOut, Menu, Package, PartyPopper, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Avatar, Badge, Button, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', icon: BedDouble },
  { to: '/halls', label: 'Banquet Halls', icon: PartyPopper },
  { to: '/supplies', label: 'Supplies', icon: Package },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/users', label: 'Staff & Logins', icon: Users, admin: true },
  { to: '/activity', label: 'Activity Log', icon: History, admin: true },
];

export function Brand({ light = true }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-gold-300 to-gold-500 font-display text-lg font-bold text-ink-900 shadow-lg shadow-gold-500/20">
        PK
      </div>
      <div className="leading-tight">
        <p className={cn('font-display text-lg font-semibold', light ? 'text-white' : 'text-ink-900')}>Penta Kedarnath</p>
        <p className={cn('text-[11px] tracking-wider uppercase', light ? 'text-gold-300/80' : 'text-gold-600')}>Hotel & Function Hall</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  const sidebar = (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink-900 text-white">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-64 w-64 rounded-full bg-sky-400/5 blur-3xl" />
      <div className="relative px-6 pt-7 pb-8"><Brand /></div>
      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.filter(n => !n.admin || isAdmin).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-white/10 text-white' : 'text-ink-200 hover:bg-white/5 hover:text-white',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-gold-400" />}
                <Icon size={18} className={isActive ? 'text-gold-300' : 'text-ink-300 group-hover:text-gold-200'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="relative m-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-ink-300">@{user.username}</p>
          </div>
          <Badge tone={isAdmin ? 'gold' : 'stone'}>{isAdmin ? 'Admin' : 'Staff'}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setPwOpen(true)} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-xs text-ink-100 transition hover:bg-white/10">
            <KeyRound size={13} /> Password
          </button>
          <button onClick={logout} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-xs text-ink-100 transition hover:bg-rose-500/20 hover:text-rose-200">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-ink-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-pop">{sidebar}</div>
          <button onClick={() => setOpen(false)} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white">
            <X size={20} />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200/70 bg-ivory/85 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-xl p-2 text-ink-900 hover:bg-stone-200/60">
          <Menu size={22} />
        </button>
        <Brand light={false} />
        <Avatar name={user.name} />
      </header>

      <main className="lg:pl-68">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>

      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const { toast } = useUI();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (f.next !== f.confirm) return toast('New passwords do not match', 'error');
    setSaving(true);
    try {
      await api('/auth/password', { method: 'POST', body: f });
      toast('Password changed');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Change password"
      subtitle="Use at least 6 characters."
      size="sm"
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="pw-form" type="submit" loading={saving}>Update password</Button></>}
    >
      <Form id="pw-form" onSubmit={submit} className="space-y-4">
        <Field label="Current password"><Input type="password" required value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="New password"><Input type="password" required minLength={6} value={f.next} onChange={e => setF({ ...f, next: e.target.value })} /></Field>
        <Field label="Confirm new password"><Input type="password" required value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} /></Field>
      </Form>
    </Modal>
  );
}
