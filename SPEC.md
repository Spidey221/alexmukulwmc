# EdgeDecide — Final Standalone Specification

*This document is complete and self-contained. No earlier conversation, specification, or audit needs to be consulted to implement from it. No code is included. Nothing below is a redesign — every item either restates a preserved decision, restates a previously-made correction, or fills a gap identified in the reconciliation audit.*

---

## 1. Product Definition

EdgeDecide is a web application that decides, for a single mobile/IoT computational task, whether that task should execute **Locally** on the device, on an **Edge** server, or in the **Cloud**. The decision is made by a deterministic cost model that estimates latency and energy consumption for all three options, checks each against the task's deadline, and selects the option with the lowest combined cost among those that meet the deadline.

The model is sensitive to live wireless-network congestion: congestion reduces available uplink bandwidth and adds queuing delay, which raises the latency and energy cost of both offloading options (Edge and Cloud) relative to Local. This congestion-sensitivity is what ties the project to Wireless and Mobile Communication rather than to distributed computing in general.

This is an educational, simplified model, not a production telecom offloading algorithm. CPU speeds, network delay, and power draw are represented as flat constants rather than measured hardware profiles. Its value is that every number shown is traceable to an explicit formula in Section 4.

---

## 2. Scope

**MUST-HAVE — exactly 7 features (this is the authoritative count; no other count applies anywhere in this document):**
1. Task input controls: data size, compute demand, deadline
2. Network congestion slider
3. Battery-priority slider
4. Local / Edge / Cloud comparison cards (latency, energy, deadline status per option)
5. Recommendation banner with generated explanation
6. Decision history table
7. Demo preset selector (4 fixed scenarios, Section 14)

**SHOULD-HAVE:**
- Aggregate stats panel (distribution, average latency, deadline success rate)
- Deadline-violation badges on each comparison card
- Clicking a history row reloads that scenario

**NICE-TO-HAVE:**
- Exposing device/edge/cloud CPU speed as additional sliders
- Icons (e.g., lucide-react) for visual polish
- Animated transitions between recommendations

**DO NOT BUILD:**
- User accounts / authentication
- Real network hardware or a real edge server
- Machine-learning-based decision model
- Multi-page routing
- WebSocket / streaming updates
- A `/api/presets` endpoint (presets are a frontend constant — Section 9)

---

## 3. Exact User Inputs, Ranges, and Defaults

**User-controlled (sliders/inputs):**

| Variable | Meaning | Unit | Default | Min | Max |
|---|---|---|---|---|---|
| `data_size_mb` | Task data size | MB | 0.5 | 0.05 | 5 |
| `compute_demand_mi` | Task computational demand | million instructions (MI) | 300 | 50 | 3000 |
| `deadline_ms` | Task deadline | ms | 250 | 20 | 2000 |
| `congestion_level` | Wireless network congestion | 0–1 (shown as %) | 0.3 | 0 | 1 |
| `battery_priority` | Weight on energy vs. latency | 0–1 (shown as %) | 0.2 | 0 | 1 |

All five ranges are inclusive at both ends. Sliders must not allow values outside these bounds.

**Fixed system constants (not exposed to the user in the MUST-have build):**

| Variable | Meaning | Unit | Value |
|---|---|---|---|
| `S_local` | Device CPU speed | MI/ms | 2 |
| `S_edge` | Edge server CPU speed | MI/ms | 20 |
| `S_cloud` | Cloud CPU speed | MI/ms | 50 |
| `B_base` | Base uplink bandwidth (0% congestion) | Mbps | 50 |
| `L_edge_base` | Fixed edge round-trip network overhead | ms | 5 |
| `L_cloud_base` | Fixed cloud round-trip network overhead | ms | 40 |
| `L_congestion_max` | Extra queuing delay at 100% congestion | ms | 100 |
| `P_compute` | Device power draw while computing locally | mW | 1000 |
| `P_tx` | Device power draw while radio is transmitting | mW | 400 |
| `P_idle` | Device power draw while awaiting a network response | mW | 100 |

There is no `w_penalty` constant. It was removed when the deadline-penalty model was replaced by the feasibility filter (Section 5). It must not be reintroduced.

---

## 4. Complete Decision-Engine Formulas

**Effective bandwidth under congestion:**
```
B_eff = B_base × (1 − 0.8 × congestion_level)      [Mbps]
```
Ranges from `B_base` (no congestion) down to 20% of `B_base` (full congestion). Never reaches zero.

**Extra network delay from congestion** (applies equally to Edge and Cloud, since both share the same wireless uplink):
```
L_congestion = congestion_level × L_congestion_max   [ms]
```

**Upload time** (shared by Edge and Cloud paths). Dimensional derivation:
```
Step 1: data_size_mb × 8            → megabits
Step 2: megabits ÷ B_eff (Mbps)     → seconds
Step 3: seconds × 1000              → milliseconds

T_up = (data_size_mb × 8000) / B_eff   [ms]
```

