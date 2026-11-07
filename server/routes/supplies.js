import { Router } from 'express';
import { all, get, log, run, tx, today } from '../db.js';
import { fail, found, num, str } from '../lib/http.js';
import { requireAdmin } from '../middleware/auth.js';

const r = Router();
export default r;

const parse = b => {
  const total_quantity = num(b.total_quantity !== undefined ? b.total_quantity : b.quantity);
  const d = {
    name: str(b.name),
    category: str(b.category) || 'General',
    unit: str(b.unit) || 'pcs',
    total_quantity: Math.max(0, total_quantity),
    quantity: Math.max(0, num(b.quantity !== undefined ? b.quantity : total_quantity)),
    min_quantity: Math.max(0, num(b.min_quantity)),
    rent_rate: Math.max(0, num(b.rent_rate !== undefined ? b.rent_rate : b.unit_cost)),
    unit_cost: Math.max(0, num(b.unit_cost !== undefined ? b.unit_cost : b.rent_rate)),
  };
  if (!d.name) fail('Item name is required');
  return d;
};

const load = id => found(get('SELECT * FROM supplies WHERE id = ?', id), 'Item');

// GET /supplies: Returns all items with total, available, and rented quantities
r.get('/', (req, res) => {
  const items = all(`
    SELECT s.*,
      COALESCE(s.total_quantity, s.quantity) AS total_quantity,
      COALESCE(s.rented_quantity, 0) AS rented_quantity,
      s.quantity AS available_quantity,
      COALESCE(s.rent_rate, s.unit_cost) AS rent_rate,
      (SELECT COUNT(*) FROM supply_rentals r WHERE r.supply_id = s.id AND r.status = 'rented') AS active_rentals_count,
      s.quantity <= s.min_quantity AS low
    FROM supplies s
    ORDER BY s.category, s.name
  `);
  res.json(items);
});

// GET /supplies/rentals: Returns rental records
r.get('/rentals', (req, res) => {
  const status = str(req.query.status);
  const supply_id = num(req.query.supply_id);
  const where = [];
  const args = [];
  if (status && status !== 'all') {
    where.push('r.status = ?');
    args.push(status);
  }
  if (supply_id) {
    where.push('r.supply_id = ?');
    args.push(supply_id);
  }
  const sql = `
    SELECT r.*,
      s.name AS supply_name,
      s.category AS supply_category,
      s.unit AS supply_unit,
      u.name AS created_by_name
    FROM supply_rentals r
    JOIN supplies s ON s.id = r.supply_id
    LEFT JOIN users u ON u.id = r.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (r.status = 'rented') DESC, r.rent_date DESC, r.id DESC
    LIMIT 300
  `;
  res.json(all(sql, ...args));
});

// GET /supplies/moves: Movement history
r.get('/moves', (req, res) => {
  const id = num(req.query.supply_id);
  res.json(all(
    `SELECT m.*, s.name AS supply_name, s.unit, u.name AS created_by_name FROM stock_moves m
     JOIN supplies s ON s.id = m.supply_id LEFT JOIN users u ON u.id = m.created_by
     ${id ? 'WHERE m.supply_id = ?' : ''} ORDER BY m.id DESC LIMIT 300`, ...(id ? [id] : [])));
});

// POST /supplies: Add new rental item
r.post('/', requireAdmin, (req, res) => {
  const d = parse(req.body);
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO supplies (name, category, unit, quantity, total_quantity, rented_quantity, min_quantity, rent_rate, unit_cost)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      d.name, d.category, d.unit, d.total_quantity, d.total_quantity, d.min_quantity, d.rent_rate, d.unit_cost
    );
    if (d.total_quantity > 0) {
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'in', ?, ?, 'Initial inventory added', ?)",
        id, d.total_quantity, d.total_quantity, req.user.id);
    }
    return id;
  });
  log(req.user.id, 'rental item added', `${d.name} · ${d.total_quantity} ${d.unit} (₹${d.rent_rate}/${d.unit})`);
  res.status(201).json({ id });
});

