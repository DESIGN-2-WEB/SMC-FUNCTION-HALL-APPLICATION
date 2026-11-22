import bcrypt from 'bcryptjs';
import { db, get, run, tx } from './db.js';
import { backfillBillNos } from './lib/billno.js';
import { attachLinkedExtras, syncAllComboPaid } from './lib/combo.js';

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','staff')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'AC Room',
    rate REAL NOT NULL DEFAULT 0,
    capacity INTEGER NOT NULL DEFAULT 2,
    amenities TEXT NOT NULL DEFAULT '',
    maintenance INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS halls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    capacity INTEGER NOT NULL DEFAULT 100,
    rate_full REAL NOT NULL DEFAULT 0,
    rate_half REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    is_combo INTEGER NOT NULL DEFAULT 0,
    included_hall_ids TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS room_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    guest_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    id_proof TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    guests INTEGER NOT NULL DEFAULT 1,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    rate REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    id_photo_taken INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'reserved',
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS hall_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hall_id INTEGER NOT NULL REFERENCES halls(id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL,
    slot TEXT NOT NULL DEFAULT 'full',
    guests INTEGER NOT NULL DEFAULT 0,
    rent REAL NOT NULL DEFAULT 0,
    power_start REAL NOT NULL DEFAULT 0,
    power_end REAL NOT NULL DEFAULT 0,
    power_units REAL NOT NULL DEFAULT 0,
    power_rate REAL NOT NULL DEFAULT 15,
    power_amount REAL NOT NULL DEFAULT 0,
    generator_type TEXT NOT NULL DEFAULT '',
    generator_hours REAL NOT NULL DEFAULT 0,
    generator_rate REAL NOT NULL DEFAULT 0,
    generator_amount REAL NOT NULL DEFAULT 0,
    generator_list TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('room','hall','band')),
    booking_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'Cash',
    note TEXT NOT NULL DEFAULT '',
    paid_on TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category TEXT NOT NULL DEFAULT 'General',
    unit TEXT NOT NULL DEFAULT 'pcs',
    quantity REAL NOT NULL DEFAULT 0,
    min_quantity REAL NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS stock_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
    quantity REAL NOT NULL,
    balance REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_room_bookings ON room_bookings(room_id, check_in);
  CREATE INDEX IF NOT EXISTS idx_hall_bookings ON hall_bookings(hall_id, event_date);
  CREATE INDEX IF NOT EXISTS idx_payments ON payments(kind, booking_id);
  CREATE INDEX IF NOT EXISTS idx_stock_moves ON stock_moves(supply_id);
  `);

  const hbCols = new Set(db.prepare("PRAGMA table_info(hall_bookings)").all().map(c => c.name));
  const newCols = [
    ['rent', 'REAL NOT NULL DEFAULT 0'],
    ['power_start', 'REAL NOT NULL DEFAULT 0'],
    ['power_end', 'REAL NOT NULL DEFAULT 0'],
    ['power_units', 'REAL NOT NULL DEFAULT 0'],
    ['power_rate', 'REAL NOT NULL DEFAULT 15'],
    ['power_amount', 'REAL NOT NULL DEFAULT 0'],
    ['generator_type', "TEXT NOT NULL DEFAULT ''"],
    ['generator_hours', 'REAL NOT NULL DEFAULT 0'],
    ['generator_rate', 'REAL NOT NULL DEFAULT 0'],
    ['generator_amount', 'REAL NOT NULL DEFAULT 0'],
    ['generator_list', "TEXT NOT NULL DEFAULT ''"], // every generator used, when more than one ran (JSON)
    ['referral_name', "TEXT NOT NULL DEFAULT ''"], // who referred the customer (optional)
    ['referral_phone', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [col, def] of newCols) {
    if (!hbCols.has(col)) {
      db.exec(`ALTER TABLE hall_bookings ADD COLUMN ${col} ${def}`);
    }
  }

  const rbCols = new Set(db.prepare("PRAGMA table_info(room_bookings)").all().map(c => c.name));
  const newRbCols = [
    ['id_photo_taken', 'INTEGER NOT NULL DEFAULT 0'],
    ['discount', 'REAL NOT NULL DEFAULT 0'],
    ['checked_out_at', "TEXT NOT NULL DEFAULT ''"], // when the guest actually left
    ['checked_in_at', "TEXT NOT NULL DEFAULT ''"], // when the guest actually arrived
  ];
  for (const [col, def] of newRbCols) {
    if (!rbCols.has(col)) {
      db.exec(`ALTER TABLE room_bookings ADD COLUMN ${col} ${def}`);
    }
  }

  const hCols = new Set(db.prepare("PRAGMA table_info(halls)").all().map(c => c.name));
  const newHCols = [
    ['is_combo', 'INTEGER NOT NULL DEFAULT 0'],
    ['included_hall_ids', "TEXT NOT NULL DEFAULT ''"],
    ['full_time', "TEXT NOT NULL DEFAULT ''"], // this hall's full / half day timings
    ['half_time', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [col, def] of newHCols) {
    if (!hCols.has(col)) {
      db.exec(`ALTER TABLE halls ADD COLUMN ${col} ${def}`);
    }
  }

  // Each room's own check-in / check-out time
  const roomCols = new Set(db.prepare('PRAGMA table_info(rooms)').all().map(c => c.name));
  for (const col of ['checkin_time', 'checkout_time'])
    if (!roomCols.has(col)) db.exec(`ALTER TABLE rooms ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);

  // Supplies & Function Rentals schema migration
  const sCols = new Set(db.prepare("PRAGMA table_info(supplies)").all().map(c => c.name));
  const newSCols = [
    ['total_quantity', 'REAL NOT NULL DEFAULT 0'],
    ['rented_quantity', 'REAL NOT NULL DEFAULT 0'],
    ['rent_rate', 'REAL NOT NULL DEFAULT 0'],
    ['photo', "TEXT NOT NULL DEFAULT ''"], // optional picture of the item (large)
    ['thumb', "TEXT NOT NULL DEFAULT ''"], // and its small copy for lists
  ];
  for (const [col, def] of newSCols) {
    if (!sCols.has(col)) {
      db.exec(`ALTER TABLE supplies ADD COLUMN ${col} ${def}`);
    }
  }

  db.exec(`
  CREATE TABLE IF NOT EXISTS supply_rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    rental_group_id TEXT DEFAULT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    event_name TEXT NOT NULL DEFAULT '',
    rent_date TEXT NOT NULL,
    expected_return_date TEXT NOT NULL DEFAULT '',
    return_date TEXT,
    quantity REAL NOT NULL,
    rent_rate REAL NOT NULL DEFAULT 0,
    total_rent REAL NOT NULL DEFAULT 0,
    advance_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    status TEXT NOT NULL DEFAULT 'rented' CHECK (status IN ('rented', 'returned')),
    returned_quantity REAL NOT NULL DEFAULT 0,
    damage_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_supply_rentals_supply ON supply_rentals(supply_id);
  CREATE INDEX IF NOT EXISTS idx_supply_rentals_status ON supply_rentals(status);
  CREATE INDEX IF NOT EXISTS idx_supply_rentals_group ON supply_rentals(rental_group_id);

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    logout_time TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    device_info TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'logged_out', 'timed_out')),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);

  CREATE TABLE IF NOT EXISTS event_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_name TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT 'Wedding',
    event_date TEXT NOT NULL,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    slot TEXT NOT NULL DEFAULT 'full',
    hall_booking_id INTEGER REFERENCES hall_bookings(id) ON DELETE SET NULL,
    room_booking_ids TEXT NOT NULL DEFAULT '[]',
    supply_rental_ids TEXT NOT NULL DEFAULT '[]',
    hall_amount REAL NOT NULL DEFAULT 0,
    rooms_amount REAL NOT NULL DEFAULT 0,
    supplies_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    advance_paid REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_event_packages_date ON event_packages(event_date);
  `);

  // Add package_id to child tables
  const hbColsCheck = new Set(db.prepare("PRAGMA table_info(hall_bookings)").all().map(c => c.name));
  if (!hbColsCheck.has('package_id')) {
    db.exec('ALTER TABLE hall_bookings ADD COLUMN package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL');
  }
  const rbColsCheck = new Set(db.prepare("PRAGMA table_info(room_bookings)").all().map(c => c.name));
  if (!rbColsCheck.has('package_id')) {
    db.exec('ALTER TABLE room_bookings ADD COLUMN package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL');
  }
  const srColsCheck = new Set(db.prepare("PRAGMA table_info(supply_rentals)").all().map(c => c.name));
  if (!srColsCheck.has('package_id')) {
    db.exec('ALTER TABLE supply_rentals ADD COLUMN package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL');
  }
  if (!srColsCheck.has('rental_group_id')) {
    db.exec('ALTER TABLE supply_rentals ADD COLUMN rental_group_id TEXT DEFAULT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_supply_rentals_group ON supply_rentals(rental_group_id)');
  }
  if (!srColsCheck.has('advance_amount')) {
    db.exec('ALTER TABLE supply_rentals ADD COLUMN advance_amount REAL NOT NULL DEFAULT 0');
  }
  // Share of an order's discount (e.g. the full set price) on this line; total_rent is after it
  if (!srColsCheck.has('discount')) {
    db.exec('ALTER TABLE supply_rentals ADD COLUMN discount REAL NOT NULL DEFAULT 0');
  }
  if (!srColsCheck.has('payment_method')) {
    db.exec("ALTER TABLE supply_rentals ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Cash'");
  }

  // Payments for a Sannai Melam booking (kind 'band'). An older database only allowed room and hall,
  // so its payments table is rebuilt once with the wider rule (same rows, same ids).
  const paySql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'").get()?.sql || '';
  if (paySql.includes("CHECK (kind IN ('room','hall'))")) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec('BEGIN');
      db.exec(`CREATE TABLE payments_new (${paySql.slice(paySql.indexOf('(') + 1, paySql.lastIndexOf(')'))
        .replace("CHECK (kind IN ('room','hall'))", "CHECK (kind IN ('room','hall','band'))")})`);
      db.exec('INSERT INTO payments_new SELECT * FROM payments');
      db.exec('DROP TABLE payments');
      db.exec('ALTER TABLE payments_new RENAME TO payments');
      db.exec('CREATE INDEX IF NOT EXISTS idx_payments ON payments(kind, booking_id)');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  // Decorations: a price list per area (stage, entrance...) and a costed plan per event
  db.exec(`
  CREATE TABLE IF NOT EXISTS decor_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pcs',
    price REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS decor_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT NOT NULL DEFAULT '',
    hall_booking_id INTEGER REFERENCES hall_bookings(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    event_name TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_decor_items_area ON decor_items(area);
  CREATE INDEX IF NOT EXISTS idx_decor_plans_date ON decor_plans(event_date);

  -- Sannai Melam: a performance booked for an event (no stock)
  CREATE TABLE IF NOT EXISTS band_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT NOT NULL DEFAULT '',
    hall_booking_id INTEGER REFERENCES hall_bookings(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL,
    timing TEXT NOT NULL DEFAULT '',
    team TEXT NOT NULL DEFAULT '',
    players INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'done', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_band_bookings_date ON band_bookings(event_date);
  `);
  // The sannai team's phone, for sending them the programme timing on WhatsApp
  const bandCols = new Set(db.prepare('PRAGMA table_info(band_bookings)').all().map(c => c.name));
  if (!bandCols.has('team_phone')) db.exec("ALTER TABLE band_bookings ADD COLUMN team_phone TEXT NOT NULL DEFAULT ''");
  // A Sannai Melam booked with a hall is on that combo's one bill (paid there)
  if (!bandCols.has('package_id'))
    db.exec('ALTER TABLE band_bookings ADD COLUMN package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL');
  // A photo of each decoration design (e.g. "Pink stage"): a small one for lists and a larger
  // one to show the customer, both kept in the database as image data
  const decorItemCols = new Set(db.prepare('PRAGMA table_info(decor_items)').all().map(c => c.name));
  for (const col of ['photo', 'thumb'])
    if (!decorItemCols.has(col)) db.exec(`ALTER TABLE decor_items ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  // A decoration booked with a hall (and rooms or supplies) is part of that combo's one bill
  if (!new Set(db.prepare('PRAGMA table_info(decor_plans)').all().map(c => c.name)).has('package_id'))
    db.exec('ALTER TABLE decor_plans ADD COLUMN package_id INTEGER REFERENCES event_packages(id) ON DELETE SET NULL');

  // Bill number shown to customers (see lib/billno.js); filled in for older rows by applyDefaults
  for (const table of ['room_bookings', 'hall_bookings', 'supply_rentals', 'event_packages']) {
    const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    if (!cols.has('bill_no')) db.exec(`ALTER TABLE ${table} ADD COLUMN bill_no TEXT NOT NULL DEFAULT ''`);
  }

  // Lookups used on every list: what belongs to a combined bill (its extras are added up per
  // row), bookings in a date range, and the day's collections. Without these each would scan
  // the whole table, which slows down as bookings pile up over the years.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hall_bookings_pkg ON hall_bookings(package_id);
    CREATE INDEX IF NOT EXISTS idx_hall_bookings_date ON hall_bookings(event_date);
    CREATE INDEX IF NOT EXISTS idx_room_bookings_pkg ON room_bookings(package_id);
    CREATE INDEX IF NOT EXISTS idx_room_bookings_out ON room_bookings(check_out);
    CREATE INDEX IF NOT EXISTS idx_supply_rentals_pkg ON supply_rentals(package_id);
    CREATE INDEX IF NOT EXISTS idx_decor_plans_pkg ON decor_plans(package_id);
    CREATE INDEX IF NOT EXISTS idx_decor_plans_hall ON decor_plans(hall_booking_id);
    CREATE INDEX IF NOT EXISTS idx_band_bookings_pkg ON band_bookings(package_id);
    CREATE INDEX IF NOT EXISTS idx_band_bookings_hall ON band_bookings(hall_booking_id);
    CREATE INDEX IF NOT EXISTS idx_payments_paid_on ON payments(paid_on);
  `);

  // One-time backfill, only when the rental columns were just added to an old database
  if (!sCols.has('total_quantity')) {
    db.exec("UPDATE supplies SET total_quantity = quantity WHERE total_quantity = 0 AND quantity > 0");
    db.exec("UPDATE supplies SET rent_rate = unit_cost WHERE rent_rate = 0 AND unit_cost > 0");
  }
}