**Latency per destination:**
```
T_local = compute_demand_mi / S_local

T_edge  = T_up + (L_edge_base + L_congestion) + (compute_demand_mi / S_edge)

T_cloud = T_up + (L_cloud_base + L_congestion) + (compute_demand_mi / S_cloud)
```

**Energy per destination (mJ):**
```
E_local = P_compute × T_local / 1000

E_edge  = P_tx × T_up / 1000
        + P_idle × (L_edge_base + L_congestion + compute_demand_mi/S_edge) / 1000

E_cloud = P_tx × T_up / 1000
        + P_idle × (L_cloud_base + L_congestion + compute_demand_mi/S_cloud) / 1000
```

**Normalization** (computed across all three candidates, regardless of feasibility — needed for display even when a candidate is later excluded):
```
maxT = max(T_local, T_edge, T_cloud)
maxE = max(E_local, E_edge, E_cloud)

norm_latency_X = T_X / maxT
norm_energy_X  = E_X / maxE
```

**Final cost score per destination** (no deadline-penalty term — this term was permanently removed in the deadline-logic correction and must not be reintroduced):
```
cost_X = (1 − battery_priority) × norm_latency_X + battery_priority × norm_energy_X
```

`cost_local`, `cost_edge`, `cost_cloud` are always computed and always displayed, even for a destination later excluded as infeasible.

---

## 5. Exact Decision Algorithm

```
1. Compute T_local, T_edge, T_cloud and E_local, E_edge, E_cloud (Section 4).
2. Compute cost_local, cost_edge, cost_cloud (Section 4) — always, for all three.
3. feasible_set = { X ∈ {local, edge, cloud} : T_X ≤ deadline_ms }
   (≤ is inclusive — meeting the deadline exactly counts as meeting it.)
4. If feasible_set is non-empty:
       all_infeasible = false
       candidate_set  = feasible_set
   Else:
       all_infeasible = true
       candidate_set  = {local, edge, cloud}   (all three)
5. winner = the member of candidate_set with the lowest cost_X.
   Tie-break (Section 6) applies if two or more members of candidate_set
   have an exactly equal cost_X.
6. Output: T_local/edge/cloud, E_local/edge/cloud, cost_local/edge/cloud,
   deadline_violated_local/edge/cloud (boolean, = T_X > deadline_ms),
   all_infeasible (boolean), winner, explanation text (Section 7).
```

This is the complete and only decision logic. There is no deadline-penalty term anywhere in this algorithm.

---

## 6. Tie-Break Behavior

If two or more members of the current `candidate_set` (as defined in Section 5, step 4) produce an **exactly equal** `cost_X` value, select among the tied candidates in this fixed priority order:

```
Local → Edge → Cloud
```

i.e., if Local is tied for lowest cost with anything else, Local wins; otherwise if Edge is tied with Cloud, Edge wins. This rule only matters for exact floating-point ties and is not expected to trigger during the 4 demo presets (Section 14), but must be implemented so the engine's behavior is fully defined for every possible input.

---

## 7. Explanation-Generation Logic

The explanation is generated at read-time from the numeric fields in Section 5's output — never stored as its own text field. There are exactly three branches, selected as follows: if `all_infeasible = false` and `feasible_set` contains all 3 destinations → **Branch A**; if `all_infeasible = false` and `feasible_set` contains 1 or 2 destinations → **Branch B**; if `all_infeasible = true` → **Branch C**.

**Branch A — All feasible:**
```
RECOMMENDED: {WINNER}

Local:  {T_local} ms | {E_local} mJ | Deadline OK
Edge:   {T_edge} ms  | {E_edge} mJ  | Deadline OK
Cloud:  {T_cloud} ms | {E_cloud} mJ | Deadline OK

Weighting used: {100×(1−battery_priority)}% latency-focused,
{100×battery_priority}% energy-focused

Why: {WINNER} has the lowest combined cost ({cost_winner}) among all
three options, which all meet the {deadline_ms} ms deadline.
```

**Branch B — Some infeasible:**
```
RECOMMENDED: {WINNER}

Local:  {T_local} ms | {E_local} mJ | Deadline {OK/MISSED}
Edge:   {T_edge} ms  | {E_edge} mJ  | Deadline {OK/MISSED}
Cloud:  {T_cloud} ms | {E_cloud} mJ | Deadline {OK/MISSED}

⚠ {excluded destination name(s)} miss the {deadline_ms} ms deadline
by {violation amount(s)} ms and are excluded from consideration.

Weighting used: {100×(1−battery_priority)}% latency-focused,
{100×battery_priority}% energy-focused

Why: Among the destination(s) that meet the deadline
({feasible destination name(s)}), {WINNER} has the lowest combined
cost ({cost_winner}).
```

**Branch C — All infeasible:**
```
⚠ ALL THREE OPTIONS MISS THE {deadline_ms} ms DEADLINE.

Local:  {T_local} ms (missed by {violation_local} ms)
Edge:   {T_edge} ms  (missed by {violation_edge} ms)
Cloud:  {T_cloud} ms (missed by {violation_cloud} ms)

RECOMMENDED (best available): {WINNER}

Why: Since no option meets the deadline, {WINNER} is selected as the
lowest-cost fallback (cost {cost_winner}) among Local, Edge, and Cloud
based on latency and energy alone.
```

