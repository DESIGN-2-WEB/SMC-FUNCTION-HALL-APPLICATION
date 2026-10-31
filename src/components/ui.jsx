import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Trash2, TriangleAlert, X } from 'lucide-react';
import { initials } from '../utils.js';

export const cn = (...c) => c.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-ink-900 text-white hover:bg-ink-700 shadow-sm shadow-ink-900/20',
  gold: 'bg-gold-400 text-ink-900 hover:bg-gold-300 shadow-sm shadow-gold-600/25',
  outline: 'border border-stone-200 bg-white text-ink-800 hover:border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-ink-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  'danger-soft': 'text-rose-600 hover:bg-rose-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-700/20',
};
const SIZE = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', icon: 'h-9 w-9' };

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        BTN[variant], SIZE[size], className,
      )}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export const Card = ({ className, ...p }) => <div className={cn('card', className)} {...p} />;

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold-50 text-gold-600">
            <Icon size={17} />
          </div>
        )}
        <div>
          <h3 className="font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  stone: 'bg-stone-100 text-stone-600 ring-stone-500/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  gold: 'bg-gold-50 text-gold-700 ring-gold-600/20',
  ink: 'bg-ink-900 text-gold-200 ring-ink-900',
};

export function Badge({ tone = 'stone', dot, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const ACCENTS = {
  ink: 'bg-ink-900 text-gold-300',
  gold: 'bg-gold-100 text-gold-700',
  green: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
};

export function StatCard({ icon: Icon, label, value, sub, accent = 'ink', className }) {
  return (
    <div className={cn('card animate-rise p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
          <p className="mt-2 truncate font-display text-[28px] leading-tight font-semibold text-ink-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
        </div>
        <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', ACCENTS[accent])}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, className, hint, as: Tag = 'label' }) {
  return (
    <Tag className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}
    </Tag>
  );
}

export const Input = ({ className, ...p }) => <input className={cn('input', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea rows={2} className={cn('input resize-none', className)} {...p} />;

export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cn('inline-flex max-w-full overflow-x-auto rounded-xl bg-stone-100 p-1', className)}>
      {options.map(o => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-stone-500 hover:text-ink-900',
          )}
        >
          {o.icon && <o.icon size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Form without the browser's validation bubbles: on submit, the first invalid
 * field is outlined in red, focused, and explained in a toast.
 */
export function Form({ onSubmit, children, ...props }) {
  const { toast } = useUI();
  const submit = e => {
    e.preventDefault();
    const bad = [...e.currentTarget.elements].find(el => el.willValidate && !el.checkValidity());
    if (!bad) return onSubmit(e);
    bad.setAttribute('aria-invalid', 'true');
    bad.focus();
    toast(validationMessage(bad), 'error');
  };
  return (
    <form noValidate onSubmit={submit} onInput={e => e.target.removeAttribute('aria-invalid')} {...props}>
      {children}
    </form>
  );
}

function validationMessage(el) {
  const label = el.closest('label')?.querySelector('.label')?.textContent?.replace(/\s*\(.*\)$/, '') || el.placeholder || 'This field';
  const v = el.validity;
  if (v.valueMissing) return `${label} is required`;
  if (v.tooShort) return `${label} must be at least ${el.minLength} characters`;
  if (v.rangeUnderflow) return `${label} must be at least ${el.min}`;
  if (v.rangeOverflow) return `${label} must be at most ${el.max}`;
  if (v.patternMismatch) return `${label} can only use letters, numbers, dots, dashes or underscores (3–30)`;
  if (v.badInput || v.typeMismatch || v.stepMismatch) return `${label} is not a valid value`;
  return el.validationMessage;
}

/** Overlay shell shared by Modal and the confirm dialog. Only the top-most layer reacts to Escape. */
function Layer({ onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && ref.current === [...document.querySelectorAll('[data-modal]')].pop()) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div ref={ref} data-modal className={cn('fixed inset-0 flex justify-center', className)}>
      <div className="absolute inset-0 animate-fade bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />
      {children}
    </div>
  );
}

export function Modal({ onClose, title, subtitle, children, footer, size = 'md' }) {
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[size];
  return (
    <Layer onClose={onClose} className="z-50 items-end sm:items-center sm:p-4">
      <div className={cn('relative flex max-h-[94vh] w-full animate-pop flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-stone-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-3xl border-t border-stone-100 bg-stone-50/70 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </Layer>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold-50 text-gold-500">
        <Icon size={26} />
      </div>
      <p className="font-semibold text-ink-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <LoaderCircle className="animate-spin text-gold-500" size={30} />
    </div>
  );
}

export function Avatar({ name, className }) {
  return (
    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-gold-300 to-gold-500 text-xs font-bold text-ink-900', className)}>
      {initials(name)}
    </div>
  );
}

/* ── Toasts & confirm dialog ── */

const UICtx = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const dismiss = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts(t => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const confirm = useCallback(opts => new Promise(resolve => setDialog({ ...opts, resolve })), []);
  const close = value => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[90] flex flex-col items-end gap-3 sm:left-auto">
        {toasts.map(t => <Toast key={t.id} {...t} onClose={() => dismiss(t.id)} />)}
      </div>
      {dialog && <ConfirmDialog {...dialog} onAnswer={close} />}
    </UICtx.Provider>
  );
}

const TOAST_MS = 4500;
const TOAST_STYLE = {
  success: { icon: CircleCheck, title: 'Success', iconTone: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  error: { icon: CircleAlert, title: 'Please check', iconTone: 'bg-rose-50 text-rose-600', bar: 'bg-rose-500' },
};

function Toast({ message, type, onClose }) {
  const s = TOAST_STYLE[type] || TOAST_STYLE.success;
  return (
    <div role="status" className="pointer-events-auto relative w-full animate-slide overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_20px_50px_-12px_rgba(14,26,43,.35)] sm:w-96">
      <div className="flex items-start gap-3 p-4 pr-10">
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', s.iconTone)}>
          <s.icon size={18} />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-ink-900">{s.title}</p>
          <p className="mt-0.5 text-sm text-stone-600">{message}</p>
        </div>
      </div>
      <button onClick={onClose} aria-label="Dismiss" className="absolute top-3 right-3 cursor-pointer rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700">
        <X size={15} />
      </button>
      <div className={cn('h-1 origin-left animate-shrink', s.bar)} style={{ animationDuration: `${TOAST_MS}ms` }} />
    </div>
  );
}

function ConfirmDialog({ title = 'Are you sure?', message, danger, confirmText = 'Confirm', onAnswer }) {
  return (
    <Layer onClose={() => onAnswer(false)} className="z-[60] items-center p-4">
      <div role="alertdialog" className="relative w-full max-w-sm animate-pop rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className={cn('mx-auto grid h-14 w-14 place-items-center rounded-2xl', danger ? 'bg-rose-50 text-rose-600' : 'bg-gold-50 text-gold-600')}>
          {danger ? <Trash2 size={24} /> : <TriangleAlert size={24} />}
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-ink-900">{title}</h2>
        <p className="mt-2 text-sm text-stone-600">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onAnswer(false)}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)} autoFocus>{confirmText}</Button>
        </div>
      </div>
    </Layer>
  );
}

export const useUI = () => useContext(UICtx);
