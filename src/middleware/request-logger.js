'use strict';

/**
 * Compact request logger. Enabled outside the test environment.
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const timestamp = new Date().toISOString();
    console.log(
      `[http] ${timestamp} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
    );
  });

  next();
}

module.exports = { requestLogger };
