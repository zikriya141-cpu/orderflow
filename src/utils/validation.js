'use strict';

const { MAX_ITEM_QUANTITY, MAX_ORDER_ITEMS, ORDER_STATUSES } = require('../constants');
const { HttpError } = require('./http-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateOrderPayload(body) {
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const details = [];
  const addError = (field, message) => details.push({ field, message });

  const customerName = asTrimmedString(body.customer_name);
  if (customerName.length < 2 || customerName.length > 100) {
    addError('customer_name', 'Customer name must be between 2 and 100 characters.');
  }

  const customerEmail = asTrimmedString(body.customer_email).toLowerCase();
  if (customerEmail.length > 254 || !EMAIL_PATTERN.test(customerEmail)) {
    addError('customer_email', 'A valid email address is required.');
  }

  const shippingAddress = asTrimmedString(body.shipping_address);
  if (shippingAddress.length < 5 || shippingAddress.length > 300) {
    addError('shipping_address', 'Shipping address must be between 5 and 300 characters.');
  }

  // Aggregate duplicate product lines so stock is validated against the true total.
  const quantitiesByProduct = new Map();
  const rawItems = body.items;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    addError('items', 'Order must contain at least one item.');
  } else {
    if (rawItems.length > MAX_ORDER_ITEMS) {
      addError('items', `Order cannot contain more than ${MAX_ORDER_ITEMS} line items.`);
    }

    rawItems.forEach((item, index) => {
      if (!isPlainObject(item)) {
        addError(`items[${index}]`, 'Each order item must be an object.');
        return;
      }

      const productId = Number(item.product_id);
      if (!Number.isInteger(productId) || productId <= 0) {
        addError(`items[${index}].product_id`, 'Product id must be a positive integer.');
        return;
      }

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
        addError(
          `items[${index}].quantity`,
          `Quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}.`,
        );
        return;
      }

      quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) || 0) + quantity);
    });

    for (const [productId, quantity] of quantitiesByProduct) {
      if (quantity > MAX_ITEM_QUANTITY) {
        addError(`items.product_${productId}`, `Total quantity per product cannot exceed ${MAX_ITEM_QUANTITY}.`);
      }
    }
  }

  if (details.length > 0) {
    throw new HttpError(400, details[0].message, details);
  }

  return {
    customerName,
    customerEmail,
    shippingAddress,
    items: [...quantitiesByProduct].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

function validateStatus(status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new HttpError(400, `Status must be one of: ${ORDER_STATUSES.join(', ')}.`);
  }
  return status;
}

function parseId(value, resource = 'Resource') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `${resource} id must be a positive integer.`);
  }
  return id;
}

function parseOrderQuery(query) {
  const status = query.status;
  if (status !== undefined) {
    validateStatus(status);
  }

  let limit = 100;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new HttpError(400, 'limit must be an integer between 1 and 200.');
    }
  }

  let offset = 0;
  if (query.offset !== undefined) {
    offset = Number(query.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new HttpError(400, 'offset must be a non-negative integer.');
    }
  }

  return { status, limit, offset };
}

module.exports = {
  validateOrderPayload,
  validateStatus,
  parseId,
  parseOrderQuery,
};