`{violation_X}` in Branches B and C = `T_X − deadline_ms`, rounded per Section 16's display rule.

---

## 8. Network Simulation Behavior

- **User-controlled:** `congestion_level`, `battery_priority`, and the three task fields (Section 3).
- **App-derived every evaluation (never independently settable):** `B_eff`, `L_congestion`, `T_up`.
- **Fixed constants (Section 3):** all CPU speeds, base network overheads, and power-draw rates.
- **Mechanism:** congestion affects the system through exactly two channels — it *reduces available bandwidth* (slowing the upload) and *adds a flat queuing delay* (worsening latency directly) — applied identically to both Edge and Cloud, since both share the same wireless uplink.
- **No randomness anywhere in the simulation.** Every value is a pure deterministic function of the five inputs in Section 3. Identical inputs always produce identical outputs — required for a reliable live demo.

---

## 9. Final Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | React + Vite | |
| Styling | Tailwind CSS via CDN `<script>` tag (no PostCSS build step) | Avoids version-matching build errors |
| Charts/visuals | Plain CSS bars (`<div>` elements with percentage widths) | No charting library dependency |
| Frontend HTTP | Native `fetch` | No axios dependency |
| Icons | None by default; optional NICE-to-have polish only if time remains | |
| Backend | Node.js + Express | |
| Database | `better-sqlite3`, accessed only through a data-access module `db.js` exposing exactly 4 functions: `insertTask()`, `insertDecision()`, `getDecisions()`, `getStats()` | See Section 16 for the install-time fallback for this dependency |
| ORM | None — raw SQL inside `db.js` | Two tables, four queries; an ORM adds setup risk with no benefit at this scale |
| Demo presets | Hardcoded as a frontend constant (not an API endpoint) | Removes a network dependency from the most failure-sensitive part of the demo |

---

## 10. System Architecture

```
USER
  ↓
REACT DASHBOARD        (sliders, comparison cards, recommendation banner,
                         warning banner, history table, stats panel)
  ↓  REST calls via native fetch
EXPRESS BACKEND         (route handlers, input validation)
  ↓
OFFLOADING DECISION ENGINE   (pure functions implementing Sections 4–7)
  ↓
db.js DATA-ACCESS MODULE     (insertTask, insertDecision, getDecisions, getStats)
  ↓
SQLITE DATABASE          (tasks, decisions — Section 11)
  ↓
JSON RESULT              (Section 12)
  ↓
DASHBOARD RE-RENDER
```

**Responsibilities:**
- **Frontend:** collects input, sends requests, renders the response. Contains no decision logic.
- **Backend (Express):** validates input (Section 16), calls the decision engine, calls `db.js` to persist, shapes the JSON response.
- **Decision Engine:** a standalone, framework-free module implementing Sections 4–7 exactly. Independently testable without Express or a database.
- **`db.js`:** the only code in the system allowed to touch the database directly. Its 4-function interface must remain stable even if its internal implementation is swapped (Section 16).
- **Database:** persistence only. No triggers, no stored procedures, no business logic.

---

## 11. Complete Database Schema

**Table `tasks`:**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique task id |
| `data_size_mb` | REAL | NOT NULL | Task data size input |
| `compute_demand_mi` | REAL | NOT NULL | Task compute demand input |
| `deadline_ms` | REAL | NOT NULL | Task deadline input |
| `created_at` | TEXT | NOT NULL (ISO 8601 datetime) | History ordering |

**Table `decisions`:**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique decision id |
| `task_id` | INTEGER | NOT NULL, FOREIGN KEY → `tasks(id)` | Which task this decision evaluated |
| `congestion_level` | REAL | NOT NULL | Network condition used |
| `battery_priority` | REAL | NOT NULL | Weighting used |
| `t_local_ms` | REAL | NOT NULL | Computed Local latency |
| `t_edge_ms` | REAL | NOT NULL | Computed Edge latency |
| `t_cloud_ms` | REAL | NOT NULL | Computed Cloud latency |
| `e_local_mj` | REAL | NOT NULL | Computed Local energy |
| `e_edge_mj` | REAL | NOT NULL | Computed Edge energy |
| `e_cloud_mj` | REAL | NOT NULL | Computed Cloud energy |
| `cost_local` | REAL | NOT NULL | Final Local cost score |
| `cost_edge` | REAL | NOT NULL | Final Edge cost score |
| `cost_cloud` | REAL | NOT NULL | Final Cloud cost score |
| `deadline_violated_local` | INTEGER | NOT NULL, values 0 or 1 | Whether Local missed the deadline |
| `deadline_violated_edge` | INTEGER | NOT NULL, values 0 or 1 | Whether Edge missed the deadline |
| `deadline_violated_cloud` | INTEGER | NOT NULL, values 0 or 1 | Whether Cloud missed the deadline |
| `all_infeasible` | INTEGER | NOT NULL, values 0 or 1 | Whether every destination missed the deadline (same 0/1 convention as the `deadline_violated_*` columns) |
| `recommended` | TEXT | NOT NULL, one of `'LOCAL'`, `'EDGE'`, `'CLOUD'` | The decision |
| `created_at` | TEXT | NOT NULL (ISO 8601 datetime) | History ordering |