/**
 * Adds settings rows that don't exist yet. Never overwrites a value someone saved.
 * (Supplies, halls and rates are only created on first run by seed(), so edits and
 * deletions made in the app stay as they are across restarts.)
 */
export function applyDefaults() {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(k, String(v));
  }
  db.prepare(`DELETE FROM settings WHERE key IN (${RETIRED_SETTINGS.map(() => '?').join(', ')})`).run(...RETIRED_SETTINGS);
  backfillBillNos(); // older bookings get a bill number once the real data has loaded
  attachLinkedExtras(); // Sannai Melam / decoration booked for an upcoming hall go on its bill
  syncAllComboPaid(); // combos count payments taken on their hall or rooms too
  fillTimings();
  repairSupplyTotals();
  seedDecorItems();
}

/**
 * Some older items have their total stock saved as 0 while units are in stock or out on rent.
 * Editing such an item would then set its available stock to 0, so the total is put back as
 * available + rented (only those rows are touched).
 */
function repairSupplyTotals() {
  run(`UPDATE supplies SET total_quantity = quantity + COALESCE(rented_quantity, 0)
       WHERE COALESCE(total_quantity, 0) = 0 AND (quantity > 0 OR COALESCE(rented_quantity, 0) > 0)`);
}

/**
 * Timings now belong to each room and hall. Any without one get the value that used to be set
 * once for all in Settings (only empty ones are touched, so nothing saved is overwritten).
 */
