'use strict';

const config = require('../config');
const { HttpError } = require('../utils/http-error');

function apiNotFound(req, res) {
  res.status(404).json({
    error: `API route ${req.method} ${req.originalUrl} was not found.`,
  });
}

function notFound(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let status = Number(err.status || err.statusCode) || 500;
  let message = err.message;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body must contain valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large.';
  } else if (!(err instanceof HttpError) && status >= 500) {
    message = 'An unexpected server error occurred.';
    if (!config.isTest) {
      console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}\n${err.stack || err}`);
    }
  }

  const payload = { error: message };
  if (err.details) {
    payload.details = err.details;
  }

  res.status(status).json(payload);
}

module.exports = { apiNotFound, notFound, errorHandler };