No other tables exist. No user/authentication tables.

---

## 12. Complete API Contracts

### `POST /api/evaluate`

**Request body:**
```json
{
  "data_size_mb": 0.5,
  "compute_demand_mi": 300,
  "deadline_ms": 250,
  "congestion_level": 0.3,
  "battery_priority": 0.2
}
```

**Response body (200):**
```json
{
  "task_id": 14,
  "decision_id": 14,
  "local":  { "latency_ms": 150.0, "energy_mj": 150.0, "cost": 1.000, "deadline_violated": false },
  "edge":   { "latency_ms": 100.0, "energy_mj": 34.0,  "cost": 0.579, "deadline_violated": false },
  "cloud":  { "latency_ms": 126.0, "energy_mj": 36.6,  "cost": 0.721, "deadline_violated": false },
  "all_infeasible": false,
  "recommended": "EDGE",
  "explanation": "RECOMMENDED: EDGE\n\n...(Branch A/B/C text per Section 7)..."
}
```

Validation failure → `400` with `{ "error": "<field>: <reason>" }` (Section 16).

### `GET /api/decisions?limit=20`

**Response body (200):**
```json
[
  {
    "id": 14,
    "task_id": 14,
    "data_size_mb": 0.5,
    "compute_demand_mi": 300,
    "deadline_ms": 250,
    "congestion_level": 0.3,
    "battery_priority": 0.2,
    "recommended": "EDGE",
    "all_infeasible": false,
    "created_at": "2026-09-27T10:15:00Z"
  }
]
```
`limit` is optional; defaults to 20 if omitted.

### `GET /api/decisions/:id`

**Response body (200):** identical shape to `POST /api/evaluate`'s response.
**Not found (404):** `{ "error": "decision not found" }`

### `GET /api/stats`

**Response body (200):**
```json
{
  "total_evaluated": 14,
  "distribution": { "local": 4, "edge": 6, "cloud": 4 },
  "avg_latency_ms": 187.3,
  "deadline_success_rate": 92.9
}
```
- `distribution` = counts of `recommended` across all stored decisions.
- `avg_latency_ms` = average, across all decisions, of the *recommended* destination's own latency (`t_local_ms`/`t_edge_ms`/`t_cloud_ms` depending on `recommended`).
- `deadline_success_rate` = `100 × (count of decisions where all_infeasible = 0) / total_evaluated`.

No `/api/presets` endpoint exists.

---

## 13. Dashboard / UI Specification

Single page, five zones:

**TOP:** "EdgeDecide" title, one-line tagline ("Where should this task run?"), small "WMC Mini Project" badge.

**LEFT — Task & Condition Panel:**
- Preset dropdown: "Custom" + the 4 named presets from Section 14
- Slider: Data size (MB), range/default per Section 3
- Slider: Compute demand (MI), range/default per Section 3
- Slider: Deadline (ms), range/default per Section 3
- Slider: Network congestion (0–100%), range/default per Section 3
- Slider: Battery priority (0–100%), labeled "Latency-focused ↔ Energy-focused"
- "Evaluate" button (primary action)

**CENTER — Comparison:** three cards (Local, Edge, Cloud), each showing:
- Latency (large, bold)
- Energy (mJ)
- Deadline-status badge: green "OK" or red "MISSED"
- The recommended card gets a highlighted border and a "✓ Recommended" tag

**RIGHT — Recommendation:**
- Branch A/B (normal case): a colored banner naming the winner, the bullet breakdown from Section 7, current weighting shown as e.g. "80% latency / 20% energy"
- Branch B specifically: an inline warning line naming the excluded destination(s) and their deadline miss, directly under the banner
- **Branch C specifically (all-infeasible): a distinct full-width warning banner** (different color, e.g. amber/red, from the normal recommendation banner) reading "⚠ All three options miss the deadline" appears above the normal recommendation content, followed by the fallback pick and its reasoning

**BOTTOM — History & Analytics:**
- History table (from `GET /api/decisions`): columns for task size, compute demand, congestion, battery priority, recommended destination, timestamp; clicking a row reloads that scenario's inputs into the Left panel (SHOULD-have)
- Stat cards (from `GET /api/stats`): total evaluated, deadline success rate, average latency
- A plain-CSS-bar chart of the Local/Edge/Cloud distribution

**Strong visual emphasis on:** the recommended destination's name (largest text on the page), the latency numbers, and deadline-violation badges/banners (must read as an alert, not a footnote).

---

## 14. Demo Presets with Verified Expected Outputs

All values below are the authoritative source of truth for every preset — no other version of these numbers exists or should be used. Rounding: latency/energy to 1 decimal, cost to 3 decimals.

