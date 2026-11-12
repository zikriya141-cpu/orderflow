'use strict';

/**
 * An error that is safe to expose to API clients.
 * Any other error is treated as an internal server error by the error handler.
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, HttpError);
  }
}

module.exports = { HttpError };
