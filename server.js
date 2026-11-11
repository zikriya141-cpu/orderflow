const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect SQLite Database
const dbPath = path.join(__dirname, 'orderflow.db');
const db = new DatabaseSync(dbPath);
console.log('Connected to SQLite database (orderflow.db).');

// Initialize Schema
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    icon TEXT DEFAULT '📦'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT CHECK(status IN ('Pending', 'Confirmed', 'Fulfilled', 'Cancelled')) DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL
  );
`);

// Valid State Machine Transitions
const VALID_TRANSITIONS = {
  'Pending': ['Confirmed', 'Cancelled'],
  'Confirmed': ['Fulfilled', 'Cancelled'],
  'Fulfilled': [],
  'Cancelled': []
};

// Seed initial products if table is empty
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
if (productCount === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, stock, description, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const initialProducts = [
    ['Apex Pro Mechanical Keyboard', 'Peripherals', 129.00, 15, 'Tactile mechanical switches with per-key RGB backlighting and aircraft-grade aluminum alloy frame.', '⌨️'],
    ['AeroLight Wireless Gaming Mouse', 'Peripherals', 79.00, 8, 'Ultralight 58g ergonomic chassis, 26K DPI optical sensor, and zero-latency wireless receiver.', '🖱️'],
    ['UltraView 27" 4K IPS Monitor', 'Displays', 389.00, 3, 'Calibrated 99% sRGB color gamut with HDR600 certification and 144Hz refresh rate.', '🖥️'],
    ['SonicPulse Studio Headphones', 'Audio', 149.00, 20, 'Planar magnetic drivers, memory-foam isolation cushions, and detachable braided audio cable.', '🎧'],
    ['ErgoDesk Electric Standing Frame', 'Furniture', 299.00, 5, 'Dual-motor smooth lifting mechanism with 4 programmable memory presets and anti-collision sensor.', '🪑'],
    ['HyperCharge 100W GaN Station', 'Power', 49.00, 12, 'Compact Gallium Nitride multi-port power adapter with dual USB-C Power Delivery 3.0 ports.', '⚡']
  ];

  for (const item of initialProducts) {
    insertProduct.run(...item);
  }
  console.log('Seeded 6 hardware products.');
}

// 1. GET /api/products
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
});

// 2. GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product: ' + err.message });
  }
});

// 3. POST /api/orders
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_email, shipping_address, items } = req.body;

  if (!customer_name || !customer_email || !shipping_address) {
    return res.status(400).json({ error: 'Customer name, email, and shipping address are required.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart must contain at least one item.' });
  }

  try {
    let computedTotal = 0;
    const validatedItems = [];

    // Step 1: Validate stock & fetch canonical server prices
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(item.product_id));
      if (!product) {
        return res.status(404).json({ error: `Product ID ${item.product_id} not found.` });
      }

      const qty = Number(item.quantity);
      if (qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for ${product.name}.` });
      }

      if (qty > product.stock) {
        return res.status(400).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${qty}.`
        });
      }

      const lineTotal = product.price * qty;
      computedTotal += lineTotal;

      validatedItems.push({
        product_id: product.id,
        name: product.name,
        quantity: qty,
        unit_price: product.price,
        remaining_stock: product.stock - qty
      });
    }

    // Step 2: Insert Order
    const orderRef = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_ref, customer_name, customer_email, shipping_address, total_amount, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `);
    const orderResult = insertOrder.run(orderRef, customer_name.trim(), customer_email.trim(), shipping_address.trim(), computedTotal);
    const orderId = Number(orderResult.lastInsertRowid);

    // Step 3: Insert Order Items & Deduct Stock
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price)
      VALUES (?, ?, ?, ?)
    `);
    const updateStock = db.prepare(`
      UPDATE products SET stock = stock - ? WHERE id = ?
    `);

    for (const v of validatedItems) {
      insertItem.run(orderId, v.product_id, v.quantity, v.unit_price);
      updateStock.run(v.quantity, v.product_id);
    }

    res.status(201).json({
      message: 'Order created successfully!',
      order: {
        id: orderId,
        order_ref: orderRef,
        customer_name,
        customer_email,
        total_amount: computedTotal,
        status: 'Pending',
        items: validatedItems
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to process order: ' + err.message });
  }
});

// 4. GET /api/orders (Retrieves all orders with line items)
app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    const getItems = db.prepare(`
      SELECT oi.*, p.name as product_name, p.icon 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `);

    const populatedOrders = orders.map(order => ({
      ...order,
      items: getItems.all(order.id)
    }));

    res.json(populatedOrders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders: ' + err.message });
  }
});

// 5. PATCH /api/orders/:id/status (Admin Lifecycle Management & Stock Restoration)
app.patch('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status: nextStatus } = req.body;

  if (!nextStatus) {
    return res.status(400).json({ error: 'New status is required.' });
  }

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id));
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const currentStatus = order.status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    // State Machine Validation
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from "${currentStatus}" to "${nextStatus}". Allowed next transitions: [${allowed.join(', ') || 'None (Terminal state)'}].`
      });
    }

    // Stretch Challenge: Safely restore inventory if order is Cancelled
    let stockRestoredCount = 0;
    if (nextStatus === 'Cancelled' && currentStatus !== 'Cancelled') {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id);
      const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const item of items) {
        restoreStock.run(item.quantity, item.product_id);
        stockRestoredCount += item.quantity;
      }
    }

    // Update order status
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(nextStatus, order.id);

    res.json({
      message: `Order ${order.order_ref} successfully transitioned to ${nextStatus}.`,
      order_id: order.id,
      order_ref: order.order_ref,
      previous_status: currentStatus,
      new_status: nextStatus,
      stock_restored: stockRestoredCount
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`OrderFlow Server running on http://localhost:${PORT}`);
});