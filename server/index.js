import express from 'express';
import { pathToFileURL } from 'node:url';
import { computeDecision, generateExplanation, round } from './engine.js';
import * as realDb from './db.js';

const RANGES = {
  data_size_mb: [0.05, 5],
  compute_demand_mi: [50, 3000],
  deadline_ms: [20, 2000],
  congestion_level: [0, 1],
  battery_priority: [0, 1],
};

// Ranges validated for /api/sweep, which takes everything except
// congestion_level (that's the axis being swept).
const SWEEP_RANGES = {
  data_size_mb: RANGES.data_size_mb,
  compute_demand_mi: RANGES.compute_demand_mi,
  deadline_ms: RANGES.deadline_ms,
  battery_priority: RANGES.battery_priority,
};

function validateFields(source, ranges) {
  for (const field of Object.keys(ranges)) {
    const raw = source ? source[field] : undefined;
    if (raw === undefined || raw === null || raw === '') {
      return `${field}: is required`;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return `${field}: must be a number`;
    }
    const [min, max] = ranges[field];
    if (value < min || value > max) {
      return `${field}: must be between ${min} and ${max}`;
    }
  }
  return null;
}

function shapeBreakdown(b) {
  return {
    upload_ms: round(b.upload_ms, 1),
    network_ms: round(b.network_ms, 1),
    congestion_ms: round(b.congestion_ms, 1),
    compute_ms: round(b.compute_ms, 1),
  };
}

// Shared by /api/evaluate, /api/decisions/:id, and /api/sweep so that a
// sweep point and a direct evaluate at the same inputs are byte-identical.
function shapeDestinations(decision) {
  return {
    local: {
      latency_ms: round(decision.t_local_ms, 1),
      energy_mj: round(decision.e_local_mj, 1),
      cost: round(decision.cost_local, 3),
      deadline_violated: decision.deadline_violated_local,
      breakdown: shapeBreakdown(decision.breakdown.local),
    },
    edge: {
      latency_ms: round(decision.t_edge_ms, 1),
      energy_mj: round(decision.e_edge_mj, 1),
      cost: round(decision.cost_edge, 3),
      deadline_violated: decision.deadline_violated_edge,
      breakdown: shapeBreakdown(decision.breakdown.edge),
    },
    cloud: {
      latency_ms: round(decision.t_cloud_ms, 1),
      energy_mj: round(decision.e_cloud_mj, 1),
      cost: round(decision.cost_cloud, 3),
      deadline_violated: decision.deadline_violated_cloud,
      breakdown: shapeBreakdown(decision.breakdown.cloud),
    },
  };
}

function shapeDecisionResponse(task_id, decision_id, persisted, decision, explanation) {
  return {
    task_id,
    decision_id,
    persisted,
    ...shapeDestinations(decision),
    all_infeasible: decision.all_infeasible,
    recommended: decision.recommended,
    explanation,
  };
}

