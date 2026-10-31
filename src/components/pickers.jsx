import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAYS, addDays, fmtDate, monthGrid, shiftMonth, today } from '../utils.js';
import { cn } from './ui.jsx';

/**
 * Floating panel anchored to `anchor`. Rendered into <body> so a modal's
 * scroll area can't clip it; flips above the anchor when there's no room below.
 * Marked `data-modal` so only the top-most layer reacts to Escape.
 */
function Popover({ anchor, open, onClose, children, minWidth = 0, className }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      if (!anchor.current || !ref.current) return;
      const r = anchor.current.getBoundingClientRect();
      const h = ref.current.offsetHeight;
      const width = Math.max(r.width, minWidth);
      const spaceBelow = window.innerHeight - r.bottom;
      const above = spaceBelow < h + 12 && r.top > spaceBelow;
      const top = above ? r.top - h - 6 : r.bottom + 6;
      setPos({
        // Never leave the screen, even on very short windows
        top: Math.max(8, Math.min(top, window.innerHeight - h - 8)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        width,
      });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose();
    };
    const onKey = e => {
      if (e.key === 'Escape' && ref.current === [...document.querySelectorAll('[data-modal]')].pop()) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      data-modal
      // Keep focus on the trigger so keyboard navigation keeps working
      onMouseDown={e => e.preventDefault()}
      style={{ position: 'fixed', zIndex: 80, visibility: pos ? 'visible' : 'hidden', ...pos }}
      className={cn('animate-pop rounded-2xl border border-stone-200 bg-white p-1.5 shadow-[0_20px_50px_-12px_rgba(14,26,43,.35)]', className)}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Shared list + keyboard handling for Select and Combobox. */
function useListNav(items, onPick) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const onKeyDown = e => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
      return false;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && items[active] !== undefined) { e.preventDefault(); onPick(items[active]); }
    else if (e.key === 'Tab') setOpen(false);
    else return false;
    return true;
  };
  return { open, setOpen, active, setActive, onKeyDown };
}

function OptionList({ items, active, setActive, isSelected, onPick, render }) {
  return (
    <ul role="listbox" className="max-h-64 overflow-y-auto">
      {items.map((item, i) => (
        <li
          key={i}
          role="option"
          aria-selected={isSelected(item)}
          ref={el => i === active && el?.scrollIntoView({ block: 'nearest' })}
          onMouseEnter={() => setActive(i)}
          onClick={() => onPick(item)}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
            i === active ? 'bg-gold-50 text-ink-900' : 'text-stone-700',
            isSelected(item) && 'font-semibold text-ink-900',
          )}
        >
          <span className="min-w-0 flex-1">{render(item)}</span>
          {isSelected(item) && <Check size={15} className="shrink-0 text-gold-600" />}
        </li>
      ))}
    </ul>
  );
}

const normalize = o => (typeof o === 'object' ? o : { value: o, label: String(o) });

/** Dropdown. `options`: strings or { value, label, hint }. `onChange` receives the value. */
export function Select({ value, onChange, options, placeholder = 'Select…', icon: Icon, className }) {
  const opts = options.map(normalize);
  const current = opts.find(o => String(o.value) === String(value));
  const btn = useRef(null);
  const pick = o => { onChange(o.value); nav.setOpen(false); };
  const nav = useListNav(opts, pick);
  const show = () => { nav.setActive(Math.max(0, opts.indexOf(current))); nav.setOpen(true); };

  const onKeyDown = e => {
    if (!nav.open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      return show();
    }
    if (nav.open && e.key === ' ') { e.preventDefault(); return opts[nav.active] && pick(opts[nav.active]); }
    nav.onKeyDown(e);
  };

  return (
    <>
      <button
        type="button"
        ref={btn}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={nav.open}
        onClick={() => (nav.open ? nav.setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn('input flex cursor-pointer items-center gap-2 text-left', nav.open && 'border-gold-400 ring-4 ring-gold-100', className)}
      >
        {Icon && <Icon size={16} className="shrink-0 text-stone-400" />}
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-stone-400')}>{current ? current.label : placeholder}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-stone-400 transition-transform', nav.open && 'rotate-180')} />
      </button>
      <Popover anchor={btn} open={nav.open} onClose={() => nav.setOpen(false)}>
        <OptionList
          items={opts}
          active={nav.active}
          setActive={nav.setActive}
          isSelected={o => o === current}
          onPick={pick}
          render={o => (
            <>
              <span className="block truncate">{o.label}</span>
              {o.hint && <span className="block truncate text-xs font-normal text-stone-400">{o.hint}</span>}
            </>
          )}
        />
      </Popover>
    </>
  );
}