function fillTimings() {
  const val = k => get('SELECT value FROM settings WHERE key = ?', k)?.value || DEFAULT_SETTINGS[k];
  run("UPDATE rooms SET checkin_time = ? WHERE checkin_time = ''", val('room_checkin_time'));
  run("UPDATE rooms SET checkout_time = ? WHERE checkout_time = ''", val('room_checkout_time'));
  run("UPDATE halls SET full_time = ? WHERE full_time = ''", val('hall_full_time'));
  run("UPDATE halls SET half_time = ? WHERE half_time = ''", val('hall_half_time'));
}

/**
 * Starter decoration items for each area, added once (prices left at 0 for the owner to set).
 * A marker setting stops them coming back after someone deletes them.
 */
const DECOR_STARTER = [
  ['Stage', 'Stage type 1'], ['Stage', 'Stage type 2'], ['Stage', 'Stage type 3'],
  ['Entrance', 'Entrance type 1'], ['Entrance', 'Entrance type 2'],
  ['Walkway', 'Walkway type 1'], ['Walkway', 'Walkway type 2'],
  ['Photo booths', 'Photo booth type 1'], ['Photo booths', 'Photo booth type 2'],
  ['Main outdoor staircase', 'Staircase type 1'],
];
function seedDecorItems() {
  // No transaction of its own: applyDefaults also runs inside the restore transaction
  if (get("SELECT 1 FROM settings WHERE key = '_decor_seeded'")) return;
  if (!get('SELECT 1 FROM decor_items LIMIT 1'))
    for (const [area, name] of DECOR_STARTER) run('INSERT INTO decor_items (area, name) VALUES (?, ?)', area, name);
  run("INSERT INTO settings (key, value) VALUES ('_decor_seeded', '1')");
}

