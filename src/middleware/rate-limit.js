'use strict';

/**
 * Small in-memory rate limiter for mutating API requests.
 * Suitable for a single-process demo deployment; use a shared store in production.
 */
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }

    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = hits.get(key);

    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      hits.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.startedAt + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    // Keep the map from growing without bound during long-running sessions.
    if (hits.size > 1000) {
      for (const [ip, entry] of hits) {
        if (now - entry.startedAt >= windowMs) hits.delete(ip);
      }
    }

    return next();
  };
}

module.exports = { rateLimit };
