'use strict';

const express = require('express');

const { LOW_STOCK_THRESHOLD } = require('../constants');
const { db } = require('../db');

const router = express.Router();

// GET /api/stats — dashboard aggregates for the admin console.
router.get('/', (req, res) => {
  const orders = db
    .prepare(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_orders,
        COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_orders,
        COALESCE(SUM(CASE WHEN status = 'Fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled_orders,
        COALESCE(SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
        COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total_amount ELSE 0 END), 0) AS total_revenue
      FROM orders
    `)
    .get();

  const products = db
    .prepare(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(CASE WHEN stock > 0 AND stock <= ? THEN 1 ELSE 0 END), 0) AS low_stock_products,
        COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_products
      FROM products
    `)
    .get(LOW_STOCK_THRESHOLD);

  res.json({
    ...orders,
    total_revenue: Math.round(orders.total_revenue * 100) / 100,
    ...products,
  });
});

module.exports = router;