// PUT /supplies/:id: Update rental item details
r.put('/:id', requireAdmin, (req, res) => {
  const old = load(req.params.id);
  const d = parse(req.body);
  tx(() => {
    const rented = Number(old.rented_quantity) || 0;
    const newAvailable = Math.max(0, d.total_quantity - rented);
    run(
      `UPDATE supplies
       SET name = ?, category = ?, unit = ?, total_quantity = ?, quantity = ?, min_quantity = ?, rent_rate = ?, unit_cost = ?
       WHERE id = ?`,
      d.name, d.category, d.unit, d.total_quantity, newAvailable, d.min_quantity, d.rent_rate, d.unit_cost, old.id
    );
    if (d.total_quantity !== old.total_quantity) {
      const diff = d.total_quantity - (old.total_quantity || old.quantity);
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'adjust', ?, ?, 'Total stock updated by admin', ?)",
        old.id, diff, newAvailable, req.user.id);
    }
  });
  log(req.user.id, 'rental item updated', d.name);
  res.json({ ok: true });
});

// DELETE /supplies/:id: Delete item
r.delete('/:id', requireAdmin, (req, res) => {
  const s = load(req.params.id);
  if (Number(s.rented_quantity) > 0) {
    fail(`Cannot delete "${s.name}" because ${s.rented_quantity} ${s.unit} are currently rented out to functions. Please receive them back first.`, 400);
  }
  run('DELETE FROM supplies WHERE id = ?', s.id);
  log(req.user.id, 'rental item deleted', s.name);
  res.json({ ok: true });
});

// POST /supplies/rent-bulk: Rent out multiple equipment items in bulk for a function
r.post('/rent-bulk', (req, res) => {
  const customer_name = str(req.body.customer_name);
  const phone = str(req.body.phone);
  const event_name = str(req.body.event_name);
  const rent_date = str(req.body.rent_date) || today();
  const expected_return_date = str(req.body.expected_return_date);
  const advance_amount = Math.max(0, num(req.body.advance_amount || req.body.advance));
  const payment_method = str(req.body.payment_method) || 'Cash';
  const notes = str(req.body.notes);
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

  if (!customer_name) fail('Customer or function in-charge name is required');
  if (!rawItems.length) fail('Please add at least one equipment item to rent');

  // Parse and validate items
  const items = rawItems.map(it => {
    const supply_id = num(it.supply_id || it.id);
    const quantity = num(it.quantity);
    const rent_rate = num(it.rent_rate);
    if (!supply_id) fail('Invalid item in bulk rental list');
    if (quantity <= 0) fail('Quantity must be greater than zero for all items');
    return { supply_id, quantity, rent_rate };
  });

  const result = tx(() => {
    const dateStr = rent_date.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const rental_group_id = `RNT-${dateStr}-${randomSuffix}`;

    let grandTotalRent = 0;
    const createdRentals = [];

    for (const it of items) {
      const s = load(it.supply_id);
      if (it.quantity > s.quantity) {
        fail(`Cannot rent ${it.quantity} ${s.unit} of "${s.name}". Only ${s.quantity} ${s.unit} currently available in stock!`);
      }

      const rate = it.rent_rate !== undefined && it.rent_rate !== '' ? it.rent_rate : (Number(s.rent_rate) || 0);
      const total_rent = it.quantity * rate;
      grandTotalRent += total_rent;

      const newAvailable = s.quantity - it.quantity;
      const newRented = (Number(s.rented_quantity) || 0) + it.quantity;

      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvailable, newRented, s.id);

      const { id } = run(
        `INSERT INTO supply_rentals (
          supply_id, rental_group_id, customer_name, phone, event_name, rent_date, expected_return_date,
          quantity, rent_rate, total_rent, advance_amount, payment_method, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rented', ?, ?)`,
        s.id, rental_group_id, customer_name, phone, event_name, rent_date, expected_return_date,
        it.quantity, rate, total_rent, advance_amount, payment_method, notes, req.user.id
      );

      const moveNote = `Bulk rental [${rental_group_id}] to ${customer_name}${event_name ? ` (${event_name})` : ''}`;
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'out', ?, ?, ?, ?)",
        s.id, -it.quantity, newAvailable, moveNote, req.user.id);

      createdRentals.push({
        id,
        supply_id: s.id,
        supply_name: s.name,
        quantity: it.quantity,
        unit: s.unit,
        rent_rate: rate,
        total_rent,
      });
    }

    return {
      ok: true,
      rental_group_id,
      customer_name,
      phone,
      event_name,
      rent_date,
      expected_return_date,
      items_count: createdRentals.length,
      total_rent: grandTotalRent,
      advance_amount,
      balance: Math.max(0, grandTotalRent - advance_amount),
      payment_method,
      rentals: createdRentals,
    };
  });

  log(req.user.id, 'bulk equipment rented', `${items.length} items to ${customer_name} (${result.rental_group_id})`);
  res.status(201).json(result);
});

