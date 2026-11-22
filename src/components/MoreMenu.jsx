import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button, cn } from './ui.jsx';

/** "More" button that opens a small list of actions above it. */
export default function MoreMenu({ items, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="keep-box relative mr-auto">
      <Button variant="outline" icon={MoreHorizontal} disabled={disabled} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        More
      </Button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-56 animate-pop overflow-hidden rounded-2xl border border-stone-200 bg-white py-1.5 shadow-xl">
          {items.map(({ icon: Icon, label, onClick, tone, divider }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onClick(); }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition',
                divider && 'mt-1.5 border-t border-stone-100 pt-2.5',
                tone === 'rose' ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-800 hover:bg-stone-50',
              )}
            >
              <Icon size={16} className="shrink-0" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
