# OrderFlow — API Reference

Base URL in local development: `http://127.0.0.1:3000`

All request and response bodies are JSON (`Content-Type: application/json`). Unknown `/api/*` routes return JSON `404` responses rather than the HTML shell.

---

## Conventions

- **Money** is returned as a JSON number in USD, rounded to two decimals.
- **Dates** use SQLite UTC timestamps (`YYYY-MM-DD HH:MM:SS`).
- **Errors** use the same envelope everywhere:

```json
{
  "error": "A human-readable message.",
  "details": [
    { "field": "customer_email", "message": "A valid email address is required." }
  ]
}
```

`details` is present only for payload validation failures.

- **Write rate limit:** 120 `POST`/`PATCH` requests per minute per IP (`429` with `Retry-After`).
- **Body limit:** 100 KB (`413` when exceeded).

---

## Health

### `GET /api/health`

```bash
curl http://127.0.0.1:3000/api/health
```

```json
{
  "status": "ok",
  "service": "orderflow",
  "version": "1.0.0",
  "uptime_seconds": 42,
  "database": "ok"
}
```

Returns `503` with `"status": "degraded"` if the database probe fails.

---

## Products

### `GET /api/products`

Returns the catalog ordered by id.

```json
[
  {
    "id": 1,
    "name": "Apex Pro Mechanical Keyboard",
    "category": "Peripherals",
    "price": 129,
    "stock": 15,
    "description": "Tactile mechanical switches…",
    "icon": "⌨️",
    "created_at": "2026-11-12 09:00:00"
  }
]
```

### `GET /api/products/:id`

```bash
curl http://127.0.0.1:3000/api/products/1
```

| Status | Meaning |
| :--- | :--- |
| `200` | Product found |
| `400` | `id` is not a positive integer |
| `404` | Product does not exist |

---

## Orders

### `GET /api/orders`

Query parameters:

| Parameter | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `status` | string | — | One of `Pending`, `Confirmed`, `Fulfilled`, `Cancelled` |
| `limit` | integer | `100` | `1`–`200` |
| `offset` | integer | `0` | Non-negative |

```bash
curl "http://127.0.0.1:3000/api/orders?status=Pending&limit=20"
```

The response is an array of orders. The `X-Total-Count` header contains the total number of orders matching the filter:

```json
[
  {
    "id": 12,
    "order_ref": "ORD-482910",
    "customer_name": "Test Customer",
    "customer_email": "test.customer@example.com",
    "shipping_address": "123 Integration Test Avenue",
    "total_amount": 258,
    "status": "Pending",
    "created_at": "2026-11-12 09:15:00",
    "updated_at": "2026-11-12 09:15:00",
    "items": [
      {
        "id": 18,
        "product_id": 1,
        "quantity": 2,
        "unit_price": 129,
        "product_name": "Apex Pro Mechanical Keyboard",
        "icon": "⌨️"
      }
    ]
  }
]
```

### `GET /api/orders/:id`

Returns a single order with line items, or `404`.

### `POST /api/orders`

Creates an order. Prices and stock are always read from the database; a client-supplied price or total is ignored.

Request body:

| Field | Type | Rules |
| :--- | :--- | :--- |
| `customer_name` | string | 2–100 characters |
| `customer_email` | string | Valid email, up to 254 characters |
| `shipping_address` | string | 5–300 characters |
| `items` | array | 1–50 line items |
| `items[].product_id` | integer | Existing positive product id |
| `items[].quantity` | integer | 1–999 |

Duplicate `product_id` entries are aggregated before stock validation.

```bash
curl -X POST http://127.0.0.1:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Zikriya Khan",
    "customer_email": "zikriya@example.com",
    "shipping_address": "Street 1, Karachi",
    "items": [{ "product_id": 1, "quantity": 2 }]
  }'
```

`201 Created`:

```json
{
  "message": "Order created successfully.",
  "order": {
    "id": 13,
    "order_ref": "ORD-731204",
    "customer_name": "Zikriya Khan",
    "customer_email": "zikriya@example.com",
    "shipping_address": "Street 1, Karachi",
    "total_amount": 258,
    "status": "Pending",
    "created_at": "2026-11-12 09:20:00",
    "updated_at": "2026-11-12 09:20:00",
    "items": [
      {
        "product_id": 1,
        "name": "Apex Pro Mechanical Keyboard",
        "icon": "⌨️",
        "quantity": 2,
        "unit_price": 129,
        "line_total": 258,
        "remaining_stock": 13
      }
    ]
  }
}
```

Status codes:

| Status | Meaning |
| :--- | :--- |
| `201` | Order created, stock reserved |
| `400` | Invalid/missing payload, invalid JSON, or unsupported quantity |
| `404` | A referenced product does not exist |
| `409` | Insufficient stock |
| `413` | Body larger than 100 KB |
| `429` | Write rate limit exceeded |

### `PATCH /api/orders/:id/status`

Applies one allowed lifecycle transition.

```bash
curl -X PATCH http://127.0.0.1:3000/api/orders/13/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "Confirmed" }'
```

`200 OK`:

```json
{
  "message": "Order ORD-731204 transitioned from Pending to Confirmed.",
  "order_id": 13,
  "order_ref": "ORD-731204",
  "previous_status": "Pending",
  "new_status": "Confirmed",
  "stock_restored": 0
}
```

Cancelling returns the number of units restored:

```json
{
  "message": "Order ORD-731204 transitioned from Confirmed to Cancelled.",
  "order_id": 13,
  "order_ref": "ORD-731204",
  "previous_status": "Confirmed",
  "new_status": "Cancelled",
  "stock_restored": 2
}
```

Status codes:

| Status | Meaning |
| :--- | :--- |
| `200` | Transition applied |
| `400` | Missing/unknown status value |
| `404` | Order does not exist |
| `409` | Transition not allowed by the state machine |

#### Allowed transitions

| From | To |
| :--- | :--- |
| `Pending` | `Confirmed`, `Cancelled` |
| `Confirmed` | `Fulfilled`, `Cancelled` |
| `Fulfilled` | — terminal |
| `Cancelled` | — terminal |

---

## Dashboard statistics

### `GET /api/stats`

```json
{
  "total_orders": 13,
  "pending_orders": 4,
  "confirmed_orders": 2,
  "fulfilled_orders": 5,
  "cancelled_orders": 2,
  "total_revenue": 2384.5,
  "total_products": 6,
  "low_stock_products": 2,
  "out_of_stock_products": 0
}
```

`total_revenue` excludes cancelled orders. `low_stock_products` counts products with `1–5` units; `out_of_stock_products` counts products with `0`.

---

## Error examples

Missing customer name:

```json
{
  "error": "Customer name must be between 2 and 100 characters.",
  "details": [
    { "field": "customer_name", "message": "Customer name must be between 2 and 100 characters." }
  ]
}
```

Overselling:

```json
{
  "error": "Insufficient stock for \"Apex Pro Mechanical Keyboard\". Available: 3, requested: 10."
}
```

Illegal transition:

```json
{
  "error": "Invalid status transition from \"Fulfilled\" to \"Cancelled\". Allowed: none (terminal state)."
}
```
