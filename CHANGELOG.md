# Changelog

All notable changes to OrderFlow are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-12

### Added

- Production-style backend structure: app assembly, config, routes, middleware and utilities.
- `GET /api/health` liveness/readiness probe with database check, version and uptime.
- `GET /api/stats` dashboard aggregates, including non-cancelled revenue and inventory warnings.
- `GET /api/orders/:id` and status/limit/offset filtering for order history.
- Integration test suite (14 tests) using the Node.js test runner against a temporary SQLite database.
- GitHub Actions CI for Node.js 22 and 24.
- One-click startup scripts: `start.bat` (Windows) and `start.sh` (macOS/Linux).
- Security middleware: CSP, frame denial, `nosniff`, referrer/permissions policies, hidden `X-Powered-By`.
- Write-endpoint rate limiting, 100 KB JSON body limit and structured validation errors.
- Graceful shutdown, request logging and WAL-mode SQLite with a busy timeout.
- Admin console diagnostics, order search/status filtering and live KPI refresh.
- Complete documentation: API reference, data model, admin workflow/test matrix and handover guide.
- MIT license, changelog, environment example and `.nvmrc`.

### Changed

- Order creation and status transitions now run in immediate SQLite transactions.
- Stock is decremented with a guarded update to prevent races.
- Client-supplied prices/totals are explicitly ignored; all totals are server-computed.
- Insufficient stock and illegal transitions now return `409 Conflict` (was `400`).
- Order references use `crypto.randomInt` with collision retry.
- Frontend rebuilt with event delegation, escaped dynamic HTML, accessible dialogs, keyboard support and strict-CSP-compatible markup.
- Cart persists in `localStorage` and reconciles quantities against live stock.
- Admin "test buttons" replaced with non-destructive diagnostics and real automated tests.
- Runtime database and `node_modules/` are no longer tracked by git.
- Health, error and validation responses use consistent JSON envelopes.

### Fixed

- Missing database transactions could leave partial orders on failure.
- Stored XSS risk from customer names/emails in the admin table.
- Missing `created_at` migration for `products` and `updated_at` for `orders`.
- Status transitions previously allowed inconsistent stock restoration paths.
- Missing responsive layout rules for header, catalog, cart and tables.
- Empty documentation file and outdated README instructions.
