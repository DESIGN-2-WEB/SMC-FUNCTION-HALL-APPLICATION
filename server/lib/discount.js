/**
 * Split one discount over several line amounts in proportion to each, in whole rupees, so the
 * shares add up exactly to the discount. Used for the "full set" price on supplies: every line
 * keeps its own discounted total, so all existing totals and sums stay correct.
 */
export function spreadDiscount(amounts, discount) {
  const total = amounts.reduce((s, a) => s + a, 0);
  const d = Math.min(Math.max(0, Math.round(discount || 0)), Math.round(total));
  if (!d || !total) return amounts.map(() => 0);
  const shares = amounts.map(a => Math.floor((a / total) * d));
  let left = d - shares.reduce((s, x) => s + x, 0);
  // Give the remaining rupees to the largest lines first
  const order = amounts.map((a, i) => i).sort((x, y) => amounts[y] - amounts[x]);
  for (const i of order) {
    if (!left) break;
    if (shares[i] < amounts[i]) { shares[i] += 1; left -= 1; }
  }
  return shares;
}