export const DEFAULT_GENERATORS = [
  { name: '120 kVA', rate: 1500 },
  { name: '30 kVA', rate: 450 },
];

export const CATERING_ITEMS = [
  // Page 1
  ['Double gas stove (డబుల్ గ్యాస్ స్టవ్)', 'Stoves & Fuel', 'pcs', 4, 1, 250],
  ['Single gas stove (సింగిల్ గ్యాస్ స్టవ్)', 'Stoves & Fuel', 'pcs', 6, 1, 150],
  ['Pulao vessels (పులావ్ డేక్షాలు)', 'Cooking Vessels', 'pcs', 8, 2, 200],
  ['Vessels, 150 kg (డేక్షాలు 150 కేజీలు)', 'Cooking Vessels', 'pcs', 4, 1, 400],
  ['Vessels, 100 kg (డేక్షాలు 100 కేజీలు)', 'Cooking Vessels', 'pcs', 6, 2, 350],
  ['Vessels, 80 kg (డేక్షాలు 80 కేజీలు)', 'Cooking Vessels', 'pcs', 6, 2, 300],
  ['Vessels, 70 kg (డేక్షాలు 70 కేజీలు)', 'Cooking Vessels', 'pcs', 6, 2, 280],
  ['Vessels, 50 kg (డేక్షాలు 50 కేజీలు)', 'Cooking Vessels', 'pcs', 8, 2, 250],
  ['Vessels, 20 kg (డేక్షాలు 20 కేజీలు)', 'Cooking Vessels', 'pcs', 10, 2, 180],
  ['Vessels, 10 kg (డేక్షాలు 10 కేజీలు)', 'Cooking Vessels', 'pcs', 10, 2, 120],
  ['Vessels, 5 kg (డేక్షాలు 5 కేజీలు)', 'Cooking Vessels', 'pcs', 10, 2, 80],
  ['Steel dishes (స్టీల్ డిష్లు)', 'Serving & Tableware', 'pcs', 40, 5, 50],
  ['Brass dishes (ఇత్తడి డిష్లు)', 'Serving & Tableware', 'pcs', 25, 5, 80],
  ['Dosa stove (దోస పొయ్యి)', 'Stoves & Fuel', 'pcs', 4, 1, 300],
  ['Idli cloths (ఇడ్లీ గుడ్డలు)', 'Kitchen Utensils & Accessories', 'pcs', 50, 10, 20],
  ['Cotton (కాటన్)', 'Kitchen Utensils & Accessories', 'rolls', 10, 2, 50],
  ['Rice pots (రైస్ తపేలాలు)', 'Cooking Vessels', 'pcs', 12, 3, 150],
  ['Kadai (కళాయి)', 'Cooking Vessels', 'pcs', 10, 2, 150],
  ['Oil strainer (ఆయిల్ పట్టం)', 'Kitchen Utensils & Accessories', 'pcs', 10, 2, 30],
  ['Chairs (కుర్చీలు)', 'Furniture & Tents', 'pcs', 500, 50, 15],
  ['Dosa spatulas (అట్ల గరిటెలు)', 'Kitchen Utensils & Accessories', 'pcs', 20, 5, 25],
  ['Buckets (బకెట్లు)', 'Containers & Water', 'pcs', 30, 5, 30],
  ['Basins (బేసిన్లు)', 'Containers & Water', 'pcs', 25, 5, 40],
  ['Hand ladles (హస్తాలు)', 'Kitchen Utensils & Accessories', 'pcs', 20, 5, 25],
  ['Ladles (గరిటెలు)', 'Kitchen Utensils & Accessories', 'pcs', 30, 5, 20],
  ['Water drums (వాటర్ డ్రమ్ములు)', 'Containers & Water', 'pcs', 20, 4, 80],
  ['Tea kits (టీ కిట్లు)', 'Serving & Tableware', 'sets', 10, 2, 120],
  ['Handled jugs (కాడ జగ్గులు)', 'Containers & Water', 'pcs', 40, 10, 25],

  // Page 2
  ['Water jugs (వాటర్ జగ్గులు)', 'Containers & Water', 'pcs', 50, 10, 20],
  ['Glasses (గ్లాసులు)', 'Serving & Tableware', 'pcs', 300, 50, 5],
  ['Basket (గంప)', 'Containers & Water', 'pcs', 15, 3, 30],
  ['Plates (buffet) (ప్లేట్స్ (బఫే))', 'Serving & Tableware', 'pcs', 300, 50, 10],
  ['Seating (సిటింగ్)', 'Furniture & Tents', 'sets', 12, 2, 250],
  ['Shamiana (tent) (షామియానా)', 'Furniture & Tents', 'sets', 6, 1, 1500],
  ['Side walls (సైడ్ వాల్స్)', 'Furniture & Tents', 'pcs', 20, 5, 100],
  ['Idli/egg box (ఇడ్లీ అండా బాక్సు)', 'Cooking Vessels', 'pcs', 8, 2, 150],
  ['Biryani iron sheet (బిర్యాని ఇనప రేకు)', 'Kitchen Utensils & Accessories', 'pcs', 10, 2, 100],
  ['Chaat plates (చాట్ రేకులు)', 'Serving & Tableware', 'pcs', 150, 20, 10],
  ['Tandoori stove (తందూరి పొయ్యి)', 'Stoves & Fuel', 'pcs', 3, 1, 450],
  ['White panche (వైట్ పంచి)', 'Kitchen Utensils & Accessories', 'pcs', 25, 5, 30],
  ['Hot boxes (5, 10, 15, 20, 25, 30, 50 L) (హాటు బాక్సులు (5, 10, 15, 20, 25, 30, 50 లీ))', 'Containers & Water', 'sets', 20, 4, 150],
  ['Porcelain white plates (పింగాని వైట్ ప్లేట్లు)', 'Serving & Tableware', 'pcs', 250, 30, 15],
  ['Dinner buffet stands (డిన్నర్ బఫే స్టాండ్లు)', 'Furniture & Tents', 'sets', 20, 4, 150],
  ['Steel tables (స్టీలు టేబుల్స్)', 'Furniture & Tents', 'pcs', 30, 5, 100],
  ['Water strainer (వాటర్ జాలి)', 'Kitchen Utensils & Accessories', 'pcs', 12, 2, 25],
  ['Dry firewood (ఎండి కర్రలు)', 'Stoves & Fuel', 'bundles', 30, 5, 100],
  ['Kerosene (కిరసనాయిల్)', 'Stoves & Fuel', 'litres', 20, 5, 80],
  ['Cement blocks (సిమెంట్ దిమ్మలు)', 'Stoves & Fuel', 'pcs', 40, 10, 20],
  ['Ring stoves (రింగ్ పొయ్యిలు)', 'Stoves & Fuel', 'pcs', 10, 2, 150],
  ['Wooden stools (కర్ర పీటలు)', 'Furniture & Tents', 'pcs', 30, 5, 30],
  ['Puri rolling sticks (పూరి కర్రలు)', 'Kitchen Utensils & Accessories', 'pcs', 15, 3, 20],
  ['Cutting boards (కత్తి పీటలు)', 'Kitchen Utensils & Accessories', 'pcs', 12, 2, 35],
  ['Tarpaulin (తార్పాన్)', 'Furniture & Tents', 'pcs', 12, 2, 120],
  ['Side walls (Waterproof) (సైడ్ వాల్స్)', 'Furniture & Tents', 'pcs', 15, 3, 120],
  ['Dinner round table (డిన్నర్ రౌండ్ టేబుల్)', 'Furniture & Tents', 'pcs', 40, 5, 100],
  ['Mineral water cans (for cooking) (మినరల్ వాటర్ క్యాన్స్ (వంటకి))', 'Containers & Water', 'cans', 50, 10, 40],
];