### Preset A — "Good Network, Heavy Task"
Inputs: `data_size_mb=0.5, compute_demand_mi=2000, deadline_ms=1000, congestion_level=0, battery_priority=0.2`

| Step | Value |
|---|---|
| `B_eff` | 50.0 Mbps |
| `T_up` | 80.0 ms |
| `L_congestion` | 0.0 ms |
| Local: latency / energy | 1000.0 ms / 1000.0 mJ |
| Edge: latency / energy | 185.0 ms / 42.5 mJ |
| Cloud: latency / energy | 160.0 ms / 40.0 mJ |
| Deadline status | Local OK · Edge OK · Cloud OK — all feasible |
| Cost | Local 1.000 · Edge 0.157 · Cloud 0.136 |
| **all_infeasible** | false |
| **Decision** | **CLOUD** |

### Preset B — "Moderate Congestion"
Inputs: `data_size_mb=0.5, compute_demand_mi=500, deadline_ms=300, congestion_level=0.5, battery_priority=0.2`

| Step | Value |
|---|---|
| `B_eff` | 30.0 Mbps |
| `T_up` | 133.3 ms |
| `L_congestion` | 50.0 ms |
| Local: latency / energy | 250.0 ms / 250.0 mJ |
| Edge: latency / energy | 213.3 ms / 61.3 mJ |
| Cloud: latency / energy | 233.3 ms / 63.3 mJ |
| Deadline status | Local OK · Edge OK · Cloud OK — all feasible |
| Cost | Local 1.000 · Edge 0.732 · Cloud 0.797 |
| **all_infeasible** | false |
| **Decision** | **EDGE** |

### Preset C — "Severe Congestion"
Inputs: `data_size_mb=0.5, compute_demand_mi=500, deadline_ms=300, congestion_level=0.9, battery_priority=0.2`

| Step | Value |
|---|---|
| `B_eff` | 14.0 Mbps |
| `T_up` | 285.7 ms |
| `L_congestion` | 90.0 ms |
| Local: latency / energy | 250.0 ms / 250.0 mJ |
| Edge: latency / energy | 405.7 ms / 126.3 mJ |
| Cloud: latency / energy | 425.7 ms / 128.3 mJ |
| Deadline status | Local OK · Edge MISSED by 105.7 ms · Cloud MISSED by 125.7 ms — only Local feasible |
| Cost (all three, for display) | Local 0.670 · Edge 0.863 · Cloud 0.903 |
| **all_infeasible** | false |
| **Decision** | **LOCAL** (Branch B explanation: Edge and Cloud excluded by the deadline filter) |

### Preset D — "High Battery Priority, Data-Heavy Task"
Inputs: `data_size_mb=3, compute_demand_mi=100, deadline_ms=2000, congestion_level=0.2, battery_priority=0.95`

| Step | Value |
|---|---|
| `B_eff` | 42.0 Mbps |
| `T_up` | 571.4 ms |
| `L_congestion` | 20.0 ms |
| Local: latency / energy | 50.0 ms / 50.0 mJ |
| Edge: latency / energy | 601.4 ms / 231.6 mJ |
| Cloud: latency / energy | 633.4 ms / 234.8 mJ |
| Deadline status | Local OK · Edge OK · Cloud OK — all feasible |
| Cost | Local 0.206 · Edge 0.985 · Cloud 1.000 |
| **all_infeasible** | false |
| **Decision** | **LOCAL** (energy-driven, not deadline-driven) |

---

## 15. Test Cases (with corrected explanations)

**Test Case 1 (= Preset A):** Inputs `data_size_mb=0.5, compute_demand_mi=2000, deadline_ms=1000, congestion_level=0, battery_priority=0.2`. Expected: T_local=1000.0ms, T_edge=185.0ms, T_cloud=160.0ms, cost_local=1.000, cost_edge=0.157, cost_cloud=0.136, all_infeasible=false. **Expected decision: CLOUD.** Explanation: with a good network and a compute-heavy task, Cloud's superior processing power (50 MI/ms vs. Edge's 20) outweighs its larger fixed network overhead.

**Test Case 2 (= Preset C):** Inputs `data_size_mb=0.5, compute_demand_mi=500, deadline_ms=300, congestion_level=0.9, battery_priority=0.2`. Expected: T_local=250.0ms (feasible), T_edge=405.7ms (misses by 105.7ms), T_cloud=425.7ms (misses by 125.7ms), all_infeasible=false. **Expected decision: LOCAL.** Explanation (corrected — replaces the previous "penalty terms dominate" wording, which described a mechanism that no longer exists): *Edge and Cloud are excluded by the deadline feasibility filter, since both exceed the 300 ms deadline (by 105.7 ms and 125.7 ms respectively); Local is the only feasible option and is therefore selected regardless of its cost relative to the other two.*

