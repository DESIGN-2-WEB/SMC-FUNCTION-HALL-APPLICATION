/**
 * Split one discount over several line amounts in proportion to each, in whole rupees, so the
 * shares add up exactly to the discount. Used for the "full set" price on supplies: every line
 * keeps its own total, so all existing totals and sums stay correct. A negative discount is the
 * full set price being above what the items add up to: the lines are raised instead.
 */
export function spreadDiscount(amounts, discount) {
  const total = amounts.reduce((s, a) => s + a, 0);
  const raw = Math.round(discount || 0);
  if (!raw || !total) return amounts.map(() => 0);
  const sign = raw < 0 ? -1 : 1;
  // A discount can't take the lines below zero; a raise has no such limit
  const d = sign > 0 ? Math.min(raw, Math.round(total)) : -raw;
  const shares = amounts.map(a => Math.floor((a / total) * d));
  let left = d - shares.reduce((s, x) => s + x, 0);
  // Give the remaining rupees to the largest lines first
  const order = amounts.map((a, i) => i).sort((x, y) => amounts[y] - amounts[x]);
  while (left > 0) {
    for (const i of order) {
      if (!left) break;
      if (sign < 0 || shares[i] < amounts[i]) { shares[i] += 1; left -= 1; }
    }
    if (sign > 0) break; // positive shares never exceed their lines, so one pass is enough
  }
  return shares.map(x => x * sign);
}
