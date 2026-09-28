import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_PATH = process.env.EDGEDECIDE_DATA_PATH || path.join(DATA_DIR, 'data.json');

function load() {
  if (!fs.existsSync(DATA_PATH)) {
    return { nextTaskId: 1, nextDecisionId: 1, tasks: [], decisions: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function save(state) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
}

export function insertTask({ data_size_mb, compute_demand_mi, deadline_ms }) {
  const state = load();
  const id = state.nextTaskId++;
  state.tasks.push({
    id,
    data_size_mb,
    compute_demand_mi,
    deadline_ms,
    created_at: new Date().toISOString(),
  });
  save(state);
  return id;
}

export function insertDecision({
  task_id, congestion_level, battery_priority,
  t_local_ms, t_edge_ms, t_cloud_ms,
  e_local_mj, e_edge_mj, e_cloud_mj,
  cost_local, cost_edge, cost_cloud,
  deadline_violated_local, deadline_violated_edge, deadline_violated_cloud,
  all_infeasible, recommended,
}) {
  const state = load();
  const id = state.nextDecisionId++;
  state.decisions.push({
    id,
    task_id,
    congestion_level,
    battery_priority,
    t_local_ms, t_edge_ms, t_cloud_ms,
    e_local_mj, e_edge_mj, e_cloud_mj,
    cost_local, cost_edge, cost_cloud,
    deadline_violated_local: deadline_violated_local ? 1 : 0,
    deadline_violated_edge: deadline_violated_edge ? 1 : 0,
    deadline_violated_cloud: deadline_violated_cloud ? 1 : 0,
    all_infeasible: all_infeasible ? 1 : 0,
    recommended,
    created_at: new Date().toISOString(),
  });
  save(state);
  return id;
}

function joinRow(decision, task) {
  return {
    id: decision.id,
    task_id: decision.task_id,
    data_size_mb: task.data_size_mb,
    compute_demand_mi: task.compute_demand_mi,
    deadline_ms: task.deadline_ms,
    congestion_level: decision.congestion_level,
    battery_priority: decision.battery_priority,
    t_local_ms: decision.t_local_ms,
    t_edge_ms: decision.t_edge_ms,
    t_cloud_ms: decision.t_cloud_ms,
    e_local_mj: decision.e_local_mj,
    e_edge_mj: decision.e_edge_mj,
    e_cloud_mj: decision.e_cloud_mj,
    cost_local: decision.cost_local,
    cost_edge: decision.cost_edge,
    cost_cloud: decision.cost_cloud,
    deadline_violated_local: decision.deadline_violated_local,
    deadline_violated_edge: decision.deadline_violated_edge,
    deadline_violated_cloud: decision.deadline_violated_cloud,
    all_infeasible: decision.all_infeasible,
    recommended: decision.recommended,
    created_at: decision.created_at,
  };
}

export function getDecisions({ id, limit } = {}) {
  const state = load();
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));

  if (id !== undefined) {
    const decision = state.decisions.find((d) => d.id === id);
    if (!decision) return [];
    const task = tasksById.get(decision.task_id);
    return [joinRow(decision, task)];
  }

  const sorted = [...state.decisions].sort((a, b) => b.id - a.id);
  const sliced = sorted.slice(0, limit ?? 20);
  return sliced.map((d) => joinRow(d, tasksById.get(d.task_id)));
}

export function getStats() {
  const state = load();
  const total_evaluated = state.decisions.length;
  const distribution = { local: 0, edge: 0, cloud: 0 };
  let latencySum = 0;
  let feasibleCount = 0;

  for (const row of state.decisions) {
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
