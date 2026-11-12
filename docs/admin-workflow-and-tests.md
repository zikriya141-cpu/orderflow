# Admin Workflow, State Machine & Test Matrix

This document describes how order operations behave, what the admin console exposes, and how each requirement is verified.

---

## 1. Lifecycle rules

| Current status | Allowed next | Result |
| :--- | :--- | :--- |
| `Pending` | `Confirmed` | Stock remains reserved |
| `Pending` | `Cancelled` | Stock restored, order becomes terminal |
| `Confirmed` | `Fulfilled` | Stock remains reserved, order becomes terminal |
| `Confirmed` | `Cancelled` | Stock restored, order becomes terminal |
| `Fulfilled` | — | `409 Conflict` |
| `Cancelled` | — | `409 Conflict` |

**Stock ownership**

- Stock is reserved at the moment an order is created.
- `Pending` and `Confirmed` orders keep their units reserved.
- `Fulfilled` consumes the reservation permanently.
- The first valid move to `Cancelled` returns every unit to inventory.
- Terminal locking guarantees stock can never be restored twice.

**Validation guarantees**

- Status values are restricted to the four known states.
- Transitions are checked against the current database status inside a transaction.
- Orders that do not exist return `404`.
- Unknown statuses return `400`; illegal transitions return `409`.

---

## 2. Admin console workflow

1. Open the storefront and select **Admin Portal** in the header.
2. Review the KPI cards:
   - **Total orders** — all persisted orders.
   - **Pending review** — orders awaiting confirmation.
   - **Fulfilled** — completed orders.
   - **Revenue (non-cancelled)** — sum of `total_amount` excluding cancelled orders.
3. Check **System diagnostics** for API, database, version and uptime.
4. Use **Search** and the **status filter** to narrow the order table.
5. Perform an action:
   - **Confirm** a pending order.
   - **Mark fulfilled** after confirmation.
   - **Cancel** at either `Pending` or `Confirmed`; the UI asks for confirmation because stock will be restored.
6. Observe the toast message (including restored units) and the refreshed stats/table.

The UI only offers actions allowed by the state machine, and the server re-validates every request regardless of what the UI displays.

---

## 3. Manual QA checklist

Use a fresh database or a disposable copy of `orderflow.db`.

| # | Scenario | Expected result |
| :--- | :--- | :--- |
| 1 | Double-click `start.bat` on a clean clone | Dependencies install, server starts, browser opens |
| 2 | Open storefront | Six products load with stock badges |
| 3 | Open a product and add it twice | Cart count becomes 2, stock limit respected |
| 4 | Increase quantity beyond stock | Plus button disabled; toast explains the limit |
| 5 | Place an order with valid details | Receipt shows reference, line items and server total |
| 6 | Reload the page | Catalog shows reduced stock; cart persisted if non-empty |
| 7 | Submit a blank checkout form | Browser blocks submission with native validation |
| 8 | Open Admin Portal | KPIs, diagnostics and order table load |
| 9 | Confirm a pending order | Status becomes `Confirmed`; stock unchanged |
| 10 | Mark the confirmed order fulfilled | Status becomes `Fulfilled`; no further actions |
| 11 | Cancel a pending/confirmed order | Status becomes `Cancelled`; stock increases by ordered units |
| 12 | Search by reference/email; filter by status | Table narrows correctly; empty state shown when no match |
| 13 | Refresh diagnostics | API `Online`, database `Connected`, version/uptime visible |
| 14 | Restart server | Orders and stock persist in SQLite |
| 15 | Stop with `Ctrl+C` | Logs graceful shutdown, process exits cleanly |

---

## 4. Automated test suite

Run:

```bash
npm test
```

The suite boots the real Express app on an ephemeral port against a temporary SQLite database, then exercises the HTTP API. It is deterministic and does not touch the development database.

| Test | Requirement covered |
| :--- | :--- |
| Health endpoint | Service/database readiness and version reporting |
| Security headers | CSP, `nosniff`, frame denial, hidden `X-Powered-By` |
| Catalog seed | Six products with valid, canonical fields |
| Product lookup | Valid id, missing product (`404`), malformed id (`400`) |
| Unknown API route | JSON `404` instead of HTML |
| Payload validation | Missing fields, invalid email, empty cart, invalid quantity |
| Malformed JSON | `400` with a JSON error message |
| Oversell / unknown product | `409` and `404`; rejected order leaves stock untouched |
| Price tampering | Client price/total ignored; DB price used |
| Cancellation | Stock restored exactly once; order becomes terminal |
| Duplicate lines | Aggregated into a single line before stock checks |
| Lifecycle | Skip-step rejected; `Confirmed → Fulfilled` accepted; terminal locked |
| Invalid status | `400` for unknown status values |
| History | Status filtering, pagination, `X-Total-Count`, query validation |
| Stats | Counts and non-cancelled revenue consistent with order history |

Current result: **14 tests passing**.

CI runs the same command on Node.js 22 and 24 for every push and pull request to `main`.

---

## 5. Evidence commands

```bash
# version and environment
node --version

# start and verify health
npm start
curl http://127.0.0.1:3000/api/health

# run the full suite
npm test

# inspect the database (optional, when the sqlite3 CLI is installed)
sqlite3 orderflow.db "SELECT status, COUNT(*) FROM orders GROUP BY status;"
sqlite3 orderflow.db "SELECT id, name, stock FROM products ORDER BY id;"
```

For a written walkthrough of the demo, see [handover.md](handover.md).
