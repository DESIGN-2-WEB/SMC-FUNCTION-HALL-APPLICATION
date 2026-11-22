import { fail, num, str } from './http.js';

/*
 * Generators run for one event. An event may use more than one (say the big and the small one,
 * each for its own hours), so they are kept as a list on the hall booking (generator_list, JSON).
 * The older single-generator columns keep a summary of that list (names joined, total hours and
 * total amount), so reports and older screens still add up.
 */

/** The generators and their hourly rates from Settings. */
export function generatorPriceList(settings) {
  let list = [];
  try {
    list = typeof settings.generators === 'string' ? JSON.parse(settings.generators) : settings.generators || [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list) || !list.length) {
    list = [
      { name: '120 kVA', rate: Number(settings.gen_120kva_rate) || 1500 },
      { name: '30 kVA', rate: Number(settings.gen_30kva_rate) || 450 },
    ];
  }
  return list.filter(g => g && str(g.name));
}

/** A hall booking's generators as a list (also reads bookings saved before the list existed). */
export function storedGenerators(b) {
  try {
    const rows = JSON.parse(b.generator_list || '[]');
    if (Array.isArray(rows) && rows.length) return rows;
  } catch { /* fall back to the single generator */ }
  return b.generator_type
    ? [{ type: b.generator_type, hours: Number(b.generator_hours) || 0, rate: Number(b.generator_rate) || 0, amount: Number(b.generator_amount) || 0 }]
    : [];
}

/**
 * Generators sent from a form, checked against the price list. The rate always comes from
 * Settings; a generator no longer listed keeps the rate it was saved with (`known`).
 */
export function parseGenerators(raw, settings, known = []) {
  const list = generatorPriceList(settings);
  const rows = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    const type = str(g?.type);
    if (!type) continue;
    const listed = list.find(x => str(x.name).toLowerCase() === type.toLowerCase());
    const old = !listed && known.find(x => x.type === type);
    if (!listed && !old) fail(`Choose "${type}" from the generator list`);
    const hours = Math.max(0, num(g.hours));
    const rate = listed ? Number(listed.rate) || 0 : Number(old.rate) || 0;
    rows.push({ type: listed ? str(listed.name) : type, hours, rate, amount: Math.round(hours * rate) });
  }
  if (rows.length > 6) fail('Up to 6 generators can be added for one event');
  return rows;
}

/** The columns saved on the hall booking for a list of generators. */
export function generatorColumns(rows) {
  return {
    generator_list: rows.length ? JSON.stringify(rows) : '',
    generator_type: rows.map(r => r.type).join(' + '),
    generator_hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
    generator_rate: rows.length === 1 ? rows[0].rate : 0,
    generator_amount: rows.reduce((s, r) => s + r.amount, 0),
  };
}
