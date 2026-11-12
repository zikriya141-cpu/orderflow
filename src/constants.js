'use strict';

const ORDER_STATUSES = Object.freeze(['Pending', 'Confirmed', 'Fulfilled', 'Cancelled']);

/**
 * Allowed order lifecycle transitions. Fulfilled and Cancelled are terminal.
 */
const VALID_TRANSITIONS = Object.freeze({
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Fulfilled', 'Cancelled'],
  Fulfilled: [],
  Cancelled: [],
});

const LOW_STOCK_THRESHOLD = 5;
const MAX_ORDER_ITEMS = 50;
const MAX_ITEM_QUANTITY = 999;

module.exports = {
  ORDER_STATUSES,
  VALID_TRANSITIONS,
  LOW_STOCK_THRESHOLD,
  MAX_ORDER_ITEMS,
  MAX_ITEM_QUANTITY,
};