**Test Case 3 (= Preset D):** Inputs `data_size_mb=3, compute_demand_mi=100, deadline_ms=2000, congestion_level=0.2, battery_priority=0.95`. Expected: E_local=50.0mJ vs. E_edge=231.6mJ vs. E_cloud=234.8mJ, all feasible, cost_local=0.206 lowest. **Expected decision: LOCAL.** Explanation: with battery priority weighted at 95%, the model correctly favors Local because transmitting 3 MB costs far more energy than the light 100 MI computation performed on-device — this is an energy-driven decision, not a deadline-driven one (contrast with Test Case 2, which reaches the same destination for a different reason).

Running these exact inputs through the implemented engine and confirming an exact match (within the rounding in Section 14) to the values above is the acceptance test for the engine module, before any UI work begins.

---

## 16. Error Handling

**Input validation (backend, `400` response with `{ "error": "<message>" }`):**
- `data_size_mb` outside [0.05, 5] → rejected
- `compute_demand_mi` outside [50, 3000] → rejected
- `deadline_ms` outside [20, 2000] → rejected
- `congestion_level` outside [0, 1] → rejected
- `battery_priority` outside [0, 1] → rejected
- Any missing required field → rejected
- Frontend sliders are constrained to these ranges by construction, so this validation is a backend safety net, not the primary UX mechanism.

**Two distinct database-related failure modes — do not conflate them:**

1. **Runtime "database unavailable"** — occurs *while the app is already running* (e.g., disk full, file briefly locked) during a single `POST /api/evaluate` call. Behavior: the decision engine's computed result is still returned to the user in the HTTP response; the `db.js` persistence call is attempted, and if it fails, the failure is logged server-side and the frontend shows a small non-blocking toast ("Result computed, but couldn't be saved to history"). The user-visible calculation is never blocked by a persistence failure.
2. **Install-time "native module failure"** — occurs *before the app ever runs*, if `better-sqlite3` fails to install/build on the development machine. This is a one-time development-environment problem, not a runtime behavior. Resolution: swap `db.js`'s internal implementation for a flat-JSON-file store (`fs.readFileSync`/`writeFileSync` against a `data.json` file) while keeping its 4 exported function signatures (`insertTask`, `insertDecision`, `getDecisions`, `getStats`) identical — no other file in the system needs to change.

**Backend unavailable (frontend perspective):** show a clear "can't reach the server" message rather than a silent failure or infinite loading state.

---

## 17. One-Day Implementation Plan

| Hours | Work |
|---|---|
| 0 – 2.5 | Decision engine as pure functions (Sections 4–7). Run Test Cases 1–3 (Section 15) by hand until they match exactly. |
| 2.5 – 4 | Express API: `POST /api/evaluate` first, wired directly to the engine, no persistence yet. |
| 4 – 5 | `db.js` + SQLite integration (Section 11); implement the remaining 3 endpoints (Section 12). |
| 5 – 6.5 | Basic unstyled React frontend: sliders, a button, raw JSON dump of the response — confirms the full pipeline end-to-end. |
| 6.5 – 8.5 | Polished dashboard (Section 13): comparison cards, recommendation banner, warning banner, history table, Tailwind styling. |
| 8.5 – 9.5 | Wire in the 4 demo presets (Section 14); re-run Test Cases 1–3 through the actual UI. |
| 9.5 – 10 | Final pass: error states, stat cards, rehearse the demo script. |

**Cut-off point:** if still on the unstyled frontend past Hour 7, stop adding SHOULD-have items (history-row click-to-reload, stat cards) and go straight to styling the 7 MUST-have features — a plain but complete and correctly-behaving dashboard beats a half-finished polished one.

---

## 18. Claude Code / Antigravity Implementation Stages

1. **Scaffold** — Goal: both servers run. Implement: Vite React skeleton + Express skeleton, `npm run dev` for both. Test before proceeding: both start with no errors; the frontend can hit a trivial test route on the backend.
2. **Decision Engine** — Goal: engine is provably correct in isolation, with no Express/DB dependency. Implement: Sections 4–7 as pure functions. Test before proceeding: Test Cases 1–3 (Section 15) pass exactly.
3. **Backend/API** — Goal: HTTP layer works. Implement: `POST /api/evaluate` calling the engine, in-memory storage only (no DB yet), validation (Section 16). Test before proceeding: a direct call to `/api/evaluate` with Test Case 1's inputs returns Test Case 1's expected values (Section 15).
4. **Database** — Goal: persistence works. Implement: `db.js` and the SQLite schema (Section 11); implement `GET /api/decisions`, `GET /api/decisions/:id`, `GET /api/stats`. Test before proceeding: run all 3 test cases through `/api/evaluate`, confirm the history and stats endpoints reflect them correctly, including correct `all_infeasible` values.
5. **Basic Frontend** — Goal: full pipeline proven end-to-end. Implement: plain form + raw JSON display, calling `/api/evaluate`. **Acceptance criterion (clarified — this is the single source of truth for this stage, superseding any earlier ambiguity): submitting each of the 4 presets from Section 14 through this UI must reproduce, exactly, both the winning destination name AND every displayed numeric value (latency, energy, cost, `all_infeasible`) shown in Section 14's tables, at the rounding specified there.**
6. **Dashboard Visualization** — Goal: it looks like a real product. Implement: comparison cards, recommendation banner, the Branch A/B/C explanation logic (Section 7) including the distinct all-infeasible warning banner (Section 13), sliders, Tailwind styling. Test before proceeding: visually confirm all 4 presets render correctly, including that Preset C shows the exclusion warning (Branch B) and that a manually-constructed all-infeasible input shows the Branch C banner.
7. **Integration/Testing** — Goal: confidence for the live demo. Implement: history table, stat cards, preset dropdown wiring. **Acceptance criterion (clarified, same standard as Stage 5): run all 4 presets through the finished UI twice each; results must be identical both times (determinism check) and must match Section 14 exactly, numerically and in the recommended destination.**
8. **UI Polish** — Goal: presentation-ready. Implement: badges, optional icons, spacing/typography, loading states. Test before proceeding: a full run-through of the Section 14 presets with no visual glitches and no numeric drift from Section 14.

