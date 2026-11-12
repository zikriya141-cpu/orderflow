'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

// Configure an isolated database before the application is required.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orderflow-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(tempDir, 'orderflow-test.db');

const app = require('../src/app');
const { closeDb } = require('../src/db');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  const requestHeaders = { Accept: 'application/json', ...headers };
  let requestBody = body;

  if (body !== undefined && typeof body !== 'string') {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, headers: response.headers, body: data };
}

async function getProduct(id) {
  const response = await request(`/api/products/${id}`);
  assert.equal(response.status, 200);
  return response.body;
}

function orderPayload(overrides = {}) {
  return {
    customer_name: 'Test Customer',
    customer_email: 'test.customer@example.com',
    shipping_address: '123 Integration Test Avenue',
    items: [{ product_id: 1, quantity: 1 }],
    ...overrides,
  };
}

test('health endpoint reports a healthy service and database', async () => {
  const response = await request('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.service, 'orderflow');
  assert.equal(response.body.database, 'ok');
  assert.match(response.body.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Number.isInteger(response.body.uptime_seconds));
});

test('security headers are applied and Express is not advertised', async () => {
  const response = await request('/api/products');

  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('product catalog is seeded and returns canonical fields', async () => {
  const response = await request('/api/products');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.equal(response.body.length, 6);

  for (const product of response.body) {
    assert.ok(Number.isInteger(product.id));
    assert.equal(typeof product.name, 'string');
    assert.equal(typeof product.category, 'string');
    assert.equal(typeof product.price, 'number');
    assert.ok(Number.isInteger(product.stock));
    assert.equal(typeof product.description, 'string');
  }
});

test('single product lookup validates ids and handles missing products', async () => {
  const found = await request('/api/products/1');
  assert.equal(found.status, 200);
  assert.equal(found.body.id, 1);

  const missing = await request('/api/products/999999');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /not found/i);

  const invalid = await request('/api/products/not-a-number');
  assert.equal(invalid.status, 400);
});

test('unknown API routes return JSON instead of HTML', async () => {
  const response = await request('/api/does-not-exist');

  assert.equal(response.status, 404);
  assert.equal(typeof response.body.error, 'string');
});

test('order validation rejects missing fields, bad emails and empty carts', async () => {
  const missingFields = await request('/api/orders', { method: 'POST', body: {} });
  assert.equal(missingFields.status, 400);
  assert.ok(Array.isArray(missingFields.body.details));

  const badEmail = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ customer_email: 'not-an-email' }),
  });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.body.error, /email/i);

  const emptyCart = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ items: [] }),
  });
  assert.equal(emptyCart.status, 400);

  const invalidQuantity = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ items: [{ product_id: 1, quantity: 0 }] }),
  });
  assert.equal(invalidQuantity.status, 400);
});

test('malformed JSON is rejected with a 400 response', async () => {
  const response = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"broken": ',
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /valid JSON/i);
});

test('orders cannot exceed available stock or reference unknown products', async () => {
  const product = await getProduct(1);

  const oversell = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ items: [{ product_id: 1, quantity: product.stock + 1 }] }),
  });
  assert.equal(oversell.status, 409);
  assert.match(oversell.body.error, /insufficient stock/i);

  const afterOversell = await getProduct(1);
  assert.equal(afterOversell.stock, product.stock, 'rejected orders must not change stock');

  const unknownProduct = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ items: [{ product_id: 999999, quantity: 1 }] }),
  });
  assert.equal(unknownProduct.status, 404);
});

test('server ignores client-supplied prices and cancelling restores stock', async () => {
  const product = await getProduct(2);

  const created = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({
      items: [{ product_id: 2, quantity: 2, client_price: 0.01 }],
      total_amount: 0.02,
    }),
  });

  assert.equal(created.status, 201);
  assert.match(created.body.order.order_ref, /^ORD-\d{6}$/);
  assert.equal(created.body.order.total_amount, Math.round(product.price * 2 * 100) / 100);
  assert.equal(created.body.order.status, 'Pending');
  assert.equal(created.body.order.items[0].unit_price, product.price);

  const afterOrder = await getProduct(2);
  assert.equal(afterOrder.stock, product.stock - 2);

  const cancelled = await request(`/api/orders/${created.body.order.id}/status`, {
    method: 'PATCH',
    body: { status: 'Cancelled' },
  });

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.previous_status, 'Pending');
  assert.equal(cancelled.body.new_status, 'Cancelled');
  assert.equal(cancelled.body.stock_restored, 2);

  const afterCancel = await getProduct(2);
  assert.equal(afterCancel.stock, product.stock);

  const reopen = await request(`/api/orders/${created.body.order.id}/status`, {
    method: 'PATCH',
    body: { status: 'Fulfilled' },
  });
  assert.equal(reopen.status, 409, 'cancelled orders must remain terminal');
});

