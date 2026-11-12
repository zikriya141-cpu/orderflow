# OrderFlow — Handover Guide

Everything needed to run, demonstrate, review and extend the project.

---

## 1. First run

| Platform | Steps |
| :--- | :--- |
| Windows | Double-click `start.bat` |
| macOS / Linux | `./start.sh` |
| Any terminal | `npm install` then `npm start` |

Open <http://127.0.0.1:3000>. The first run creates and seeds `orderflow.db` automatically.

Requirements: **Node.js 22.13 or newer**. No database server, build step or environment file is required.

Verify the installation:

```bash
npm test
```

Expected: `pass 14`, `fail 0`.

---

## 2. Five-minute demo script

1. **Storefront** — point out six seeded products and their stock badges.
2. **Product dialog** — open an item, show price/availability and add it twice.
3. **Cart** — increase quantity; note the plus button disables at available stock.
4. **Checkout** — fill name/email/address and place the order. Highlight:
   - the `ORD-######` reference,
   - the server-computed total,
   - the receipt and updated stock.
5. **Admin Portal** — show KPI cards and diagnostics (`API Online`, `Database Connected`).
6. **Lifecycle** — confirm the new order, then mark it fulfilled; show that actions disappear in terminal states.
7. **Stock restoration** — create a second small order, then cancel it; show the toast confirming restored units and the product stock returning.
8. **Validation proof** — optionally run `npm test` and show the passing integration suite.
9. **Persistence** — restart the server and show that orders/stock survived.

Talking points:

- The client sends quantities only; the server owns price, total, stock and state.
- Order creation and cancellation are transactional.
- The state machine makes double-cancellation impossible.
- The test suite runs against a real Express server and a real temporary SQLite database.

---

## 3. Repository map

| Path | What lives there |
| :--- | :--- |
| `server.js` | Process entry point, browser auto-open, graceful shutdown |
| `src/app.js` | Express middleware pipeline and route mounting |
| `src/config.js` | Env defaults and optional `.env` loading |
| `src/db.js` | Schema, migrations, seed data, transaction helper |
| `src/routes/` | Products, orders and stats endpoints |
| `src/middleware/` | Security headers, logger, rate limit, error mapping |
| `src/utils/` | `HttpError` and payload/query validation |
| `public/` | Storefront UI (HTML/CSS/vanilla JS, no build step) |
| `tests/api.test.js` | Integration suite |
| `docs/` | API, data model, admin workflow, this guide |
| `start.bat` / `start.sh` | One-click local runners |

---

## 4. Configuration & operations

Copy `.env.example` to `.env` to override defaults:

| Variable | Default | Notes |
| :--- | :--- | :--- |
| `PORT` | `3000` | Change if the port is busy |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` to allow LAN devices |
| `DB_PATH` | `orderflow.db` | Point elsewhere to isolate data |
| `AUTO_OPEN` | `0` | The one-click scripts set this to `1` |
| `NODE_ENV` | `development` | `production` enables static caching + HSTS |

Operational endpoints and logs:

- `GET /api/health` — `200` when the DB probe succeeds, `503` otherwise.
- Request log line: `[http] <timestamp> <method> <url> <status> <duration>`.
- `Ctrl+C` triggers graceful HTTP/DB shutdown.

To reset the demo data: stop the server, delete `orderflow.db` (and `orderflow.db-wal` / `orderflow.db-shm` if present), then start again.

---

## 5. Known limitations (current scope)

| Area | Limitation | Suggested next step |
| :--- | :--- | :--- |
| Authentication | Admin portal is unauthenticated | Add session/JWT auth and an admin role |
| Payments | Mock checkout only | Integrate a payment provider + webhooks |
| Fulfilment | No shipment/tracking model | Add shipment records and carrier integration |
| Catalog | Seeded data, no CRUD UI | Add admin product create/edit/archive |
| Scale | SQLite, single process | Move to PostgreSQL + shared rate-limit store |
| Notifications | No emails | Add transactional email on order events |
| Audit | No status history table | Append-only `order_status_events` table |

These are deliberate scope choices for a week-scale project, documented so reviewers can distinguish unfinished work from intentional boundaries.

---

## 6. Handover checklist

- [x] Repository is self-contained and runs with one command.
- [x] `README.md` documents setup, configuration, API and limitations.
- [x] `docs/api.md`, `docs/data-model.md`, `docs/admin-workflow-and-tests.md` are complete.
- [x] Automated suite passes (14 tests) and runs in CI on Node 22 and 24.
- [x] Runtime artifacts (`node_modules/`, `*.db`, `.env`) are git-ignored.
- [x] Security headers, validation, escaping, rate limiting and health probing are in place.
- [x] One-click Windows and Unix startup scripts are included.
- [x] MIT license and changelog are present.

Deliverables are committed and pushed to <https://github.com/zikriya141-cpu/orderflow>.
