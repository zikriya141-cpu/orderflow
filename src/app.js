'use strict';

const path = require('node:path');
const express = require('express');

const config = require('./config');
const { checkDatabase } = require('./db');
const { apiNotFound, errorHandler, notFound } = require('./middleware/error-handler');
const { rateLimit } = require('./middleware/rate-limit');
const { requestLogger } = require('./middleware/request-logger');
const { securityHeaders } = require('./middleware/security');
const ordersRouter = require('./routes/orders');
const productsRouter = require('./routes/products');
const statsRouter = require('./routes/stats');

const app = express();

app.disable('x-powered-by');

app.use(securityHeaders);
if (!config.isTest) {
  app.use(requestLogger);
}

// Protect write endpoints from accidental request floods.
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

app.use(express.json({ limit: '100kb' }));

// Liveness / readiness probe.
app.get('/api/health', (req, res) => {
  let database = 'ok';
  try {
    if (!checkDatabase()) database = 'error';
  } catch {
    database = 'error';
  }

  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    service: 'orderflow',
    version: config.version,
    uptime_seconds: Math.round(process.uptime()),
    database,
  });
});

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/stats', statsRouter);

// Unknown API routes always return JSON.
app.use('/api', apiNotFound);

// Serve the single-page storefront for browser navigations.
app.use(express.static(config.publicDir, {
  etag: true,
  maxAge: config.isProduction ? '1h' : 0,
}));

app.use((req, res, next) => {
  if (
    (req.method === 'GET' || req.method === 'HEAD')
    && req.accepts('html')
    && path.extname(req.path) === ''
  ) {
    return res.sendFile(path.join(config.publicDir, 'index.html'));
  }
  return next();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
