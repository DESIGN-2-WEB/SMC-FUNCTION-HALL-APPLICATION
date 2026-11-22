import { Check } from 'lucide-react';
import { inr } from '../utils.js';
import { fullSetNote } from '../fullSet.js';
import { Field, Input, cn } from './ui.jsx';

/** "Full set" tick box: ticking takes every item in stock, unticking clears the list. */
export function FullSetToggle({ fullSet, inStockCount, onTick, onUntick }) {
  if (!fullSet.defaultPrice) return null;
  const on = fullSet.applied;
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={on ? onUntick : onTick}
      className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition',
        on ? 'border-gold-500 bg-gold-50 text-gold-900' : 'border-stone-200 bg-white text-ink-900 hover:border-gold-300')}>
      <span className={cn('grid size-4 place-items-center rounded border', on ? 'border-gold-600 bg-gold-600 text-white' : 'border-stone-300 bg-white')}>
        {on && <Check size={12} strokeWidth={3} />}
      </span>
      Full set · all {inStockCount} items for {inr(fullSet.price)}
    </button>
  );
}

/** The price field: the full set price when the full set is on, otherwise a discount. */
export function FullSetPriceField({ fullSet, itemsTotal, className }) {
  const note = fullSetNote(fullSet, itemsTotal, inr);
  if (fullSet.applied) {
    return (
      <Field label="Full set price (₹)" className={cn('sm:max-w-xs', className)}
        hint={note || 'Changeable for this booking'}>
        <Input type="number" min="0" step="1" className="bg-white font-medium" value={fullSet.priceValue}
          onChange={e => fullSet.setPrice(e.target.value)} />
      </Field>
    );
  }
  return (
    <Field label="Discount (₹)" className={cn('sm:max-w-xs', className)}
      hint={note || 'Tick Full set for the full set price, or type a discount'}>
      <Input type="number" min="0" step="1" placeholder="0" className="bg-white font-medium" value={fullSet.discountValue}
        onChange={e => fullSet.setDiscount(e.target.value)} />
    </Field>
  );
}
