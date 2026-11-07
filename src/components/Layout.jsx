import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  BedDouble, ChevronLeft, ChevronRight, History, KeyRound, LayoutDashboard, LogOut, Menu, Package, PartyPopper, SlidersHorizontal, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { initials } from '../utils.js';
import { api } from '../api.js';
import { Avatar, Badge, Button, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';
import AccountModal from './AccountModal.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', icon: BedDouble },
  { to: '/halls', label: 'Banquet Halls', icon: PartyPopper },
  { to: '/supplies', label: 'Supplies', icon: Package },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/users', label: 'Staff & Logins', icon: Users, admin: true },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
];

export function Brand({ light = true, collapsed = false }) {
  const { settings } = useSettings();
  const title = settings.property_short || settings.property_name || 'SMC Function Hall';
  const tagline = settings.property_tagline || 'Kalyana Mandapam & Function Hall';

  return (
    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-gold-400/40 bg-[#e05624] shadow-md shadow-gold-500/10 ring-1 ring-white/10">
        <img src="/logo-square.jpg" alt="SMC Function Hall" className="h-full w-full object-cover" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <p className={cn('font-display text-base font-semibold', light ? 'text-white' : 'text-ink-900')}>{title}</p>
          <p className={cn('text-[10px] tracking-wider uppercase', light ? 'text-gold-300/80' : 'text-gold-600')}>{tagline}</p>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const renderSidebar = isCollapsed => (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink-900 text-white select-none">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-64 w-64 rounded-full bg-sky-400/5 blur-3xl" />

      {/* Brand Header */}
      <div className={cn('relative transition-all duration-300', isCollapsed ? 'px-2 pt-6 pb-6 flex justify-center' : 'px-6 pt-7 pb-7')}>
        <Brand collapsed={isCollapsed} />
      </div>

      {/* Navigation Links */}
      <nav className={cn('relative flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden transition-all duration-300', isCollapsed ? 'px-2' : 'px-3')}>
        {NAV.filter(n => !n.admin || isAdmin).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) => cn(
              'group relative flex items-center rounded-xl text-sm font-medium transition duration-150',
              isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5',
              isActive
                ? 'bg-white/10 text-white shadow-xs'
                : 'text-ink-200 hover:bg-white/5 hover:text-white',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className={cn('absolute top-2 bottom-2 rounded-r-full bg-gold-400', isCollapsed ? '-left-2 w-1' : '-left-3 w-1')} />
                )}
                <Icon size={19} className={isActive ? 'text-gold-300 shrink-0' : 'text-ink-300 group-hover:text-gold-200 shrink-0'} />
                {!isCollapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile Section at Bottom */}
      <div className={cn('relative m-2.5 rounded-2xl border border-white/10 bg-white/5 transition-all duration-300', isCollapsed ? 'p-2' : 'p-3')}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div title={`${user.name} (@${user.username})`}>
              <Avatar name={user.name} />
            </div>
            <div className="w-full h-px bg-white/10 my-0.5" />
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="flex cursor-pointer items-center justify-center rounded-lg p-2 text-ink-200 transition hover:bg-rose-500/20 hover:text-rose-200 w-full"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl p-1">
              <Avatar name={user.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-ink-300">@{user.username}</p>
              </div>
              <Badge tone={isAdmin ? 'gold' : 'stone'}>{isAdmin ? 'Admin' : 'Staff'}</Badge>
            </div>
            <div className="mt-2.5">
              <button
                onClick={logout}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-xs font-medium text-ink-100 transition hover:bg-rose-500/20 hover:text-rose-200"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden transition-all duration-300 ease-in-out lg:block', collapsed ? 'w-20' : 'w-68')}>
        {/* Floating Collapse / Expand Edge Button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3.5 top-7 z-40 hidden lg:flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stone-200/90 bg-white text-ink-700 shadow-md transition hover:scale-110 hover:border-gold-400 hover:bg-gold-50 hover:text-gold-800 active:scale-95"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {renderSidebar(collapsed)}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-ink-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-pop">
            {renderSidebar(false)}
          </div>
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
        <button onClick={() => setAccountOpen(true)} className="cursor-pointer" title="View Account">
          <Avatar name={user.name} />
        </button>
      </header>

      <main className={cn('transition-all duration-300 ease-in-out', collapsed ? 'lg:pl-20' : 'lg:pl-68')}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
