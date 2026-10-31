import bcrypt from 'bcryptjs';
import { db, get, run, tx } from './db.js';

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
    description TEXT NOT NULL DEFAULT ''
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
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
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
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('room','hall')),
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
  CREATE INDEX IF NOT EXISTS idx_room_bookings ON room_bookings(room_id, check_in);
  CREATE INDEX IF NOT EXISTS idx_hall_bookings ON hall_bookings(hall_id, event_date);
  CREATE INDEX IF NOT EXISTS idx_payments ON payments(kind, booking_id);
  CREATE INDEX IF NOT EXISTS idx_stock_moves ON stock_moves(supply_id);
  `);
}

const USERS = [
  ['admin', 'Administrator', 'admin123', 'admin'],
  ['staff1', 'Front Desk', 'staff123', 'staff'],
  ['staff2', 'Hall Supervisor', 'staff123', 'staff'],
];

const ROOMS = [
  ['S1', 'Royal Suite', 'Suite', 4500, 4, 'King bed, living area, AC, Smart TV, Wi-Fi, mini fridge'],
  ...['101', '102', '103', '104'].map(n => [n, `Deluxe AC ${n}`, 'AC Room', 2000, 2, 'Double bed, AC, TV, Wi-Fi, hot water']),
];

const HALLS = [
  ['Grand Banquet Hall', 500, 60000, 35000, 'Big hall for weddings, receptions and large functions'],
  ['Mini Banquet Hall', 150, 25000, 15000, 'Small hall for birthdays, engagements and meetings'],
];

const SUPPLIES = [
  ['Bath Towels', 'Housekeeping', 'pcs', 40, 15, 250],
  ['Bed Sheets', 'Housekeeping', 'pcs', 30, 12, 450],
  ['Pillow Covers', 'Housekeeping', 'pcs', 40, 15, 80],
  ['Toilet Soap', 'Toiletries', 'pcs', 100, 30, 12],
  ['Shampoo Sachets', 'Toiletries', 'pcs', 150, 50, 3],
  ['Toilet Paper Rolls', 'Toiletries', 'rolls', 60, 20, 25],
  ['Drinking Water (1L)', 'Beverages', 'bottles', 120, 48, 20],
  ['Banquet Chairs', 'Banquet', 'pcs', 500, 450, 900],
  ['Round Tables', 'Banquet', 'pcs', 50, 40, 3500],
  ['Chair Covers', 'Banquet', 'pcs', 400, 300, 60],
  ['Table Cloths', 'Banquet', 'pcs', 60, 45, 220],
  ['Room Freshener', 'Cleaning', 'cans', 10, 4, 180],
  ['Floor Cleaner', 'Cleaning', 'litres', 15, 5, 150],
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
    for (const hall of HALLS)
      run('INSERT INTO halls (name, capacity, rate_full, rate_half, description) VALUES (?, ?, ?, ?, ?)', ...hall);
    for (const [name, category, unit, qty, min, cost] of SUPPLIES) {
      const { id } = run('INSERT INTO supplies (name, category, unit, quantity, min_quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        name, category, unit, qty, min, cost);
      run("INSERT INTO stock_moves (supply_id, type, quantity, balance, note) VALUES (?, 'in', ?, ?, 'Opening stock')", id, qty, qty);
    }
  });
}