// POST /supplies/rentals/group/:groupId/return: Return all items in a bulk rental group
r.post('/rentals/group/:groupId/return', (req, res) => {
  const groupId = req.params.groupId;
  const rentals = all('SELECT * FROM supply_rentals WHERE rental_group_id = ? AND status = ?', groupId, 'rented');
  if (!rentals.length) {
    fail('No active items found to return in this rental group', 400);
  }

  const damage_notes = str(req.body.damage_notes);
  const notes = str(req.body.notes);

  tx(() => {
    for (const rental of rentals) {
      const s = load(rental.supply_id);
      const returned_quantity = rental.quantity;
      const newAvailable = s.quantity + returned_quantity;
      const newRented = Math.max(0, (Number(s.rented_quantity) || 0) - returned_quantity);

      run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvailable, newRented, s.id);

      run(
        `UPDATE supply_rentals
         SET status = 'returned', return_date = ?, returned_quantity = ?, damage_notes = ?, notes = ?
         WHERE id = ?`,
        today(), returned_quantity, damage_notes, notes || rental.notes, rental.id
      );

      let moveNote = `Bulk return [${groupId}] from ${rental.customer_name}`;
      if (damage_notes) moveNote += ` (${damage_notes})`;

      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'in', ?, ?, ?, ?)",
        s.id, returned_quantity, newAvailable, moveNote, req.user.id);
    }
  });

  log(req.user.id, 'bulk equipment returned', `Group ${groupId} (${rentals.length} items)`);
  res.json({ ok: true, count: rentals.length });
});

// POST /supplies/:id/rent: Rent out item to a function/customer
r.post('/:id/rent', (req, res) => {
  const s = load(req.params.id);
  const customer_name = str(req.body.customer_name);
  const phone = str(req.body.phone);
  const event_name = str(req.body.event_name);
  const rent_date = str(req.body.rent_date) || today();
  const expected_return_date = str(req.body.expected_return_date);
  const quantity = num(req.body.quantity);
  const rent_rate = req.body.rent_rate !== undefined && req.body.rent_rate !== '' ? num(req.body.rent_rate) : (Number(s.rent_rate) || 0);
  const total_rent = quantity * rent_rate;
  const advance_amount = Math.max(0, num(req.body.advance_amount || req.body.advance));
  const payment_method = str(req.body.payment_method) || 'Cash';
  const notes = str(req.body.notes);

  if (!customer_name) fail('Customer or function name is required');
  if (quantity <= 0) fail('Quantity to rent must be greater than zero');
  if (quantity > s.quantity) fail(`Only ${s.quantity} ${s.unit} currently available in stock (${s.rented_quantity || 0} ${s.unit} currently rented out)`);

  const rental = tx(() => {
    const newAvailable = s.quantity - quantity;
    const newRented = (Number(s.rented_quantity) || 0) + quantity;

    run('UPDATE supplies SET quantity = ?, rented_quantity = ? WHERE id = ?', newAvailable, newRented, s.id);

    const { id } = run(
      `INSERT INTO supply_rentals (supply_id, customer_name, phone, event_name, rent_date, expected_return_date, quantity, rent_rate, total_rent, advance_amount, payment_method, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rented', ?, ?)`,
      s.id, customer_name, phone, event_name, rent_date, expected_return_date, quantity, rent_rate, total_rent, advance_amount, payment_method, notes, req.user.id
    );

    const moveNote = `Rented to ${customer_name}${event_name ? ` (${event_name})` : ''}${notes ? ` · ${notes}` : ''}`;
    run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'out', ?, ?, ?, ?)",
      s.id, -quantity, newAvailable, moveNote, req.user.id);

    return get('SELECT * FROM supply_rentals WHERE id = ?', id);
  });

  log(req.user.id, 'supply rented to function', `${s.name} · ${quantity} ${s.unit} to ${customer_name}`);
  res.status(201).json(rental);
});

