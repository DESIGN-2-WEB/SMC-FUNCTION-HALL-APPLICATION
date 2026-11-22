import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { fail, found, inr, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { setBillNo } from '../lib/billno.js';
import { comboPaymentsWhere, addonsTotalSql, comboForHall, safeNote, syncComboPaid } from '../lib/combo.js';
import { parseDecorLines } from './decorations.js';
import { spreadDiscount } from '../lib/discount.js';
import { syncPaid } from './bookings.js';

const r = Router();
export default r;

const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};

const loadPackage = id => {
  const pkg = found(get('SELECT p.*, u.name AS created_by_name FROM event_packages p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?', id), 'Event Package');
  
  // Hall details
  let hall = null;
  if (pkg.hall_booking_id) {
    hall = get(`
      SELECT b.*, h.name AS hall_name, h.is_combo, h.full_time AS hall_full, h.half_time AS hall_half
      FROM hall_bookings b
      JOIN halls h ON h.id = b.hall_id
      WHERE b.id = ?
    `, pkg.hall_booking_id);
  }

  // Room details
  const rooms = all(`
    SELECT b.*, r.number AS room_number, r.name AS room_name, r.type AS room_type,
      r.checkin_time AS room_checkin, r.checkout_time AS room_checkout
    FROM room_bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE b.package_id = ?
    ORDER BY r.number
  `, pkg.id);

  // Supply rentals details
  const supplies = all(`
    SELECT sr.*, s.name AS supply_name, s.category AS supply_category, s.unit AS supply_unit
    FROM supply_rentals sr
    JOIN supplies s ON s.id = sr.supply_id
    WHERE sr.package_id = ?
    ORDER BY s.category, s.name
  `, pkg.id);

  // Every payment of the combo: its own advance and payments, and any taken on its hall or rooms
  const w = comboPaymentsWhere(pkg);
  const payments = all(`
    SELECT p.*, u.name AS created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by
    WHERE ${w.sql}
    ORDER BY p.paid_on, p.id
  `, ...w.args);
  const advance_paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // Decoration booked with the combo (edits on the Decorations page change the bill too)
  const decor = all("SELECT * FROM decor_plans WHERE package_id = ? AND status <> 'cancelled' ORDER BY id", pkg.id)
    .map(p => ({ ...p, items: (() => { try { return JSON.parse(p.items) || []; } catch { return []; } })() }));
  const decor_amount = decor.reduce((s, p) => s + (Number(p.total) || 0), 0);

  // Sannai Melam booked with the combo
  const band = all("SELECT * FROM band_bookings WHERE package_id = ? AND status <> 'cancelled' ORDER BY id", pkg.id);
  const band_amount = band.reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // Power & generator charges entered later on the combo's hall booking belong on the combined bill
  const extras_amount = hall ? (Number(hall.power_amount) || 0) + (Number(hall.generator_amount) || 0) : 0;
  const grand_total = (Number(pkg.total_amount) || 0) + extras_amount + decor_amount + band_amount;
  const balance = Math.max(0, grand_total - advance_paid);

  return {
    ...pkg,
    advance_paid,
    hall,
    rooms,
    supplies,
    payments,
    decor,
    decor_amount,
    band,
    band_amount,
    extras_amount,
    grand_total,
    balance,
  };
};

const SLOTS = ['full', 'morning', 'evening', 'half'];