export const SUPPLIES = CATERING_ITEMS;

const USERS = [
  ['admin', 'Penta Jayashankararao', 'admin123', 'admin'],
  ['kedarnath', 'Penta Kedarnath', 'admin123', 'admin'],
  ['staff1', 'Front Desk', 'staff123', 'staff'],
  ['staff2', 'Hall Supervisor', 'staff123', 'staff'],
];

const ROOMS = [
  ['S1', 'Royal Suite', 'Suite', 4500, 4, 'King bed, living area, AC, Smart TV, Wi-Fi, mini fridge'],
  ...['101', '102', '103', '104'].map(n => [n, `Deluxe AC ${n}`, 'AC Room', 2000, 2, 'Double bed, AC, TV, Wi-Fi, hot water']),
];

const HALLS = [
  ['Big Banquet Hall', 500, 75000, 42000, 'Big banquet hall for weddings, receptions and large gatherings'],
  ['Small Banquet Hall', 200, 40000, 25000, 'Small banquet hall for functions, birthdays, engagements and meetings'],
  ['Both Halls Combo', 700, 90000, 47000, 'Both Big & Small banquet halls combo package'],
];

export const DEFAULT_SETTINGS = {
  property_name: 'SMC Function Hall (A/C)',
  property_short: 'SMC Function Hall',
  property_tagline: 'Kalyana Mandapam & Function Hall',
  banner_name: 'Penta Jayashankararao',
  address: 'Next to BOI (Bank of India), K.T. Road, Palasa – Kasibugga',
  phone: '94411 17278 / 94410 89616',
  facilities: 'A/C halls, parking, rooms and lift available',
  power_rate: '15',
  gen_120kva_rate: '1500',
  gen_30kva_rate: '450',
  generators: JSON.stringify(DEFAULT_GENERATORS),
  event_types: 'Wedding, Engagement, Half Saree, Birthday, Meetings, Reception, Corporate, Other',
  supply_categories: 'Cooking Vessels, Kitchen Utensils & Accessories, Serving & Tableware, Stoves & Fuel, Furniture & Tents, Containers & Water',
  whatsapp_enabled: '1',
  room_checkin_time: '11:00 AM',
  room_checkout_time: '12:00 PM',
  hall_full_time: '7:00 AM to 3:00 AM (next day)',
  hall_half_time: '7:00 AM to 3:00 PM',
  decor_areas: 'Stage, Entrance, Walkway, Photo booths, Main outdoor staircase',
  supplies_full_set_price: '8000', // price when every supply item is taken together
  sannai_parties: '[]', // Sannai Melam teams the hall works with: [{ name, phone, players, price }]
};