/** Free-text input with a suggestion list (replaces <datalist>). */
export function Combobox({ value, onChange, options, placeholder, className }) {
  const input = useRef(null);
  const exact = options.includes(value);
  const items = !value || exact ? options : options.filter(o => o.toLowerCase().includes(value.toLowerCase()));
  const pick = o => { onChange(o); nav.setOpen(false); };
  const nav = useListNav(items, pick);

  return (
    <>
      <input
        ref={input}
        className={cn('input', className)}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); nav.setOpen(true); nav.setActive(-1); }}
        onFocus={() => nav.setOpen(true)}
        onClick={() => nav.setOpen(true)}
        onKeyDown={nav.onKeyDown}
      />
      <Popover anchor={input} open={nav.open && items.length > 0} onClose={() => nav.setOpen(false)}>
        <OptionList items={items} active={nav.active} setActive={nav.setActive} isSelected={o => o === value}
          onPick={pick} render={o => <span className="block truncate">{o}</span>} />
      </Popover>
    </>
  );
}

/** Date field with a custom calendar popup. Values are YYYY-MM-DD strings. */
export function DatePicker({ value, onChange, min, max, placeholder = 'Pick a date', className }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || today()).slice(0, 7));
  const t = today();
  const disabled = d => (min && d < min) || (max && d > max);

  const show = () => { setMonth((value || t).slice(0, 7)); setOpen(true); };
  const pick = d => {
    if (disabled(d)) return;
    onChange(d);
    setOpen(false);
  };
  const step = n => {
    const d = addDays(value || t, n);
    if (disabled(d)) return;
    onChange(d);
    setMonth(d.slice(0, 7));
  };

  const onKeyDown = e => {
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); show(); }
      return;
    }
    if (keys[e.key]) { e.preventDefault(); step(keys[e.key]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={btn}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn('input flex cursor-pointer items-center gap-2 text-left', open && 'border-gold-400 ring-4 ring-gold-100', className)}
      >
        <CalendarDays size={16} className="shrink-0 text-stone-400" />
        <span className={cn('flex-1 truncate', !value && 'text-stone-400')}>
          {value ? fmtDate(value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : placeholder}
        </span>
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} minWidth={296} className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900">
            <ChevronLeft size={17} />
          </button>
          <span className="font-display text-base font-semibold">{fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900">
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map(d => <span key={d} className="py-1 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">{d.slice(0, 2)}</span>)}
          {monthGrid(month).map(d => {
            const off = disabled(d);
            return (
              <button
                type="button"
                key={d}
                disabled={off}
                onClick={() => pick(d)}
                className={cn(
                  'h-9 rounded-xl text-sm transition',
                  d === value ? 'bg-ink-900 font-semibold text-gold-200 shadow-sm'
                    : off ? 'cursor-not-allowed text-stone-300 line-through'
                    : cn('cursor-pointer hover:bg-gold-50', d.startsWith(month) ? 'text-ink-900' : 'text-stone-300'),
                  d === t && d !== value && 'font-semibold text-gold-600 ring-1 ring-gold-300 ring-inset',
                )}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
          <span className="text-xs text-stone-400">Use arrow keys to move</span>
          <button type="button" disabled={disabled(t)} onClick={() => pick(t)}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-gold-700 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40">
            Today
          </button>
        </div>
      </Popover>
    </>
  );
}
