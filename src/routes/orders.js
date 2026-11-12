'use strict';

const crypto = require('node:crypto');
const express = require('express');

const { VALID_TRANSITIONS } = require('../constants');
const { db, withTransaction } = require('../db');
const { HttpError } = require('../utils/http-error');
const { parseId, parseOrderQuery, validateOrderPayload, validateStatus } = require('../utils/validation');

const router = express.Router();

const getOrderItems = db.prepare(`
  SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, p.name AS product_name, p.icon
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = ?
  ORDER BY oi.id ASC
`);

function getOrderById(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  return { ...order, items: getOrderItems.all(order.id) };
}

function generateOrderRef() {
  const exists = db.prepare('SELECT 1 FROM orders WHERE order_ref = ?');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const ref = `ORD-${crypto.randomInt(100000, 1000000)}`;
    if (!exists.get(ref)) return ref;
  }
  throw new Error('Unable to generate a unique order reference.');
}

// GET /api/orders — order history with optional status filter and pagination.
router.get('/', (req, res) => {
  const { status, limit, offset } = parseOrderQuery(req.query);

  const whereSql = status ? 'WHERE status = ?' : '';
  const filterParams = status ? [status] : [];

  const total = db.prepare(`SELECT COUNT(*) AS count FROM orders ${whereSql}`).get(...filterParams).count;
  const orders = db
    .prepare(`SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...filterParams, limit, offset)
    .map((order) => ({ ...order, items: getOrderItems.all(order.id) }));

  res.setHeader('X-Total-Count', String(total));
  res.json(orders);
});

// GET /api/orders/:id — single order with line items.
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id, 'Order');
  const order = getOrderById(id);

  if (!order) {
    throw new HttpError(404, 'Order not found.');
  }

  res.json(order);
});

// POST /api/orders — create an order, validated and priced server-side.
router.post('/', (req, res) => {
  const input = validateOrderPayload(req.body);

  const order = withTransaction(() => {
    const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
    const decrementStock = db.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
    );
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_ref, customer_name, customer_email, shipping_address, total_amount, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price)
      VALUES (?, ?, ?, ?)
    `);

    let computedTotal = 0;
    const lines = [];

    // Canonical prices and stock always come from the database — never the client.
    for (const item of input.items) {
      const product = getProduct.get(item.productId);
      if (!product) {
        throw new HttpError(404, `Product ${item.productId} was not found.`);
      }

      if (item.quantity > product.stock) {
        throw new HttpError(
          409,
          `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}.`,
        );
      }

      computedTotal += product.price * item.quantity;
      lines.push({ product, quantity: item.quantity });
    }

    computedTotal = Math.round(computedTotal * 100) / 100;
    const orderRef = generateOrderRef();

    const result = insertOrder.run(
      orderRef,
      input.customerName,
      input.customerEmail,
      input.shippingAddress,
      computedTotal,
    );
    const orderId = Number(result.lastInsertRowid);

    const items = lines.map(({ product, quantity }) => {
      insertItem.run(orderId, product.id, quantity, product.price);

      const updated = decrementStock.run(quantity, product.id, quantity);
      if (updated.changes !== 1) {
        throw new HttpError(409, `Stock for "${product.name}" changed. Please retry the order.`);
      }

      return {
        product_id: product.id,
        name: product.name,
        icon: product.icon,
        quantity,
        unit_price: product.price,
        line_total: Math.round(product.price * quantity * 100) / 100,
        remaining_stock: product.stock - quantity,
      };
    });

    return { ...getOrderById(orderId), items };
  });

  res.status(201).json({
    message: 'Order created successfully.',
    order,
  });
});

// PATCH /api/orders/:id/status — enforce the order state machine.
router.patch('/:id/status', (req, res) => {
  const id = parseId(req.params.id, 'Order');
  const nextStatus = validateStatus(req.body?.status);

  const result = withTransaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) {
      throw new HttpError(404, 'Order not found.');
    }

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(nextStatus)) {
      const allowedText = allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)';
      throw new HttpError(
        409,
        `Invalid status transition from "${order.status}" to "${nextStatus}". Allowed: ${allowedText}.`,
      );
    }

    let stockRestored = 0;
    if (nextStatus === 'Cancelled') {
      const items = db
        .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
        .all(order.id);
      const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');

      for (const item of items) {
        restoreStock.run(item.quantity, item.product_id);
        stockRestored += item.quantity;
      }
    }

    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      nextStatus,
      order.id,
    );

    return { order, stockRestored };
  });

  res.json({
    message: `Order ${result.order.order_ref} transitioned from ${result.order.status} to ${nextStatus}.`,
    order_id: result.order.id,
    order_ref: result.order.order_ref,
    previous_status: result.order.status,
    new_status: nextStatus,
    stock_restored: result.stockRestored,
  });
});

module.exports = router;