// Settings of the removed WhatsApp API option (Meta, Twilio, webhook). Messages now always
// open in WhatsApp itself with the text filled in, so these stored keys are cleared.
const RETIRED_SETTINGS = [
  'whatsapp_provider', 'whatsapp_api_token', 'whatsapp_phone_number_id', 'whatsapp_twilio_sid',
  'whatsapp_twilio_token', 'whatsapp_twilio_from', 'whatsapp_webhook_url',
];

/** First run only: the 3 logins, the property's rooms & halls, and a starter supply list. */
export function seed() {
  if (get('SELECT COUNT(*) AS n FROM users').n) return;
  tx(() => {
    for (const [username, name, password, role] of USERS)
      run('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)',
        username, name, bcrypt.hashSync(password, 10), role);
    for (const room of ROOMS)
      run('INSERT INTO rooms (number, name, type, rate, capacity, amenities) VALUES (?, ?, ?, ?, ?, ?)', ...room);
    const hallIds = HALLS.map(hall =>
      run('INSERT INTO halls (name, capacity, rate_full, rate_half, description) VALUES (?, ?, ?, ?, ?)', ...hall).id);
    // "Both Halls Combo" books the big and small halls together
    run('UPDATE halls SET is_combo = 1, included_hall_ids = ? WHERE id = ?',
      JSON.stringify([hallIds[0], hallIds[1]]), hallIds[2]);
    for (const [name, category, unit, qty, min, rate] of SUPPLIES) {
      const existing = get('SELECT id FROM supplies WHERE name = ?', name);
      let supplyId = existing?.id;
      if (!supplyId) {
        const res = run('INSERT OR IGNORE INTO supplies (name, category, unit, quantity, total_quantity, rented_quantity, min_quantity, rent_rate, unit_cost) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
          name, category, unit, qty, qty, min, rate, rate);
        supplyId = res.id;
      }
      if (supplyId) {
        const hasMove = get('SELECT id FROM stock_moves WHERE supply_id = ? LIMIT 1', supplyId);
        if (!hasMove) {
          run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note) VALUES (?, 'in', ?, ?, 'Initial inventory added')", supplyId, qty, qty);
        }
      }
    }
  });
}
