import { Router } from 'express';
import { all, get, log, run, today, tx } from '../db.js';
import { fail, found, isDate, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

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
      SELECT b.*, h.name AS hall_name, h.is_combo
      FROM hall_bookings b
      JOIN halls h ON h.id = b.hall_id
      WHERE b.id = ?
    `, pkg.hall_booking_id);
  }

  // Room details
  const rooms = all(`
    SELECT b.*, r.number AS room_number, r.name AS room_name, r.type AS room_type
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

  // Payments
  const payments = pkg.hall_booking_id
    ? all("SELECT p.*, u.name AS created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE (p.kind = 'hall' AND p.booking_id = ?) OR p.note LIKE ? ORDER BY p.id",
        pkg.hall_booking_id, `%Package #${pkg.id}%`)
    : [];

  const balance = Math.max(0, pkg.total_amount - pkg.advance_paid);

  return {
    ...pkg,
    hall,
    rooms,
    supplies,
    payments,
    balance,
  };
};

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
      (SELECT COUNT(*) FROM room_bookings rb WHERE rb.package_id = p.id) AS rooms_count,
      (SELECT COUNT(*) FROM supply_rentals sr WHERE sr.package_id = p.id) AS supplies_count,
      (p.total_amount - p.advance_paid) AS balance
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

  const check_in_date = str(req.body.check_in_date) || event_date;
  const check_out_date = str(req.body.check_out_date) || addDays(event_date, 1);

  // 1. Hall Validation & Conflict Check
  const hall_id = req.body.hall_id ? num(req.body.hall_id) : null;
  let hall = null;
  let hall_amount = 0;
  if (hall_id) {
    hall = found(get('SELECT * FROM halls WHERE id = ?', hall_id), 'Hall');
    hall_amount = num(req.body.hall_rent !== undefined ? req.body.hall_rent : (slot === 'half' ? hall.rate_half : hall.rate_full));

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

    if (roomConflict) {
      fail(`Room ${room.number} (${room.name}) is already booked for ${roomConflict.guest_name} (${roomConflict.check_in} → ${roomConflict.check_out})`, 409);
    }

    rooms_amount += rRate;
    selectedRooms.push({
      room_id: room.id,
      room_name: room.name,
      room_number: room.number,
      check_in: rCheckIn,
      check_out: rCheckOut,
      rate: rRate,
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

  const total_amount = hall_amount + rooms_amount + supplies_amount;
  const advance_paid = Math.min(total_amount, Math.max(0, num(req.body.advance)));

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

    // 2. Create Hall Booking
    let hallBookingId = null;
    if (hall_id && hall) {
      const hRes = run(`
        INSERT INTO hall_bookings (
          package_id, hall_id, customer_name, phone, event_type, event_date, slot,
          rent, total, paid, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
      `,
        packageId, hall.id, customer_name, phone, event_type, event_date, slot,
        hall_amount, hall_amount, advance_paid, notes ? `Part of Package #${packageId} · ${notes}` : `Part of Package #${packageId}`, req.user.id
      );
      hallBookingId = hRes.id;
    }

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
        rm.check_in, rm.check_out, rm.rate, rm.rate,
        `Part of Event Package #${packageId} (${event_type})`, req.user.id
      );
      roomBookingIds.push(rbRes.id);
    }

    // 4. Create Supply Rentals & Decrement Stock
    const supplyRentalIds = [];
    for (const sup of selectedSupplies) {
      const currentSupply = get('SELECT quantity, rented_quantity FROM supplies WHERE id = ?', sup.supply_id);
      const newAvail = currentSupply.quantity - sup.quantity;
      const newRented = (Number(currentSupply.rented_quantity) || 0) + sup.quantity;

      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvail, newRented, sup.supply_id);

      const srRes = run(`
        INSERT INTO supply_rentals (
          package_id, supply_id, customer_name, phone, event_name, rent_date, expected_return_date,
          quantity, rent_rate, total_rent, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rented', ?, ?)
      `,
        packageId, sup.supply_id, customer_name, phone,
        `${event_type} (${hall ? hall.name : 'Function'})`,
        event_date, check_out_date, sup.quantity, sup.rent_rate, sup.total_rent,
        `Part of Event Package #${packageId}`, req.user.id
      );
      supplyRentalIds.push(srRes.id);

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
  const note = str(req.body.note);

  if (amount <= 0) fail('Payment amount must be greater than zero');
  if (amount > pkg.balance) fail(`Amount exceeds pending package balance of ₹${pkg.balance}`);

  tx(() => {
    const newPaid = pkg.advance_paid + amount;
    run('UPDATE event_packages SET advance_paid = ? WHERE id = ?', newPaid, pkg.id);

    if (pkg.hall_booking_id) {
      const hb = get('SELECT paid FROM hall_bookings WHERE id = ?', pkg.hall_booking_id);
      if (hb) {
        run('UPDATE hall_bookings SET paid = paid + ? WHERE id = ?', amount, pkg.hall_booking_id);
      }
    }

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
  });

  log(req.user.id, 'package payment recorded', `₹${amount} for ${pkg.customer_name} (Package #${pkg.id})`);
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

    // 3. Cancel Room Bookings
    run("UPDATE room_bookings SET status = 'cancelled' WHERE package_id = ?", pkg.id);

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
