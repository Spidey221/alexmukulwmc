export const CONSTANTS = Object.freeze({
  S_local: 2,
  S_edge: 20,
  S_cloud: 50,
  B_base: 50,
  L_edge_base: 5,
  L_cloud_base: 40,
  L_congestion_max: 100,
  P_compute: 1000,
  P_tx: 400,
  P_idle: 100,
});

const ORDER = ['local', 'edge', 'cloud'];
const NAME = { local: 'Local', edge: 'Edge', cloud: 'Cloud' };

export function round(x, d) {
  return Number(Math.round(Number(Number(x.toPrecision(12)) + 'e' + d)) + 'e-' + d);
}

// Tie-break priority (Section 6): Local -> Edge -> Cloud. `candidateSet` is
// assumed to already be ordered Local->Edge->Cloud, so keeping the first
// strictly-lowest-cost entry found naturally applies the priority order.
export function selectWinner(cost, candidateSet) {
  let winner = candidateSet[0];
  for (const dest of candidateSet) {
    if (cost[dest] < cost[winner]) {
      winner = dest;
    }
  }
  return winner;
}

export function computeDecision(inputs) {
  const { data_size_mb, compute_demand_mi, deadline_ms, congestion_level, battery_priority } = inputs;
  const {
    S_local, S_edge, S_cloud,
    B_base, L_edge_base, L_cloud_base, L_congestion_max,
    P_compute, P_tx, P_idle,
  } = CONSTANTS;

  const B_eff = B_base * (1 - 0.8 * congestion_level);
  const L_congestion = congestion_level * L_congestion_max;
  const T_up = (data_size_mb * 8000) / B_eff;

  const T = {
    local: compute_demand_mi / S_local,
    edge: T_up + (L_edge_base + L_congestion) + compute_demand_mi / S_edge,
    cloud: T_up + (L_cloud_base + L_congestion) + compute_demand_mi / S_cloud,
  };

  const E = {
    local: (P_compute * T.local) / 1000,
    edge: (P_tx * T_up) / 1000 + (P_idle * (L_edge_base + L_congestion + compute_demand_mi / S_edge)) / 1000,
    cloud: (P_tx * T_up) / 1000 + (P_idle * (L_cloud_base + L_congestion + compute_demand_mi / S_cloud)) / 1000,
  };

  const maxT = Math.max(T.local, T.edge, T.cloud);
  const maxE = Math.max(E.local, E.edge, E.cloud);

  const cost = {};
  for (const dest of ORDER) {
    const norm_latency = T[dest] / maxT;
    const norm_energy = E[dest] / maxE;
    cost[dest] = (1 - battery_priority) * norm_latency + battery_priority * norm_energy;
  }

  const deadline_violated = {
    local: T.local > deadline_ms,
    edge: T.edge > deadline_ms,
    cloud: T.cloud > deadline_ms,
  };

  const feasible_set = ORDER.filter((d) => T[d] <= deadline_ms);
  const all_infeasible = feasible_set.length === 0;
  const candidate_set = all_infeasible ? ORDER.slice() : feasible_set;

  const winner = selectWinner(cost, candidate_set);

  // Additive latency breakdown per destination (upload + network + congestion
  // + compute == t_X_ms exactly). Local never leaves the device, so only its
  // compute term is non-zero.
  const breakdown = {
    local: { upload_ms: 0, network_ms: 0, congestion_ms: 0, compute_ms: T.local },
    edge: {
      upload_ms: T_up,
      network_ms: L_edge_base,
      congestion_ms: L_congestion,
      compute_ms: compute_demand_mi / S_edge,
    },
    cloud: {
      upload_ms: T_up,
      network_ms: L_cloud_base,
      congestion_ms: L_congestion,
      compute_ms: compute_demand_mi / S_cloud,
    },
  };

  return {
    inputs: { data_size_mb, compute_demand_mi, deadline_ms, congestion_level, battery_priority },
    derived: { B_eff, L_congestion, T_up },
    breakdown,
    t_local_ms: T.local,
    t_edge_ms: T.edge,
    t_cloud_ms: T.cloud,
    e_local_mj: E.local,
    e_edge_mj: E.edge,
    e_cloud_mj: E.cloud,
    cost_local: cost.local,
    cost_edge: cost.edge,
    cost_cloud: cost.cloud,
    deadline_violated_local: deadline_violated.local,
    deadline_violated_edge: deadline_violated.edge,
    deadline_violated_cloud: deadline_violated.cloud,
    all_infeasible,
    recommended: winner.toUpperCase(),
  };
}