/** Sannai Melam details sent with a hall booking: timing, team, phone, players and price. */
function parseBand(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amount = Math.max(0, Math.round(num(raw.amount)));
  if (!amount) fail('Enter the Sannai Melam price, or remove the Sannai Melam');
  return {
    amount,
    timing: str(raw.timing).slice(0, 80), team: str(raw.team).slice(0, 120), team_phone: str(raw.team_phone).slice(0, 30),
    players: Math.max(0, Math.round(num(raw.players))), notes: str(raw.notes).slice(0, 500),
    team_amount: Math.max(0, Math.round(num(raw.team_amount))), // paid to the party, not on the bill
  };
}
function insertBand(b, { packageId, hallBookingId, customer_name, phone, event_date }, userId) {
  const { id } = run(`INSERT INTO band_bookings (package_id, hall_booking_id, customer_name, phone, event_date, timing, team, team_phone, players, amount, team_amount, notes, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    packageId, hallBookingId, customer_name, phone, event_date, b.timing, b.team, b.team_phone, b.players, b.amount, b.team_amount, b.notes, userId);
  setBillNo('band_bookings', id);
}

/**
 * Rooms, supplies, decoration and Sannai Melam asked for after the hall was booked. A plain hall
 * booking becomes a combo (one bill, one place to pay; its earlier payments count); a combo
 * simply gets more on its bill. Everything is checked before anything is saved.
 */
function addToHall(hb, body, user) {
  if (!['tentative', 'confirmed'].includes(hb.status)) fail('Extras can only be added to an upcoming, confirmed booking');
  const customer_name = hb.customer_name, phone = hb.phone, event_date = hb.event_date;
  const check_in = str(body.check_in_date) || event_date, check_out = str(body.check_out_date) || addDays(event_date, 1);

  // Rooms (checked for clashes)
  const rooms = [];
  for (const rItem of Array.isArray(body.rooms) ? body.rooms : []) {
    const room = found(get('SELECT * FROM rooms WHERE id = ?', num(rItem.room_id)), 'Room');
    const ci = str(rItem.check_in) || check_in, co = str(rItem.check_out) || check_out;
    if (!isDate(ci) || !isDate(co) || co <= ci) fail(`Room ${room.number}: check-out must be after check-in`);
    const clash = get(`SELECT guest_name, check_in, check_out FROM room_bookings WHERE room_id = ? AND status IN ('reserved','checked_in')
                       AND check_in < ? AND check_out > ?`, room.id, co, ci);
    if (clash) fail(`Room ${room.number} (${room.name}) is already booked for ${clash.guest_name} (${clash.check_in} → ${clash.check_out})`, 409);
    const rate = Math.max(0, num(rItem.rate !== undefined ? rItem.rate : room.rate));
    rooms.push({ room, ci, co, rate, total: rate * nightsBetween(ci, co), guests: Math.max(1, num(rItem.guests || room.capacity || 2)) });
  }
  // Supplies (checked against stock), with the full set discount spread over the lines
  const supplies = [];
  for (const sItem of Array.isArray(body.supplies) ? body.supplies : []) {
    const qty = num(sItem.quantity);
    if (qty <= 0) continue;
    const s = found(get('SELECT * FROM supplies WHERE id = ?', num(sItem.supply_id)), 'Supply item');
    if (qty > s.quantity) fail(`Only ${s.quantity} ${s.unit} of "${s.name}" currently available in stock (requested ${qty})`);
    const rate = Math.max(0, num(sItem.rent_rate !== undefined ? sItem.rent_rate : s.rent_rate));
    supplies.push({ s, qty, rate, total: qty * rate });
  }
  const shares = spreadDiscount(supplies.map(x => x.total), num(body.supplies_discount));
  supplies.forEach((x, i) => { x.discount = shares[i]; x.total -= shares[i]; });
  const rawDecor = body.decoration;
  const decoration = rawDecor && Array.isArray(rawDecor.items) && rawDecor.items.length ? parseDecorLines(rawDecor.items, rawDecor.discount) : null;
  const band = parseBand(body.band);
  if (!rooms.length && !supplies.length && !decoration && !band) fail('Pick at least one room, supply item, decoration or Sannai Melam to add');

  const roomsAmount = rooms.reduce((t, r) => t + r.total, 0);
  const suppliesAmount = supplies.reduce((t, x) => t + x.total, 0);

  return tx(() => {
    // A plain hall booking becomes a combo: the hall rent is its first line
    const packageId = comboForHall(hb, user.id);
    for (const r of rooms) {
      const { id } = run(`INSERT INTO room_bookings (package_id, room_id, guest_name, phone, id_proof, address, guests, check_in, check_out, rate, total, paid,
                            id_photo_taken, status, notes, created_by)
                          VALUES (?, ?, ?, ?, 'Package Booking', '', ?, ?, ?, ?, ?, 0, 1, 'reserved', ?, ?)`,
        packageId, r.room.id, customer_name, phone, r.guests, r.ci, r.co, r.rate, r.total, `Part of Event Package #${packageId} (${hb.event_type || 'Function'})`, user.id);
      setBillNo('room_bookings', id);
    }
    let billNo = null;
    for (const x of supplies) {
      const newAvail = x.s.quantity - x.qty;
      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvail, (Number(x.s.rented_quantity) || 0) + x.qty, x.s.id);
      const { id } = run(`INSERT INTO supply_rentals (package_id, supply_id, customer_name, phone, event_name, rent_date, expected_return_date,
                            quantity, rent_rate, total_rent, discount, status, notes, created_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rented', ?, ?)`,
        packageId, x.s.id, customer_name, phone, hb.event_type || 'Function', event_date, check_out, x.qty, x.rate, x.total, x.discount, `Part of Event Package #${packageId}`, user.id);
      billNo = setBillNo('supply_rentals', id, billNo || undefined);
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'out', ?, ?, ?, ?)",
        x.s.id, -x.qty, newAvail, `Package #${packageId} rented to ${customer_name}`, user.id);
    }
    if (decoration) {
      const { id } = run(`INSERT INTO decor_plans (package_id, hall_booking_id, customer_name, phone, event_name, event_date, items, subtotal, discount, total, notes, created_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        packageId, hb.id, customer_name, phone, hb.event_type || '', event_date, JSON.stringify(decoration.items),
        decoration.subtotal, decoration.discount, decoration.total, str(rawDecor.notes), user.id);
      setBillNo('decor_plans', id);
    }
    if (band) insertBand(band, { packageId, hallBookingId: hb.id, customer_name, phone, event_date }, user.id);
    run('UPDATE event_packages SET rooms_amount = rooms_amount + ?, supplies_amount = supplies_amount + ?, total_amount = total_amount + ? WHERE id = ?',
      roomsAmount, suppliesAmount, roomsAmount + suppliesAmount, packageId);
    // Money taken now goes on the combined bill
    const pay = Math.max(0, Math.round(num(body.advance)));
    if (pay > 0) {
      run(`INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by) VALUES ('hall', ?, ?, ?, ?, ?, ?)`,
        hb.id, pay, str(body.payment_method) || 'Cash', `Package Payment for #${packageId}`, today(), user.id);
      syncPaid('hall', hb.id);
    }
    syncComboPaid(packageId);
    return packageId;
  });
}
const nightsBetween = (a, b) =>
  Math.max(1, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000));

