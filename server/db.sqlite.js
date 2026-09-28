import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = process.env.EDGEDECIDE_DB_PATH || path.join(DATA_DIR, 'edgedecide.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_size_mb REAL NOT NULL,
    compute_demand_mi REAL NOT NULL,
    deadline_ms REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    congestion_level REAL NOT NULL,
    battery_priority REAL NOT NULL,
    t_local_ms REAL NOT NULL,
    t_edge_ms REAL NOT NULL,
    t_cloud_ms REAL NOT NULL,
    e_local_mj REAL NOT NULL,
    e_edge_mj REAL NOT NULL,
    e_cloud_mj REAL NOT NULL,
    cost_local REAL NOT NULL,
    cost_edge REAL NOT NULL,
    cost_cloud REAL NOT NULL,
    deadline_violated_local INTEGER NOT NULL,
    deadline_violated_edge INTEGER NOT NULL,
    deadline_violated_cloud INTEGER NOT NULL,
    all_infeasible INTEGER NOT NULL,
    recommended TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const insertTaskStmt = db.prepare(`
  INSERT INTO tasks (data_size_mb, compute_demand_mi, deadline_ms, created_at)
  VALUES (@data_size_mb, @compute_demand_mi, @deadline_ms, @created_at)
`);

const insertDecisionStmt = db.prepare(`
  INSERT INTO decisions (
    task_id, congestion_level, battery_priority,
    t_local_ms, t_edge_ms, t_cloud_ms,
    e_local_mj, e_edge_mj, e_cloud_mj,
    cost_local, cost_edge, cost_cloud,
    deadline_violated_local, deadline_violated_edge, deadline_violated_cloud,
    all_infeasible, recommended, created_at
  ) VALUES (
    @task_id, @congestion_level, @battery_priority,
    @t_local_ms, @t_edge_ms, @t_cloud_ms,
    @e_local_mj, @e_edge_mj, @e_cloud_mj,
    @cost_local, @cost_edge, @cost_cloud,
    @deadline_violated_local, @deadline_violated_edge, @deadline_violated_cloud,
    @all_infeasible, @recommended, @created_at
  )
`);

const JOIN_SELECT = `
  SELECT
    d.id AS id, d.task_id AS task_id,
    t.data_size_mb AS data_size_mb, t.compute_demand_mi AS compute_demand_mi, t.deadline_ms AS deadline_ms,
    d.congestion_level AS congestion_level, d.battery_priority AS battery_priority,
    d.t_local_ms AS t_local_ms, d.t_edge_ms AS t_edge_ms, d.t_cloud_ms AS t_cloud_ms,
    d.e_local_mj AS e_local_mj, d.e_edge_mj AS e_edge_mj, d.e_cloud_mj AS e_cloud_mj,
    d.cost_local AS cost_local, d.cost_edge AS cost_edge, d.cost_cloud AS cost_cloud,
    d.deadline_violated_local AS deadline_violated_local,
    d.deadline_violated_edge AS deadline_violated_edge,
    d.deadline_violated_cloud AS deadline_violated_cloud,
    d.all_infeasible AS all_infeasible,
    d.recommended AS recommended,
    d.created_at AS created_at
  FROM decisions d
  JOIN tasks t ON t.id = d.task_id
`;

const selectByIdStmt = db.prepare(`${JOIN_SELECT} WHERE d.id = ?`);
const selectRecentStmt = db.prepare(`${JOIN_SELECT} ORDER BY d.id DESC LIMIT ?`);
const selectAllForStatsStmt = db.prepare(`
  SELECT recommended, t_local_ms, t_edge_ms, t_cloud_ms, all_infeasible FROM decisions
`);

export function insertTask({ data_size_mb, compute_demand_mi, deadline_ms }) {
  const created_at = new Date().toISOString();
  const result = insertTaskStmt.run({ data_size_mb, compute_demand_mi, deadline_ms, created_at });
  return result.lastInsertRowid;
}

export function insertDecision({
  task_id, congestion_level, battery_priority,
  t_local_ms, t_edge_ms, t_cloud_ms,
  e_local_mj, e_edge_mj, e_cloud_mj,
  cost_local, cost_edge, cost_cloud,
  deadline_violated_local, deadline_violated_edge, deadline_violated_cloud,
  all_infeasible, recommended,
}) {
  const created_at = new Date().toISOString();
  const result = insertDecisionStmt.run({
    task_id, congestion_level, battery_priority,
    t_local_ms, t_edge_ms, t_cloud_ms,
    e_local_mj, e_edge_mj, e_cloud_mj,
    cost_local, cost_edge, cost_cloud,
    deadline_violated_local: deadline_violated_local ? 1 : 0,
    deadline_violated_edge: deadline_violated_edge ? 1 : 0,
    deadline_violated_cloud: deadline_violated_cloud ? 1 : 0,
    all_infeasible: all_infeasible ? 1 : 0,
    recommended,
    created_at,
  });
  return result.lastInsertRowid;
}

export function getDecisions({ id, limit } = {}) {
  if (id !== undefined) {
    const row = selectByIdStmt.get(id);
    return row ? [row] : [];
  }
  return selectRecentStmt.all(limit ?? 20);
}

export function getStats() {
  const rows = selectAllForStatsStmt.all();
  const total_evaluated = rows.length;
  const distribution = { local: 0, edge: 0, cloud: 0 };
  let latencySum = 0;
  let feasibleCount = 0;

  for (const row of rows) {
    const dest = row.recommended.toLowerCase();
    distribution[dest] = (distribution[dest] ?? 0) + 1;
    latencySum += dest === 'local' ? row.t_local_ms : dest === 'edge' ? row.t_edge_ms : row.t_cloud_ms;
    if (!row.all_infeasible) feasibleCount += 1;
  }

  return {
    total_evaluated,
    distribution,
    avg_latency_ms: total_evaluated > 0 ? latencySum / total_evaluated : 0,
    deadline_success_rate: total_evaluated > 0 ? (100 * feasibleCount) / total_evaluated : 0,
  };
}