test('duplicate line items are aggregated into one order line', async () => {
  const product = await getProduct(3);

  const created = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({
      items: [
        { product_id: 3, quantity: 1 },
        { product_id: 3, quantity: 1 },
      ],
    }),
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.order.items.length, 1);
  assert.equal(created.body.order.items[0].quantity, 2);
  assert.equal(created.body.order.total_amount, Math.round(product.price * 2 * 100) / 100);

  await request(`/api/orders/${created.body.order.id}/status`, {
    method: 'PATCH',
    body: { status: 'Cancelled' },
  });

  const restored = await getProduct(3);
  assert.equal(restored.stock, product.stock);
});

test('order lifecycle enforces valid transitions and terminal states', async () => {
  const product = await getProduct(1);

  const created = await request('/api/orders', {
    method: 'POST',
    body: orderPayload({ items: [{ product_id: 1, quantity: 2 }] }),
  });
  assert.equal(created.status, 201);

  const orderId = created.body.order.id;

  const skipStep = await request(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'Fulfilled' },
  });
  assert.equal(skipStep.status, 409);
  assert.match(skipStep.body.error, /invalid status transition/i);

  const confirmed = await request(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'Confirmed' },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.new_status, 'Confirmed');

  const fulfilled = await request(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'Fulfilled' },
  });
  assert.equal(fulfilled.status, 200);
  assert.equal(fulfilled.body.new_status, 'Fulfilled');

  const cancelAfterFulfilment = await request(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'Cancelled' },
  });
  assert.equal(cancelAfterFulfilment.status, 409);

  const productAfter = await getProduct(1);
  assert.equal(productAfter.stock, product.stock - 2, 'fulfilled stock stays reserved');
});

test('status updates reject unknown statuses', async () => {
  const response = await request('/api/orders/1/status', {
    method: 'PATCH',
    body: { status: 'Shipped' },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Status must be one of/);
});

test('order history supports filtering, pagination and totals', async () => {
  const all = await request('/api/orders?limit=200');
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.body));
  assert.equal(Number(all.headers.get('x-total-count')), all.body.length);

  const cancelled = await request('/api/orders?status=Cancelled');
  assert.equal(cancelled.status, 200);
  assert.ok(cancelled.body.length >= 2);
  assert.ok(cancelled.body.every((order) => order.status === 'Cancelled'));

  const limited = await request('/api/orders?limit=1&offset=0');
  assert.equal(limited.status, 200);
  assert.equal(limited.body.length, 1);
  assert.ok(Number(limited.headers.get('x-total-count')) > 1);

  const badStatus = await request('/api/orders?status=Lost');
  assert.equal(badStatus.status, 400);

  const badLimit = await request('/api/orders?limit=5000');
  assert.equal(badLimit.status, 400);
});

test('stats endpoint aggregates orders and revenue consistently', async () => {
  const ordersResponse = await request('/api/orders?limit=200');
  const orders = ordersResponse.body;

  const statsResponse = await request('/api/stats');
  assert.equal(statsResponse.status, 200);

  const stats = statsResponse.body;
  const expectedRevenue = orders
    .filter((order) => order.status !== 'Cancelled')
    .reduce((sum, order) => sum + order.total_amount, 0);

  assert.equal(stats.total_orders, orders.length);
  assert.equal(stats.cancelled_orders, orders.filter((order) => order.status === 'Cancelled').length);
  assert.equal(stats.fulfilled_orders, orders.filter((order) => order.status === 'Fulfilled').length);
  assert.equal(stats.total_products, 6);
  assert.ok(Math.abs(stats.total_revenue - expectedRevenue) < 0.001);
});