// GET /packages: List all event packages
r.get('/', (req, res) => {
  const status = str(req.query.status);
  const q = str(req.query.q);
  const where = [];
  const args = [];

  if (status && status !== 'all') {
    where.push('p.status = ?');
    args.push(status);
  }

  if (q) {
    where.push('(p.customer_name LIKE ? OR p.phone LIKE ? OR p.event_type LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const packages = all(`
    SELECT p.*,
      u.name AS created_by_name,
      h.name AS hall_name,
      hb.slot AS hall_slot,
      -- What is still on the bill: cancelled rooms, decoration and Sannai Melam don't count
      (SELECT COUNT(*) FROM room_bookings rb WHERE rb.package_id = p.id AND rb.status <> 'cancelled') AS rooms_count,
      (SELECT COUNT(*) FROM supply_rentals sr WHERE sr.package_id = p.id) AS supplies_count,
      (SELECT COUNT(*) FROM decor_plans dp WHERE dp.package_id = p.id AND dp.status <> 'cancelled') AS decor_count,
      (SELECT COUNT(*) FROM band_bookings bb WHERE bb.package_id = p.id AND bb.status <> 'cancelled') AS band_count,
      (p.total_amount + COALESCE(hb.power_amount, 0) + COALESCE(hb.generator_amount, 0) + ${addonsTotalSql('p')}) AS grand_total,
      MAX(0, p.total_amount + COALESCE(hb.power_amount, 0) + COALESCE(hb.generator_amount, 0) + ${addonsTotalSql('p')} - p.advance_paid) AS balance
    FROM event_packages p
    LEFT JOIN hall_bookings hb ON hb.id = p.hall_booking_id
    LEFT JOIN halls h ON h.id = hb.hall_id
    LEFT JOIN users u ON u.id = p.created_by
    ${whereClause}
    ORDER BY p.event_date DESC, p.id DESC
    LIMIT 200
  `, ...args);

  res.json(packages);
});

// POST /packages/from-hall/:hallId: add rooms, supplies, decoration or Sannai Melam to a hall booking
r.post('/from-hall/:hallId', (req, res) => {
  const hb = found(get('SELECT * FROM hall_bookings WHERE id = ?', req.params.hallId), 'Hall booking');
  const before = hb.package_id;
  const packageId = addToHall(hb, req.body || {}, req.user);
  const pkg = loadPackage(packageId);
  log(req.user.id, before ? 'extras added to combo' : 'hall booking turned into combo',
    `${pkg.bill_no} · ${hb.customer_name} · ${hb.event_date} · bill now ${inr(pkg.grand_total)}`);
  res.status(201).json(pkg);
});

// GET /packages/:id: Single package detail
r.get('/:id', (req, res) => {
  res.json(loadPackage(req.params.id));
});

// POST /packages: Create a new Bulk Event Package
r.post('/', (req, res) => {
  const customer_name = str(req.body.customer_name);
  const phone = str(req.body.phone);
  const event_type = str(req.body.event_type) || 'Wedding';
  const event_date = str(req.body.event_date);
  const slot = str(req.body.slot) || 'full';
  const notes = str(req.body.notes);
  const payment_method = str(req.body.payment_method) || 'Cash';

  if (!customer_name) fail('Customer name is required');
  if (!phone) fail('Customer phone number is required');
  if (!isDate(event_date)) fail('Valid event date is required');
  if (!SLOTS.includes(slot)) fail('Choose a valid hall slot');

  const check_in_date = str(req.body.check_in_date) || event_date;
  const check_out_date = str(req.body.check_out_date) || addDays(event_date, 1);

  // 1. Hall Validation & Conflict Check
  const hall_id = req.body.hall_id ? num(req.body.hall_id) : null;
  let hall = null;
  let hall_amount = 0;
  if (hall_id) {
    hall = found(get('SELECT * FROM halls WHERE id = ?', hall_id), 'Hall');
    hall_amount = num(req.body.hall_rent !== undefined ? req.body.hall_rent : (slot === 'full' ? hall.rate_full : hall.rate_half));

    // Check hall clash
    let conflictSql = `
      SELECT b.customer_name, b.event_date, b.slot
      FROM hall_bookings b
      WHERE b.event_date = ? AND b.status IN ('tentative', 'confirmed')
    `;
    const conflictArgs = [event_date];

    if (hall.is_combo) {
      let inc = [];
      try { inc = JSON.parse(hall.included_hall_ids || '[]'); } catch {}
      if (!inc.length) inc = [1, 2];
      const ph = inc.map(() => '?').join(',');
      conflictSql += ` AND (b.hall_id = ? OR b.hall_id IN (${ph}))`;
      conflictArgs.push(hall.id, ...inc);
    } else {
      const parentCombo = get("SELECT id FROM halls WHERE is_combo = 1 AND included_hall_ids LIKE ? LIMIT 1", `%"${hall.id}"%`);
      if (parentCombo) {
        conflictSql += ' AND (b.hall_id = ? OR b.hall_id = ?)';
        conflictArgs.push(hall.id, parentCombo.id);
      } else {
        conflictSql += ' AND b.hall_id = ?';
        conflictArgs.push(hall.id);
      }
    }

    if (slot !== 'full') {
      conflictSql += " AND (b.slot = 'full' OR b.slot = ?)";
      conflictArgs.push(slot);
    }

    const hallConflict = get(conflictSql, ...conflictArgs);
    if (hallConflict) {
      fail(`Hall is already booked for ${hallConflict.customer_name} on ${event_date} (${hallConflict.slot} slot)`, 409);
    }
  }

  // 2. Rooms Validation & Conflict Check
  const rawRooms = Array.isArray(req.body.rooms) ? req.body.rooms : [];
  const selectedRooms = [];
  let rooms_amount = 0;

  for (const rItem of rawRooms) {
    const roomId = num(rItem.room_id || rItem.id);
    if (!roomId) continue;
    const room = found(get('SELECT * FROM rooms WHERE id = ?', roomId), 'Room');
    const rCheckIn = str(rItem.check_in) || check_in_date;
    const rCheckOut = str(rItem.check_out) || check_out_date;
    const rRate = num(rItem.rate !== undefined ? rItem.rate : room.rate);
    const rGuests = num(rItem.guests || room.capacity || 2);

    // Check room clash
    const roomConflict = get(`
      SELECT guest_name, check_in, check_out FROM room_bookings
      WHERE room_id = ? AND status IN ('reserved', 'checked_in')
        AND check_in < ? AND check_out > ?
    `, room.id, rCheckOut, rCheckIn);

    if (!isDate(rCheckIn) || !isDate(rCheckOut) || rCheckOut <= rCheckIn)
      fail(`Room ${room.number}: check-out must be after check-in`);

    if (roomConflict) {
      fail(`Room ${room.number} (${room.name}) is already booked for ${roomConflict.guest_name} (${roomConflict.check_in} → ${roomConflict.check_out})`, 409);
    }

    // Rooms are charged per night
    const rTotal = rRate * nightsBetween(rCheckIn, rCheckOut);
    rooms_amount += rTotal;
    selectedRooms.push({
      room_id: room.id,
      room_name: room.name,
      room_number: room.number,
      check_in: rCheckIn,
      check_out: rCheckOut,
      rate: rRate,
      total: rTotal,
      guests: rGuests,
    });
  }

  // 3. Catering Supplies Validation & Stock Check
  const rawSupplies = Array.isArray(req.body.supplies) ? req.body.supplies : [];
  const selectedSupplies = [];
  let supplies_amount = 0;

  for (const sItem of rawSupplies) {
    const supplyId = num(sItem.supply_id || sItem.id);
    const qty = num(sItem.quantity);
    if (!supplyId || qty <= 0) continue;

    const supply = found(get('SELECT * FROM supplies WHERE id = ?', supplyId), 'Supply item');
    if (qty > supply.quantity) {
      fail(`Only ${supply.quantity} ${supply.unit} of "${supply.name}" currently available in stock (requested ${qty})`, 400);
    }

    const rate = num(sItem.rent_rate !== undefined ? sItem.rent_rate : supply.rent_rate);
    const itemTotal = qty * rate;
    supplies_amount += itemTotal;

    selectedSupplies.push({
      supply_id: supply.id,
      name: supply.name,
      unit: supply.unit,
      quantity: qty,
      rent_rate: rate,
      total_rent: itemTotal,
    });
  }

  // Supplies discount for the whole set (e.g. the full set price), spread over the lines
  const supplyShares = spreadDiscount(selectedSupplies.map(s => s.total_rent), num(req.body.supplies_discount));
  selectedSupplies.forEach((s, i) => { s.discount = supplyShares[i]; s.total_rent -= supplyShares[i]; });
  supplies_amount -= supplyShares.reduce((s, x) => s + x, 0);

  // 4. Decoration (optional), priced by the server from the lines sent
  const rawDecor = req.body.decoration;
  const decoration = rawDecor && Array.isArray(rawDecor.items) && rawDecor.items.length
    ? parseDecorLines(rawDecor.items, rawDecor.discount) : null;
  if (decoration && !decoration.items.length) fail('Add at least one decoration item, or remove the decoration');

  // 5. Sannai Melam (optional), a performance on the same bill
  const band = parseBand(req.body.band);

  const total_amount = hall_amount + rooms_amount + supplies_amount;
  const advance_paid = Math.min(total_amount + (decoration?.total || 0) + (band?.amount || 0), Math.max(0, num(req.body.advance)));
  const guests = Math.max(0, Math.round(num(req.body.guests)));
  const referral_name = str(req.body.referral_name).slice(0, 100);
  const referral_phone = str(req.body.referral_phone).slice(0, 30);

  // Execute Creation in a Single Transaction
  const createdPackage = tx(() => {
    // 1. Create event_packages entry
    const packageName = `${customer_name}'s ${event_type} Package`;
    const { id: packageId } = run(`
      INSERT INTO event_packages (
        package_name, customer_name, phone, event_type, event_date, check_in_date, check_out_date, slot,
        hall_amount, rooms_amount, supplies_amount, total_amount, advance_paid, payment_method, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      packageName, customer_name, phone, event_type, event_date, check_in_date, check_out_date, slot,
      hall_amount, rooms_amount, supplies_amount, total_amount, advance_paid, payment_method, notes, req.user.id
    );
    setBillNo('event_packages', packageId);

    // 2. Create Hall Booking
    let hallBookingId = null;
    if (hall_id && hall) {
      const hRes = run(`
        INSERT INTO hall_bookings (
          package_id, hall_id, customer_name, phone, event_type, event_date, slot, guests,
          rent, discount, total, paid, status, notes, referral_name, referral_phone, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
      `,
        packageId, hall.id, customer_name, phone, event_type, event_date, slot, guests,
        hall_amount, Math.max(0, Math.round(num(req.body.hall_discount))), hall_amount, advance_paid, notes ? `Part of Package #${packageId} · ${notes}` : `Part of Package #${packageId}`,
        referral_name, referral_phone, req.user.id
      );
      hallBookingId = hRes.id;
      setBillNo('hall_bookings', hallBookingId);
    }

    // Decoration plan, on this combo's bill
    if (decoration) {
      const { id: planId } = run(`
        INSERT INTO decor_plans (package_id, hall_booking_id, customer_name, phone, event_name, event_date,
          items, subtotal, discount, total, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, packageId, hallBookingId, customer_name, phone, event_type, event_date,
        JSON.stringify(decoration.items), decoration.subtotal, decoration.discount, decoration.total, str(rawDecor.notes), req.user.id);
      setBillNo('decor_plans', planId);
    }
    if (band) insertBand(band, { packageId, hallBookingId, customer_name, phone, event_date }, req.user.id);

    // 3. Create Room Bookings
    const roomBookingIds = [];
    for (const rm of selectedRooms) {
      const rbRes = run(`
        INSERT INTO room_bookings (
          package_id, room_id, guest_name, phone, id_proof, address, guests,
          check_in, check_out, rate, total, paid, id_photo_taken, status, notes, created_by
        ) VALUES (?, ?, ?, ?, 'Package Booking', '', ?, ?, ?, ?, ?, 0, 1, 'reserved', ?, ?)
      `,
        packageId, rm.room_id, customer_name, phone, rm.guests,
        rm.check_in, rm.check_out, rm.rate, rm.total,
        `Part of Event Package #${packageId} (${event_type})`, req.user.id
      );
      roomBookingIds.push(rbRes.id);
      setBillNo('room_bookings', rbRes.id);
    }

    // 4. Create Supply Rentals & Decrement Stock
    const supplyRentalIds = [];
    let suppliesBillNo = null; // all supplies of one combo share one bill number
    for (const sup of selectedSupplies) {
      const currentSupply = get('SELECT quantity, rented_quantity FROM supplies WHERE id = ?', sup.supply_id);
      const newAvail = currentSupply.quantity - sup.quantity;
      const newRented = (Number(currentSupply.rented_quantity) || 0) + sup.quantity;

      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvail, newRented, sup.supply_id);

      const srRes = run(`
        INSERT INTO supply_rentals (
          package_id, supply_id, customer_name, phone, event_name, rent_date, expected_return_date,
          quantity, rent_rate, total_rent, discount, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rented', ?, ?)
      `,
        packageId, sup.supply_id, customer_name, phone,
        `${event_type} (${hall ? hall.name : 'Function'})`,
        event_date, check_out_date, sup.quantity, sup.rent_rate, sup.total_rent, sup.discount || 0,
        `Part of Event Package #${packageId}`, req.user.id
      );
      supplyRentalIds.push(srRes.id);
      suppliesBillNo = setBillNo('supply_rentals', srRes.id, suppliesBillNo || undefined);

      // Record outward stock move
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'out', ?, ?, ?, ?)",
        sup.supply_id, -sup.quantity, newAvail,
        `Package #${packageId} rented to ${customer_name} (${event_type})`, req.user.id
      );
    }

    // 5. Record Advance Payment if received
    if (advance_paid > 0) {
      run(`
        INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by)
        VALUES ('hall', ?, ?, ?, ?, ?, ?)
      `,
        hallBookingId || 0,
        advance_paid,
        payment_method,
        `Package Advance for #${packageId} · ${customer_name} (Total: ₹${total_amount})`,
        today(),
        req.user.id
      );
    }

    // 6. Update event_packages with references
    run(`
      UPDATE event_packages
      SET hall_booking_id = ?, room_booking_ids = ?, supply_rental_ids = ?
      WHERE id = ?
    `, hallBookingId, JSON.stringify(roomBookingIds), JSON.stringify(supplyRentalIds), packageId);

    return loadPackage(packageId);
  });

  log(req.user.id, 'event package created', `${customer_name} · ${event_type} · Total ₹${total_amount} (Adv ₹${advance_paid})`);
  res.status(201).json(createdPackage);
});

