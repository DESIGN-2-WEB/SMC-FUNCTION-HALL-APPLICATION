import { useState } from 'react';

/**
 * Discount for supplies. When every item in stock is taken, the bill drops to the full set price
 * from Settings (₹8,000 to start): the discount is worked out by itself as items total minus
 * that price, and follows quantity changes. Typing a discount takes over until it is reset.
 */
export function useFullSetDiscount({ allSelected, itemsTotal, fullSetPrice }) {
  const [typed, setTyped] = useState(null); // null = follow the full set price
  const price = Math.max(0, Number(fullSetPrice) || 0);
  const auto = allSelected && price > 0 ? Math.max(0, itemsTotal - price) : 0;
  const discount = Math.min(itemsTotal, Math.max(0, typed == null ? auto : Number(typed) || 0));
  return {
    discount,
    value: typed == null ? (auto ? String(auto) : '') : typed,
    setValue: v => setTyped(v),
    reset: () => setTyped(null),
    typedByHand: typed != null,
    fullSetApplied: typed == null && auto > 0,
    price,
  };
}