// POST /supplies/rentals/:rentalId/return: Receive item back from function
r.post('/rentals/:rentalId/return', (req, res) => {
  const rental = found(get('SELECT * FROM supply_rentals WHERE id = ?', req.params.rentalId), 'Rental record');
  if (rental.status === 'returned') fail('This rental has already been marked as returned');

  const s = load(rental.supply_id);
  const returned_quantity = req.body.returned_quantity !== undefined && req.body.returned_quantity !== '' ? num(req.body.returned_quantity) : rental.quantity;
  const damage_notes = str(req.body.damage_notes);
  const notes = str(req.body.notes);

  if (returned_quantity < 0) fail('Returned quantity cannot be negative');
  if (returned_quantity > rental.quantity) fail(`Returned quantity cannot exceed rented quantity (${rental.quantity} ${s.unit})`);

  tx(() => {
    const newAvailable = s.quantity + returned_quantity;
    const newRented = Math.max(0, (Number(s.rented_quantity) || 0) - rental.quantity);
    const differenceLost = Math.max(0, rental.quantity - returned_quantity);
    const newTotal = differenceLost > 0 ? Math.max(0, (Number(s.total_quantity) || s.quantity) - differenceLost) : (Number(s.total_quantity) || s.quantity);

    run('UPDATE supplies SET quantity = ?, rented_quantity = ?, total_quantity = ? WHERE id = ?', newAvailable, newRented, newTotal, s.id);

    run(
      `UPDATE supply_rentals
       SET status = 'returned', return_date = ?, returned_quantity = ?, damage_notes = ?, notes = ?
       WHERE id = ?`,
      today(), returned_quantity, damage_notes, notes || rental.notes, rental.id
    );

    let moveNote = `Returned by ${rental.customer_name}`;
    if (damage_notes) moveNote += ` (${damage_notes})`;
    if (returned_quantity < rental.quantity) moveNote += ` [${rental.quantity - returned_quantity} missing/damaged retired from stock]`;

    run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, 'in', ?, ?, ?, ?)",
      s.id, returned_quantity, newAvailable, moveNote, req.user.id);
  });

  log(req.user.id, 'supply returned from function', `${s.name} · ${returned_quantity}/${rental.quantity} ${s.unit} from ${rental.customer_name}`);
  res.json({ ok: true });
});

// POST /supplies/:id/move: Stock in or write-off adjustment
r.post('/:id/move', (req, res) => {
  const s = load(req.params.id);
  const type = req.body.type === 'out' ? 'out' : 'in';
  const qty = num(req.body.quantity);
  const note = str(req.body.note);
  if (qty <= 0) fail('Enter a quantity greater than zero');
  if (type === 'out' && qty > s.quantity) fail(`Only ${s.quantity} ${s.unit} available in stock`);
  
  const balance = type === 'in' ? s.quantity + qty : s.quantity - qty;
  const newTotal = type === 'in' ? (Number(s.total_quantity) || s.quantity) + qty : Math.max(0, (Number(s.total_quantity) || s.quantity) - qty);
  
  tx(() => {
    run('UPDATE supplies SET quantity = ?, total_quantity = ? WHERE id = ?', balance, newTotal, s.id);
    recordMove(s.id, type, type === 'in' ? qty : -qty, balance, note || (type === 'in' ? 'Purchased / added stock' : 'Stock retired / damaged'), req.user.id);
  });
  log(req.user.id, type === 'in' ? 'stock added' : 'stock retired', `${s.name} · ${qty} ${s.unit}${note ? ' · ' + note : ''}`);
  res.json(get('SELECT * FROM supplies WHERE id = ?', s.id));
});

const recordMove = (supplyId, type, qty, balance, note, userId) =>
  run('INSERT INTO stock_moves (supply_id, type, quantity, balance, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    supplyId, type, qty, balance, note, userId);
