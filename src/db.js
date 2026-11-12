'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    total_amount REAL NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending', 'Confirmed', 'Fulfilled', 'Cancelled')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`);

/**
 * Add columns introduced after the first release of the schema.
 * SQLite cannot add a column with a non-constant DEFAULT, so these are
 * added as nullable columns and backfilled below.
 */
function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumnIfMissing(table, column, definition) {
  if (!tableColumns(table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('products', 'created_at', 'DATETIME');
addColumnIfMissing('orders', 'updated_at', 'DATETIME');

db.exec(`
  UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
  UPDATE orders SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    WHERE updated_at IS NULL;
`);

// Seed the demo catalog once. The database file is created automatically.
const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
if (productCount === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, stock, description, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const initialProducts = [
    ['Apex Pro Mechanical Keyboard', 'Peripherals', 129.0, 15, 'Tactile mechanical switches with per-key RGB backlighting and an aircraft-grade aluminum alloy frame.', '⌨️'],
    ['AeroLight Wireless Gaming Mouse', 'Peripherals', 79.0, 8, 'Ultralight 58 g ergonomic chassis, 26K DPI optical sensor and a zero-latency wireless receiver.', '🖱️'],
    ['UltraView 27" 4K IPS Monitor', 'Displays', 389.0, 3, 'Calibrated 99% sRGB color gamut with HDR600 certification and a 144 Hz refresh rate.', '🖥️'],
    ['SonicPulse Studio Headphones', 'Audio', 149.0, 20, 'Planar magnetic drivers, memory-foam isolation cushions and a detachable braided audio cable.', '🎧'],
    ['ErgoDesk Electric Standing Frame', 'Furniture', 299.0, 5, 'Dual-motor smooth lifting mechanism with four programmable memory presets and an anti-collision sensor.', '🪑'],
    ['HyperCharge 100W GaN Station', 'Power', 49.0, 12, 'Compact Gallium Nitride multi-port power adapter with dual USB-C Power Delivery 3.0 ports.', '⚡'],
  ];

  withTransaction(() => {
    for (const product of initialProducts) {
      insertProduct.run(...product);
    }
  });

  if (!config.isTest) {
    console.log(`[db] Seeded ${initialProducts.length} demo products.`);
  }
}

/**
 * Run a callback inside an immediate SQLite transaction.
 * Rolls back automatically when the callback throws.
 */
function withTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction may already have been closed by SQLite.
    }
    throw err;
  }
}

function checkDatabase() {
  const row = db.prepare('SELECT 1 AS ok').get();
  return row?.ok === 1;
}

function closeDb() {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}

if (!config.isTest) {
  console.log(`[db] Connected to SQLite at ${config.dbPath}`);
}

module.exports = { db, withTransaction, checkDatabase, closeDb };
