# OrderFlow

A compact, full-stack **mini e-commerce storefront and order-management console** built with Node.js, Express and SQLite.

[![CI](https://github.com/zikriya141-cpu/orderflow/actions/workflows/ci.yml/badge.svg)](https://github.com/zikriya141-cpu/orderflow/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=node.js&logoColor=white)
![Tests](https://img.shields.io/badge/tests-14%20passing-10b981)
![License](https://img.shields.io/badge/license-MIT-blue)

OrderFlow demonstrates the parts of an order system that matter most: **server-authoritative pricing, transactional inventory control, a strict order state machine, and a clear customer/admin separation** — without hiding the implementation behind a framework.

---

## Features

### Customer storefront
- Seeded hardware catalog with live stock badges (in stock / low stock / out of stock).
- Product detail dialog with specification summary and availability.
- Persistent cart (local storage) with quantity controls and stock clamping.
- Native form validation and a mock checkout with an order receipt.
- Responsive dark UI, keyboard support and ARIA labels.

### Admin console
- KPI dashboard: total orders, pending review, fulfilled and non-cancelled revenue.
- Order table with search, status filter and line-item detail.
- Lifecycle actions: **Pending → Confirmed → Fulfilled**, or **Cancelled**.
- Cancelling an order restores its reserved stock exactly once.
- Live system diagnostics (API health, database, version, uptime).

### Engineering quality
- Server recomputes every total from database prices — client-supplied prices are ignored.
- Order creation and status changes run inside SQLite transactions.
- Input validation with field-level error details.
- State-machine enforcement for order transitions; terminal states are locked.
- Stored-XSS protection: all dynamic HTML is escaped.
- Strict CSP, security headers, JSON body limits and write-endpoint rate limiting.
- 14 integration tests, GitHub Actions CI on Node.js 22 and 24, graceful shutdown and a health probe.
- One-click startup scripts for Windows, macOS and Linux.

---

## Tech stack

| Layer | Choice |
| :--- | :--- |
| Runtime | Node.js ≥ 22.13 (built-in `node:sqlite`) |
| Server | Express 5 |
| Database | SQLite (file-based, auto-created and seeded) |
| Frontend | Vanilla JavaScript, HTML5, CSS3 (no build step) |
| Testing | Node.js built-in test runner + `fetch` |
| CI | GitHub Actions (Node 22 & 24) |

No ORM, no bundler and no frontend framework — the project stays small enough to read end-to-end.

---

## Quick start

### Option 1 — one click (recommended for reviewers)

| Platform | Action |
| :--- | :--- |
| Windows | Double-click **`start.bat`** |
| macOS / Linux | Run **`./start.sh`** |

The script checks the Node.js version, installs dependencies on the first run, starts the server and opens the browser at <http://127.0.0.1:3000>.

### Option 2 — terminal

```bash
npm install
npm start
```

Then open <http://127.0.0.1:3000>.

```bash
npm run dev     # restart automatically on file changes
npm test        # run the API integration suite
```

Use the **Admin Portal** button in the header to open the admin console. The database file (`orderflow.db`) is created and seeded automatically on first start.

---

## Configuration

Copy `.env.example` to `.env` only when you need to override a default:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for LAN access) |
| `DB_PATH` | `orderflow.db` | SQLite database path (relative to project root) |
| `AUTO_OPEN` | `0` | Set to `1` to open the browser on startup |
| `NODE_ENV` | `development` | `development`, `production` or `test` |

---

## API overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Liveness probe with DB status, version and uptime |
| `GET` | `/api/products` | Full product catalog |
| `GET` | `/api/products/:id` | Single product |
| `GET` | `/api/orders` | Orders with items (`status`, `limit`, `offset`) |
| `GET` | `/api/orders/:id` | Single order with items |
| `POST` | `/api/orders` | Create an order (server-priced, stock-validated) |
| `PATCH` | `/api/orders/:id/status` | Apply a lifecycle transition |
| `GET` | `/api/stats` | Admin dashboard aggregates |

Successful responses are JSON. Errors use a consistent shape:

```json
{
  "error": "A human-readable message.",
  "details": [{ "field": "customer_email", "message": "A valid email address is required." }]
}
```

Full request/response examples: **[docs/api.md](docs/api.md)**.

---

## Order lifecycle

```text
Pending ──► Confirmed ──► Fulfilled   (terminal)
   │            │
   └────────────┴──────► Cancelled    (terminal, restores stock)
```

| From | Allowed next states |
| :--- | :--- |
| `Pending` | `Confirmed`, `Cancelled` |
| `Confirmed` | `Fulfilled`, `Cancelled` |
| `Fulfilled` | — terminal |
| `Cancelled` | — terminal |

Illegal transitions return **409 Conflict** and never mutate inventory.

---

## Project structure

```text
orderflow/
├── .github/workflows/ci.yml     # Node 22 & 24 CI pipeline
├── docs/
│   ├── admin-workflow-and-tests.md
│   ├── api.md
│   ├── data-model.md
│   └── handover.md
├── public/                      # Static storefront (no build step)
│   ├── app.js
│   ├── favicon.svg
│   ├── index.html
│   └── style.css
├── src/
│   ├── app.js                   # Express app & middleware pipeline
│   ├── config.js                # Environment configuration
│   ├── constants.js             # Statuses, transitions, limits
│   ├── db.js                    # Schema, migrations, seed, transactions
│   ├── middleware/
│   │   ├── error-handler.js
│   │   ├── rate-limit.js
│   │   ├── request-logger.js
│   │   └── security.js
│   ├── routes/
│   │   ├── orders.js
│   │   ├── products.js
│   │   └── stats.js
│   └── utils/
│       ├── http-error.js
│       └── validation.js
├── tests/api.test.js            # 14 integration tests
├── server.js                    # Entry point, browser launch, graceful shutdown
├── start.bat / start.sh         # One-click runners
├── package.json
└── README.md
```

Runtime artifacts such as `orderflow.db`, `node_modules/` and `.env` are intentionally git-ignored.

---

## Testing

```bash
npm test
```

The suite starts the Express app on an ephemeral port with an isolated temporary database and covers:

- health probe and security headers
- catalog shape and id validation
- order payload validation, malformed JSON and unknown products
- overselling prevention and stock immutability on rejection
- server-authoritative pricing (tampered client prices ignored)
- stock deduction and restoration on cancellation
- duplicate line-item aggregation
- full lifecycle transitions, terminal-state locking and invalid statuses
- filtering, pagination, `X-Total-Count` and stats consistency

See **[docs/admin-workflow-and-tests.md](docs/admin-workflow-and-tests.md)** for the manual QA checklist and requirement-to-test mapping.

---

## Security & reliability notes

- **Authoritative pricing:** totals are always recomputed from SQLite; `client_price` is discarded.
- **Atomic inventory:** order creation checks stock and decrements it inside an immediate transaction.
- **State machine:** transitions are validated server-side; stock is restored only on the first cancellation.
- **Input hardening:** type, length, email, quantity and line-item limits with structured errors.
- **Output encoding:** every database or customer value rendered into HTML is escaped.
- **Transport/header hardening:** CSP, `nosniff`, `DENY` framing, referrer and permissions policies.
- **Abuse limits:** 100 KB JSON body limit and 120 write requests/minute per IP.
- **Operations:** `/api/health`, request logging, graceful shutdown and WAL-mode SQLite.

> **Deployment note:** the admin portal is intentionally unauthenticated in this demo. Before exposing OrderFlow publicly, add authentication/authorization (session or JWT) and put it behind HTTPS. See the roadmap below.

---

## Documentation

- [API reference](docs/api.md)
- [Data model & architecture](docs/data-model.md)
- [Admin workflow, state machine & test matrix](docs/admin-workflow-and-tests.md)
- [Handover guide & demo script](docs/handover.md)

---

## Limitations & next steps

This project is deliberately scoped as a learning/demo system:

- Mock checkout — no payment gateway, tax, shipping rates or email notifications.
- No admin authentication or role-based access control.
- Single-process SQLite; use PostgreSQL and a shared rate-limit store for horizontal scaling.
- No product-management CRUD UI (catalog is seeded in `src/db.js`).
- No refund flow; cancellations restore stock only.

A natural next iteration would add admin auth, paginated server-side search, a product CRUD screen, and payment/webhook integration.

---

## License

[MIT](LICENSE) © 2026 Zikriya Khan
