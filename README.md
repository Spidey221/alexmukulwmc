# EdgeDecide

A web app that decides, for a given mobile/IoT computational task, whether it
should run Locally, on an Edge server, or in the Cloud — using a
deterministic latency+energy cost model with a hard deadline-feasibility
filter, sensitive to live wireless network congestion. See `SPEC.md` for the
full specification.

## Project layout

- `server/` — Node.js + Express (ES modules)
  - `engine.js` — pure decision-engine functions (no Express/DB imports)
  - `db.js` — data-access module (`insertTask`, `insertDecision`,
    `getDecisions`, `getStats`); backed by `db.sqlite.js` (better-sqlite3),
    with an automatic fallback to `db.json.js` (flat `data.json` file) if
    `better-sqlite3` isn't available
  - `index.js` — Express routes and input validation
  - `tests/` — `node:test` + `node:assert`, no test-framework dependency
- `client/` — React + Vite, Tailwind CSS via CDN `<script>` (no PostCSS)

## Running it

Requires Node.js 18+.

### Backend

```bash
cd server
npm install
npm run dev      # http://localhost:3001, auto-restarts on change
# or: npm start   # single run, no watch
```

### Frontend

```bash
cd client
npm install
npm run dev       # http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to `http://localhost:3001`
(see `client/vite.config.js`), so start the backend first (or in parallel)
and open `http://localhost:5173`.

### Tests

```bash
cd server
npm test          # runs server/tests/*.test.js (engine, db, and API tests)
```

## API

- `POST /api/evaluate` — accepts `{ data_size_mb, compute_demand_mi, deadline_ms, congestion_level, battery_priority, persist? }`.
  `persist` defaults to `true`; the frontend's live slider preview sends
  `persist: false` to get a result without writing to history. Each
  destination's response also includes a `breakdown` (`upload_ms`,
  `network_ms`, `congestion_ms`, `compute_ms`) that sums to its `latency_ms`.
- `GET /api/sweep?data_size_mb&compute_demand_mi&deadline_ms&battery_priority` —
  the engine's result at every congestion level from 0 to 1 in 0.01 steps
  (101 points), used by the "latency vs. congestion" chart. No persistence.
- `GET /api/decisions`, `GET /api/decisions/:id`, `GET /api/stats` — as
  described in `SPEC.md` Section 12.

## Notes

- SQLite data lives at `server/data/edgedecide.db` (created on first write).
  If `better-sqlite3` fails to install/build on a given machine, `db.js`
  automatically falls back to a flat-file store at `server/data/data.json`
  with an identical function interface — no other file needs to change.
- There is no `/api/presets` endpoint; the 4 demo presets are a frontend
  constant (`client/src/presets.js`), per spec Section 9.
