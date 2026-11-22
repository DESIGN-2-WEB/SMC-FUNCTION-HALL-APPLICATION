import { useState } from 'react';

/**
 * Supplies price. Ticking "Full set" takes every item in stock and the supplies total becomes
 * the full set price (₹8,000 from Settings to start, changeable for this booking), whatever the
 * items add up to. Without the full set, a plain discount can be typed.
 *
 * `discount` is what is sent to the server: items total minus the price charged. With the full
 * set it can be below zero when the items add up to less than the full set price (the bill is
 * raised to that price).
 */
export function useFullSetDiscount({ allSelected, itemsTotal, fullSetPrice }) {
  const defaultPrice = Math.max(0, Math.round(Number(fullSetPrice) || 0));
  const [typedPrice, setTypedPrice] = useState(null); // full set price changed for this booking
  const [typedDiscount, setTypedDiscount] = useState('');
  const applied = allSelected && defaultPrice > 0;
  const price = typedPrice == null || typedPrice === '' ? defaultPrice : Math.max(0, Math.round(Number(typedPrice) || 0));
  const discount = applied ? itemsTotal - price : Math.min(itemsTotal, Math.max(0, Math.round(Number(typedDiscount) || 0)));
  return {
    applied, // the full set is on
    defaultPrice,
    price, // the full set price used
    priceValue: typedPrice ?? String(defaultPrice),
    setPrice: setTypedPrice,
    resetPrice: () => setTypedPrice(null),
    discountValue: typedDiscount,
    setDiscount: setTypedDiscount,
    discount,
    total: itemsTotal - discount,
  };
}

/** One line saying how the supplies total was reached. */
export const fullSetNote = (fs, itemsTotal, inr) => {
  if (fs.applied) {
    if (fs.discount > 0) return `Full set ${inr(fs.price)} · items ${inr(itemsTotal)} − ${inr(fs.discount)}`;
    if (fs.discount < 0) return `Full set ${inr(fs.price)} · items ${inr(itemsTotal)} + ${inr(-fs.discount)}`;
    return `Full set ${inr(fs.price)}`;
  }
  return fs.discount > 0 ? `Items ${inr(itemsTotal)} − discount ${inr(fs.discount)}` : '';
};