// POST /packages/:id/payment: Collect additional payment for package
r.post('/:id/payment', (req, res) => {
  const pkg = loadPackage(req.params.id);
  const amount = num(req.body.amount);
  const method = str(req.body.method) || 'Cash';
  const note = safeNote(str(req.body.note));

  if (amount <= 0) fail('Payment amount must be greater than zero');
  if (amount > pkg.balance) fail(`Amount exceeds pending package balance of ₹${pkg.balance}`);

  tx(() => {
    run(`
      INSERT INTO payments (kind, booking_id, amount, method, note, paid_on, created_by)
      VALUES ('hall', ?, ?, ?, ?, ?, ?)
    `,
      pkg.hall_booking_id || 0,
      amount,
      method,
      `Package Payment for #${pkg.id}${note ? ' · ' + note : ''}`,
      today(),
      req.user.id
    );
    if (pkg.hall_booking_id) syncPaid('hall', pkg.hall_booking_id);
    syncComboPaid(pkg.id);
  });

  log(req.user.id, 'package payment recorded', `₹${amount} for ${pkg.customer_name} (Package #${pkg.id})`);
  res.json(loadPackage(pkg.id));
});

// PATCH /packages/:id/rooms/:roomBookingId (admin only): change one combo room's rate per night.
// The room's total and the combo bill change by the same amount.
r.patch('/:id/rooms/:roomBookingId', requireAdmin, (req, res) => {
  const pkg = loadPackage(req.params.id);
  if (pkg.status === 'cancelled') fail('This combo is cancelled');
  const room = found(pkg.rooms.find(x => x.id === Number(req.params.roomBookingId)), 'Room in this combo');
  if (room.status === 'cancelled') fail('This room booking is cancelled');
  const rate = num(req.body.rate, -1);
  if (rate < 0) fail('Enter a valid rate per night');
  const total = Math.max(0, Math.round(rate * nightsBetween(room.check_in, room.check_out)) - (Number(room.discount) || 0));
  const diff = total - (Number(room.total) || 0);
  tx(() => {
    run('UPDATE room_bookings SET rate = ?, total = ? WHERE id = ?', rate, total, room.id);
    run('UPDATE event_packages SET rooms_amount = rooms_amount + ?, total_amount = total_amount + ? WHERE id = ?', diff, diff, pkg.id);
  });
  log(req.user.id, 'combo room rate changed',
    `${pkg.bill_no || `#${pkg.id}`} · ${room.room_name} · ${inr(room.rate)} → ${inr(rate)}/night · total ${inr(total)}`);
  res.json(loadPackage(pkg.id));
});

// PATCH /packages/:id/cancel: Cancel the bulk event package
r.patch('/:id/cancel', (req, res) => {
  const pkg = loadPackage(req.params.id);
  if (pkg.status === 'cancelled') fail('Package is already cancelled');

  tx(() => {
    // 1. Cancel Package
    run("UPDATE event_packages SET status = 'cancelled' WHERE id = ?", pkg.id);

    // 2. Cancel Hall Booking
    if (pkg.hall_booking_id) {
      run("UPDATE hall_bookings SET status = 'cancelled' WHERE id = ?", pkg.hall_booking_id);
    }

    // 3. Cancel Room Bookings and the combo's decoration
    run("UPDATE room_bookings SET status = 'cancelled' WHERE package_id = ?", pkg.id);
    run("UPDATE decor_plans SET status = 'cancelled' WHERE package_id = ?", pkg.id);
    run("UPDATE band_bookings SET status = 'cancelled' WHERE package_id = ?", pkg.id);

    // 4. Return all rented supplies back to stock
    for (const sup of pkg.supplies) {
      if (sup.status === 'rented') {
        const s = get('SELECT quantity, rented_quantity FROM supplies WHERE id = ?', sup.supply_id);
        if (s) {
          const newAvail = s.quantity + sup.quantity;
          const newRented = Math.max(0, (Number(s.rented_quantity) || 0) - sup.quantity);
          run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvail, newRented, sup.supply_id);
          run("UPDATE supply_rentals SET status = 'returned', return_date = ?, notes = 'Cancelled with package' WHERE id = ?", today(), sup.id);
          run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'in', ?, ?, ?, ?)",
            sup.supply_id, sup.quantity, newAvail, `Restored from cancelled Package #${pkg.id}`, req.user.id);
        }
      }
    }
  });

  log(req.user.id, 'event package cancelled', `${pkg.customer_name} (Package #${pkg.id})`);
  res.json({ ok: true });
});