---

## 19. Explicitly Deferred Features

User accounts/authentication; live device/edge/cloud CPU-speed sliders; real hardware or real network integration; a machine-learning-based decision model; multi-page routing; WebSocket/streaming updates; a `/api/presets` endpoint; Recharts; axios; lucide-react (deferred to optional NICE-to-have polish only).

---

## 20. Final Acceptance Criteria

The project is considered complete and demo-ready when all of the following hold:

- All 7 MUST-have features (Section 2) are implemented and functioning.
- The decision engine reproduces Test Cases 1–3 (Section 15) exactly.
- The decision engine reproduces all 4 demo presets (Section 14) exactly, through the actual UI, twice in a row (determinism).
- The `all_infeasible` flag and its INTEGER (0/1) representation are correctly set in the database, the API response, and reflected in the UI's warning-banner behavior (Branch C).
- Branch A, B, and C explanation text (Section 7) each render correctly for at least one tested input (Presets A/D exercise Branch A, Preset C exercises Branch B; a manually-constructed severe-congestion + tight-deadline input exercises Branch C).
- No deadline-penalty term (`w_penalty`, `penalty_X`) exists anywhere in the implemented code.
- The tie-break rule (Section 6) is implemented, even though it is not exercised by the 4 presets.
- All input validation rules (Section 16) reject out-of-range/missing input with a `400` and a clear message.
- The two database fallback behaviors (Section 16) are implemented as distinct code paths, not conflated.
- No feature outside Sections 2/19's MUST/SHOULD/NICE lists has been added.

---

# FINAL AUTHORITATIVE IMPLEMENTATION SPECIFICATION