export function createApp(db) {
  const app = express();
  app.use(express.json());

  app.post('/api/evaluate', (req, res) => {
    const error = validateFields(req.body, RANGES);
    if (error) {
      return res.status(400).json({ error });
    }

    const inputs = {
      data_size_mb: Number(req.body.data_size_mb),
      compute_demand_mi: Number(req.body.compute_demand_mi),
      deadline_ms: Number(req.body.deadline_ms),
      congestion_level: Number(req.body.congestion_level),
      battery_priority: Number(req.body.battery_priority),
    };
    // Live preview (sliders re-evaluating without saving) sends
    // "persist": false. Decision logic always runs server-side either way;
    // this flag only controls whether the result is written to the DB.
    const wantsPersist = req.body.persist !== false;

    const decision = computeDecision(inputs);
    const explanation = generateExplanation(decision);

    // Runtime DB-unavailable path (Section 16): the computed result is
    // always returned to the caller even if persistence fails; the failure
    // is logged server-side and surfaced as a non-blocking `warning` field
    // for the frontend toast.
    let task_id = null;
    let decision_id = null;
    let persistFailed = false;
    if (wantsPersist) {
      try {
        task_id = db.insertTask({
          data_size_mb: inputs.data_size_mb,
          compute_demand_mi: inputs.compute_demand_mi,
          deadline_ms: inputs.deadline_ms,
        });
        decision_id = db.insertDecision({
          task_id,
          congestion_level: inputs.congestion_level,
          battery_priority: inputs.battery_priority,
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
        });
      } catch (err) {
        console.error('Persistence failed for /api/evaluate:', err);
        persistFailed = true;
      }
    }

    const persisted = task_id !== null && decision_id !== null;
    const response = shapeDecisionResponse(task_id, decision_id, persisted, decision, explanation);
    if (persistFailed) {
      response.warning = "Result computed, but couldn't be saved to history";
    }
    res.json(response);
  });

  app.get('/api/decisions', (req, res) => {
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
    const rows = db.getDecisions({ limit });
    res.json(
      rows.map((row) => ({
        id: row.id,
        task_id: row.task_id,
        data_size_mb: row.data_size_mb,
        compute_demand_mi: row.compute_demand_mi,
        deadline_ms: row.deadline_ms,
        congestion_level: row.congestion_level,
        battery_priority: row.battery_priority,
        recommended: row.recommended,
        all_infeasible: Boolean(row.all_infeasible),
        created_at: row.created_at,
      }))
    );
  });

  app.get('/api/decisions/:id', (req, res) => {
    const id = Number(req.params.id);
    const rows = db.getDecisions({ id });
    if (rows.length === 0) {
      return res.status(404).json({ error: 'decision not found' });
    }
    const row = rows[0];
    // Recompute from the row's stored inputs (pure function of 5 numbers +
    // fixed constants) rather than reassembling the persisted outputs by
    // hand -- deterministic, so it reproduces the original bit-for-bit,
    // and it's the only way to get the breakdown, which isn't persisted
    // (Section 11's schema is frozen).
    const decision = computeDecision({
      data_size_mb: row.data_size_mb,
      compute_demand_mi: row.compute_demand_mi,
      deadline_ms: row.deadline_ms,
      congestion_level: row.congestion_level,
      battery_priority: row.battery_priority,
    });
    const explanation = generateExplanation(decision);
    res.json(shapeDecisionResponse(row.task_id, row.id, true, decision, explanation));
  });

  app.get('/api/stats', (req, res) => {
    const stats = db.getStats();
    res.json({
      total_evaluated: stats.total_evaluated,
      distribution: stats.distribution,
      avg_latency_ms: stats.total_evaluated > 0 ? round(stats.avg_latency_ms, 1) : 0,
      deadline_success_rate: stats.total_evaluated > 0 ? round(stats.deadline_success_rate, 1) : 0,
    });
  });

  // Congestion sweep for the "latency vs. network congestion" chart: the
  // engine result at every congestion level from 0 to 1 in 0.01 steps
  // (finer than the 0.05 the chart plots, so recommended-destination zone
  // boundaries are accurate rather than interpolated). Pure re-use of
  // computeDecision -- no persistence, no new decision logic.
  app.get('/api/sweep', (req, res) => {
    const error = validateFields(req.query, SWEEP_RANGES);
    if (error) {
      return res.status(400).json({ error });
    }

    const base = {
      data_size_mb: Number(req.query.data_size_mb),
      compute_demand_mi: Number(req.query.compute_demand_mi),
      deadline_ms: Number(req.query.deadline_ms),
      battery_priority: Number(req.query.battery_priority),
    };

    const points = [];
    for (let i = 0; i <= 100; i++) {
      const congestion_level = i / 100;
      const decision = computeDecision({ ...base, congestion_level });
      points.push({
        congestion_level,
        ...shapeDestinations(decision),
        all_infeasible: decision.all_infeasible,
        recommended: decision.recommended,
      });
    }

    res.json({ deadline_ms: base.deadline_ms, points });
  });

  return app;
}

const app = createApp(realDb);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`EdgeDecide server listening on port ${PORT}`);
  });
}

export default app;