// DELETE /packages/:id (admin only): remove a combo for good, with its hall booking, rooms,
// supply rentals and every payment. Supplies still out go back to stock first. Its bill number
// is never given to anyone else.
r.delete('/:id', requireAdmin, (req, res) => {
  const pkg = loadPackage(req.params.id);
  const w = comboPaymentsWhere(pkg); // read before the rooms are removed
  tx(() => {
    for (const sup of pkg.supplies) {
      if (sup.status !== 'rented') continue;
      const s = get('SELECT quantity, rented_quantity FROM supplies WHERE id = ?', sup.supply_id);
      if (!s) continue;
      const newAvail = s.quantity + sup.quantity;
      const newRented = Math.max(0, (Number(s.rented_quantity) || 0) - sup.quantity);
      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvail, newRented, sup.supply_id);
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'in', ?, ?, ?, ?)",
        sup.supply_id, sup.quantity, newAvail, `Returned: combo ${pkg.bill_no || `#${pkg.id}`} deleted`, req.user.id);
    }
    run(`DELETE FROM payments WHERE ${w.sql}`, ...w.args);
    run('DELETE FROM decor_plans WHERE package_id = ?', pkg.id);
    run('DELETE FROM band_bookings WHERE package_id = ?', pkg.id);
    if (pkg.hall_booking_id) {
      run('UPDATE decor_plans SET hall_booking_id = NULL WHERE hall_booking_id = ?', pkg.hall_booking_id);
      run('UPDATE event_packages SET hall_booking_id = NULL WHERE id = ?', pkg.id);
    }
    run('DELETE FROM supply_rentals WHERE package_id = ?', pkg.id);
    run('DELETE FROM room_bookings WHERE package_id = ?', pkg.id);
    if (pkg.hall_booking_id) run('DELETE FROM hall_bookings WHERE id = ?', pkg.hall_booking_id);
    run('DELETE FROM event_packages WHERE id = ?', pkg.id);
  });
  log(req.user.id, 'combo deleted',
    `${pkg.bill_no || `#${pkg.id}`} · ${pkg.customer_name} · ${pkg.event_date} · payments ${inr(pkg.advance_paid)} removed`);
  res.json({ ok: true });
});
