'use strict';

const express = require('express');

const { db } = require('../db');
const { HttpError } = require('../utils/http-error');
const { parseId } = require('../utils/validation');

const router = express.Router();

// GET /api/products — full catalog with live stock.
router.get('/', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
  res.json(products);
});

// GET /api/products/:id — single product.
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id, 'Product');
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  if (!product) {
    throw new HttpError(404, 'Product not found.');
  }

  res.json(product);
});

module.exports = router;