function joinNames(arr) {
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

export function generateExplanation(decision) {
  const T = { local: decision.t_local_ms, edge: decision.t_edge_ms, cloud: decision.t_cloud_ms };
  const E = { local: decision.e_local_mj, edge: decision.e_edge_mj, cloud: decision.e_cloud_mj };
  const cost = { local: decision.cost_local, edge: decision.cost_edge, cloud: decision.cost_cloud };
  const violated = {
    local: decision.deadline_violated_local,
    edge: decision.deadline_violated_edge,
    cloud: decision.deadline_violated_cloud,
  };
  const deadline_ms = decision.inputs.deadline_ms;
  const battery_priority = decision.inputs.battery_priority;
  const winner = decision.recommended.toLowerCase();

  const rt = (x) => round(x, 1).toFixed(1);
  const rc = (x) => round(x, 3).toFixed(3);
  const latencyPct = Math.round(100 * (1 - battery_priority));
  const energyPct = Math.round(100 * battery_priority);

  const feasible = ORDER.filter((x) => !violated[x]);
  const infeasible = ORDER.filter((x) => violated[x]);

  if (!decision.all_infeasible && feasible.length === 3) {
    return `RECOMMENDED: ${winner.toUpperCase()}

Local:  ${rt(T.local)} ms | ${rt(E.local)} mJ | Deadline OK
Edge:   ${rt(T.edge)} ms  | ${rt(E.edge)} mJ  | Deadline OK
Cloud:  ${rt(T.cloud)} ms | ${rt(E.cloud)} mJ | Deadline OK

Weighting used: ${latencyPct}% latency-focused,
${energyPct}% energy-focused

Why: ${NAME[winner]} has the lowest combined cost (${rc(cost[winner])}) among all
three options, which all meet the ${deadline_ms} ms deadline.`;
  }

  if (!decision.all_infeasible) {
    const status = (x) => (violated[x] ? 'MISSED' : 'OK');
    const excludedNames = joinNames(infeasible.map((x) => NAME[x]));
    const excludedViolations = joinNames(infeasible.map((x) => `${rt(T[x] - deadline_ms)} ms`));
    const feasibleNames = joinNames(feasible.map((x) => NAME[x]));

    return `RECOMMENDED: ${winner.toUpperCase()}

Local:  ${rt(T.local)} ms | ${rt(E.local)} mJ | Deadline ${status('local')}
Edge:   ${rt(T.edge)} ms  | ${rt(E.edge)} mJ  | Deadline ${status('edge')}
Cloud:  ${rt(T.cloud)} ms | ${rt(E.cloud)} mJ | Deadline ${status('cloud')}

⚠ ${excludedNames} miss the ${deadline_ms} ms deadline
by ${excludedViolations} and are excluded from consideration.

Weighting used: ${latencyPct}% latency-focused,
${energyPct}% energy-focused

Why: Among the destination(s) that meet the deadline
(${feasibleNames}), ${NAME[winner]} has the lowest combined
cost (${rc(cost[winner])}).`;
  }

  return `⚠ ALL THREE OPTIONS MISS THE ${deadline_ms} ms DEADLINE.

Local:  ${rt(T.local)} ms (missed by ${rt(T.local - deadline_ms)} ms)
Edge:   ${rt(T.edge)} ms  (missed by ${rt(T.edge - deadline_ms)} ms)
Cloud:  ${rt(T.cloud)} ms (missed by ${rt(T.cloud - deadline_ms)} ms)

RECOMMENDED (best available): ${winner.toUpperCase()}

Why: Since no option meets the deadline, ${NAME[winner]} is selected as the
lowest-cost fallback (cost ${rc(cost[winner])}) among Local, Edge, and Cloud
based on latency and energy alone.`;
}