```
PROJECT NAME: EdgeDecide

PRODUCT DEFINITION: A web app that decides, for a given mobile/IoT
computational task, whether it should run Locally, on an Edge server,
or in the Cloud — using a transparent, deterministic latency+energy
cost model, with a hard deadline-feasibility filter, that responds to
live wireless network congestion.

MUST-HAVE FEATURES (exactly 7):
1. Task input (data size, compute demand, deadline)
2. Network congestion slider
3. Battery-priority slider
4. Local/Edge/Cloud comparison cards
5. Recommendation banner with generated explanation
6. Decision history table
7. Demo preset selector (4 fixed scenarios)

USER INPUTS (ranges inclusive):
- data_size_mb: 0.05–5, default 0.5
- compute_demand_mi: 50–3000, default 300
- deadline_ms: 20–2000, default 250
- congestion_level: 0–1, default 0.3
- battery_priority: 0–1, default 0.2

FIXED CONSTANTS:
S_local=2, S_edge=20, S_cloud=50 (MI/ms)
B_base=50 (Mbps)
L_edge_base=5, L_cloud_base=40, L_congestion_max=100 (ms)
P_compute=1000, P_tx=400, P_idle=100 (mW)
[No w_penalty constant exists.]

TECH STACK: React+Vite, Tailwind via CDN script, plain CSS bars
(no chart library), native fetch (no axios); Node.js+Express;
better-sqlite3 behind a db.js module (insertTask, insertDecision,
getDecisions, getStats) with a documented flat-JSON-file fallback
for install-time native-module failure; no ORM; no /api/presets
endpoint (presets are a frontend constant).

ARCHITECTURE:
React Dashboard → Express API (validation) → Decision Engine
(pure functions) → db.js → SQLite (tasks, decisions) → JSON
response → Dashboard re-render.

DATABASE SCHEMA:
tasks(id INTEGER PK AUTOINCREMENT, data_size_mb REAL NOT NULL,
  compute_demand_mi REAL NOT NULL, deadline_ms REAL NOT NULL,
  created_at TEXT NOT NULL)
decisions(id INTEGER PK AUTOINCREMENT, task_id INTEGER NOT NULL FK,
  congestion_level REAL NOT NULL, battery_priority REAL NOT NULL,
  t_local_ms/t_edge_ms/t_cloud_ms REAL NOT NULL,
  e_local_mj/e_edge_mj/e_cloud_mj REAL NOT NULL,
  cost_local/cost_edge/cost_cloud REAL NOT NULL,
  deadline_violated_local/_edge/_cloud INTEGER NOT NULL (0/1),
  all_infeasible INTEGER NOT NULL (0/1),
  recommended TEXT NOT NULL ('LOCAL'|'EDGE'|'CLOUD'),
  created_at TEXT NOT NULL)

API ENDPOINTS:
POST /api/evaluate   → returns local/edge/cloud breakdown,
                        all_infeasible, recommended, explanation
GET  /api/decisions   → history list (summary fields)
GET  /api/decisions/:id → full breakdown for one past decision
GET  /api/stats       → total_evaluated, distribution,
                        avg_latency_ms, deadline_success_rate
Exact JSON shapes: Section 12.

CORE FORMULAS:
B_eff = B_base × (1 − 0.8 × congestion_level)
L_congestion = congestion_level × L_congestion_max
T_up = (data_size_mb × 8000) / B_eff
T_local = compute_demand_mi / S_local
T_edge  = T_up + (L_edge_base + L_congestion) + compute_demand_mi/S_edge
T_cloud = T_up + (L_cloud_base + L_congestion) + compute_demand_mi/S_cloud
E_local = P_compute × T_local / 1000
E_edge  = P_tx×T_up/1000 + P_idle×(L_edge_base+L_congestion+compute_demand_mi/S_edge)/1000
E_cloud = P_tx×T_up/1000 + P_idle×(L_cloud_base+L_congestion+compute_demand_mi/S_cloud)/1000
maxT = max(T_local,T_edge,T_cloud); maxE = max(E_local,E_edge,E_cloud)
cost_X = (1−battery_priority)×(T_X/maxT) + battery_priority×(E_X/maxE)
[No penalty term exists in this formula.]

DECISION ALGORITHM:
feasible_set = { X : T_X ≤ deadline_ms }
If feasible_set non-empty: all_infeasible=false, winner=argmin(cost_X)
  over feasible_set.
Else: all_infeasible=true, winner=argmin(cost_X) over all three.
Tie-break on exact cost ties within the comparison set: Local → Edge → Cloud.

EXPLANATION BRANCHES: A (all feasible), B (some infeasible — names
excluded destinations and their miss amounts), C (all infeasible —
leads with a warning, then the fallback pick). Exact templates: Section 7.

DASHBOARD: Top bar; Left panel (preset dropdown + 5 sliders + Evaluate
button); Center (3 comparison cards with deadline badges); Right
(recommendation banner + Branch A/B/C explanation + distinct all-
infeasible warning banner for Branch C); Bottom (history table, stat
cards, CSS-bar distribution chart).

DEMO PRESETS (authoritative numbers — Section 14):
A) Good network/heavy task, cong=0, battery=0.2 → CLOUD (cost 0.136)
B) Moderate congestion, cong=0.5, battery=0.2 → EDGE (cost 0.732)
C) Severe congestion, cong=0.9, battery=0.2 → LOCAL, Branch B
   (Edge misses by 105.7ms, Cloud by 125.7ms)
D) High battery priority + data-heavy, cong=0.2, battery=0.95 → LOCAL
   (cost 0.206, energy-driven)

TEST CASES: TC1=Preset A, TC2=Preset C (explanation: Edge/Cloud
excluded by the deadline feasibility filter — NOT "penalty terms
dominate"), TC3=Preset D. Full detail: Section 15.

ERROR HANDLING: reject out-of-range/missing input with 400 (Section
16 ranges). Two distinct DB fallback paths: (1) runtime DB-unavailable
→ still return the computed result, log/toast the persistence
failure; (2) install-time better-sqlite3 failure → swap db.js's
internals for a flat-JSON-file store with identical function
signatures.

IMPLEMENTATION STAGES: Scaffold → Decision Engine → Backend/API →
Database → Basic Frontend → Dashboard Visualization → Integration/
Testing → UI Polish. Stage 5 and Stage 7 acceptance criteria are
explicitly: exact match, including all numeric values, to Section
14's tables for all 4 presets, at the stated rounding (1 decimal for
ms/mJ, 3 decimals for cost).

ESTIMATED MVP BUILD TIME: ~9–9.5 hours. Cut-off point: Hour 7 — if
still on the unstyled frontend, freeze scope to the 7 MUST-have
features and proceed straight to styling.

DEFERRED FEATURES: auth/accounts, live CPU-speed sliders, real
hardware/network integration, ML-based decision model, multi-page
routing, WebSocket streaming, /api/presets endpoint, Recharts,
axios, lucide-react (optional polish only).

ACCEPTANCE CRITERIA: Section 20 — all 7 MUST-have features present;
Test Cases 1–3 and Demo Presets A–D reproduced exactly and
deterministically through the UI; all_infeasible correctly
represented as INTEGER 0/1 end-to-end; all three explanation branches
verified; no penalty-term code exists; tie-break rule implemented;
both DB fallback paths implemented as distinct code paths; no
features added beyond Sections 2/19.
```

**This specification is frozen.**