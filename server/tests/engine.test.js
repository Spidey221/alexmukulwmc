import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDecision, generateExplanation, round, selectWinner, CONSTANTS } from '../engine.js';

function assertClose(actual, expected, tolerance = 0.05) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

describe('round (display-rounding helper)', () => {
  test('normalises floating-point noise and rounds half up', () => {
    assert.equal(round(0.1565, 3), 0.157);
    assert.equal(round(150, 1), 150);
    assert.equal(round(1.0005, 3), 1.001);
  });
});

describe('selectWinner (tie-break: Local -> Edge -> Cloud)', () => {
  test('Local wins a tie against anything', () => {
    assert.equal(selectWinner({ local: 0.5, edge: 0.5, cloud: 0.9 }, ['local', 'edge', 'cloud']), 'local');
    assert.equal(selectWinner({ local: 0.5, edge: 0.9, cloud: 0.5 }, ['local', 'edge', 'cloud']), 'local');
  });

  test('Edge wins a tie against Cloud when Local is not a candidate or not tied', () => {
    assert.equal(selectWinner({ local: 0.9, edge: 0.5, cloud: 0.5 }, ['local', 'edge', 'cloud']), 'edge');
    assert.equal(selectWinner({ edge: 0.5, cloud: 0.5 }, ['edge', 'cloud']), 'edge');
  });

  test('a strict winner (no tie) is picked regardless of order', () => {
    assert.equal(selectWinner({ local: 0.9, edge: 0.3, cloud: 0.5 }, ['local', 'edge', 'cloud']), 'edge');
  });
});

describe('Test Case 1 / Preset A - Good Network, Heavy Task', () => {
  const d = computeDecision({
    data_size_mb: 0.5,
    compute_demand_mi: 2000,
    deadline_ms: 1000,
    congestion_level: 0,
    battery_priority: 0.2,
  });

  test('latency and energy match Section 14', () => {
    assertClose(d.t_local_ms, 1000.0);
    assertClose(d.t_edge_ms, 185.0);
    assertClose(d.t_cloud_ms, 160.0);
    assertClose(d.e_local_mj, 1000.0);
    assertClose(d.e_edge_mj, 42.5);
    assertClose(d.e_cloud_mj, 40.0);
  });

  test('cost matches Section 14, including the 0.1565 rounding boundary for Edge', () => {
    assertClose(d.cost_local, 1.0, 0.001);
    assertClose(d.cost_edge, 0.1565, 0.0005);
    assertClose(d.cost_cloud, 0.136, 0.001);
    assert.equal(round(d.cost_edge, 3), 0.157);
  });

  test('all feasible, decision is CLOUD', () => {
    assert.equal(d.all_infeasible, false);
    assert.equal(d.deadline_violated_local, false);
    assert.equal(d.deadline_violated_edge, false);
    assert.equal(d.deadline_violated_cloud, false);
    assert.equal(d.recommended, 'CLOUD');
  });

  test('explanation is Branch A', () => {
    const text = generateExplanation(d);
    assert.match(text, /^RECOMMENDED: CLOUD/);
    assert.match(text, /all meet the 1000 ms deadline/);
  });
});

describe('Preset B - Moderate Congestion', () => {
  const d = computeDecision({
    data_size_mb: 0.5,
    compute_demand_mi: 500,
    deadline_ms: 300,
    congestion_level: 0.5,
    battery_priority: 0.2,
  });

  test('matches Section 14', () => {
    assertClose(d.t_local_ms, 250.0);
    assertClose(d.t_edge_ms, 213.3);
    assertClose(d.t_cloud_ms, 233.3);
    assertClose(d.e_local_mj, 250.0);
    assertClose(d.e_edge_mj, 61.3);
    assertClose(d.e_cloud_mj, 63.3);
    assertClose(d.cost_local, 1.0, 0.001);
    assertClose(d.cost_edge, 0.732);
    assertClose(d.cost_cloud, 0.797);
    assert.equal(d.all_infeasible, false);
    assert.equal(d.recommended, 'EDGE');
  });
});

describe('Test Case 2 / Preset C - Severe Congestion', () => {
  const d = computeDecision({
    data_size_mb: 0.5,
    compute_demand_mi: 500,
    deadline_ms: 300,
    congestion_level: 0.9,
    battery_priority: 0.2,
  });

  test('latency, energy, and feasibility match Section 14', () => {
    assertClose(d.t_local_ms, 250.0);
    assertClose(d.t_edge_ms, 405.7);
    assertClose(d.t_cloud_ms, 425.7);
    assert.equal(d.deadline_violated_local, false);
    assert.equal(d.deadline_violated_edge, true);
    assert.equal(d.deadline_violated_cloud, true);
    assertClose(d.t_edge_ms - 300, 105.7);
    assertClose(d.t_cloud_ms - 300, 125.7);
  });

  test('cost and decision match Section 14 (LOCAL, Branch B)', () => {
    assertClose(d.cost_local, 0.670);
    assertClose(d.cost_edge, 0.863);
    assertClose(d.cost_cloud, 0.903);
    assert.equal(d.all_infeasible, false);
    assert.equal(d.recommended, 'LOCAL');
  });

  test('explanation is Branch B, names Edge and Cloud as excluded', () => {
    const text = generateExplanation(d);
    assert.match(text, /^RECOMMENDED: LOCAL/);
    assert.match(text, /Edge and Cloud miss the 300 ms deadline/);
    assert.match(text, /105\.7 ms and 125\.7 ms/);
  });
});

describe('Test Case 3 / Preset D - High Battery Priority, Data-Heavy Task', () => {
  const d = computeDecision({
    data_size_mb: 3,
    compute_demand_mi: 100,
    deadline_ms: 2000,
    congestion_level: 0.2,
    battery_priority: 0.95,
  });

  test('matches Section 14, energy-driven LOCAL decision', () => {
    assertClose(d.t_local_ms, 50.0);
    assertClose(d.t_edge_ms, 601.4);
    assertClose(d.t_cloud_ms, 633.4);
    assertClose(d.e_local_mj, 50.0);
    assertClose(d.e_edge_mj, 231.6);
    assertClose(d.e_cloud_mj, 234.8);
    assertClose(d.cost_local, 0.206, 0.001);
    assertClose(d.cost_edge, 0.985, 0.001);
    assertClose(d.cost_cloud, 1.0, 0.001);
    assert.equal(d.all_infeasible, false);
    assert.equal(d.recommended, 'LOCAL');
  });

  test('explanation is Branch A (all feasible)', () => {
    const text = generateExplanation(d);
    assert.match(text, /^RECOMMENDED: LOCAL/);
    assert.match(text, /Deadline OK[\s\S]*Deadline OK[\s\S]*Deadline OK/);
  });
});

describe('Test Case 4 - Branch C (all infeasible), defaults with deadline_ms=20', () => {
  const d = computeDecision({
    data_size_mb: 0.5,
    compute_demand_mi: 300,
    deadline_ms: 20,
    congestion_level: 0.3,
    battery_priority: 0.2,
  });

  test('all three miss the deadline by the errata amounts', () => {
    assert.equal(d.deadline_violated_local, true);
    assert.equal(d.deadline_violated_edge, true);
    assert.equal(d.deadline_violated_cloud, true);
    assertClose(d.t_local_ms - 20, 130.0);
    assertClose(d.t_edge_ms - 20, 135.3);
    assertClose(d.t_cloud_ms - 20, 161.3);
  });

  test('costs match the default-input case, all_infeasible true, EDGE recommended', () => {
    assertClose(d.cost_local, 0.862);
    assertClose(d.cost_edge, 0.748);
    assertClose(d.cost_cloud, 0.866);
    assert.equal(d.all_infeasible, true);
    assert.equal(d.recommended, 'EDGE');
  });

  test('explanation is Branch C', () => {
    const text = generateExplanation(d);
    assert.match(text, /^⚠ ALL THREE OPTIONS MISS THE 20 ms DEADLINE\./);
    assert.match(text, /RECOMMENDED \(best available\): EDGE/);
  });
});

describe('Default-input case (errata #1): 0.5, 300, 250, 0.3, 0.2', () => {
  const d = computeDecision({
    data_size_mb: 0.5,
    compute_demand_mi: 300,
    deadline_ms: 250,
    congestion_level: 0.3,
    battery_priority: 0.2,
  });

  test('matches the errata exactly', () => {
    assertClose(d.t_local_ms, 150.0);
    assertClose(d.e_local_mj, 150.0);
    assertClose(d.cost_local, 0.862);
    assertClose(d.t_edge_ms, 155.3);
    assertClose(d.e_edge_mj, 47.1);
    assertClose(d.cost_edge, 0.748);
    assertClose(d.t_cloud_ms, 181.3);
    assertClose(d.e_cloud_mj, 49.7);
    assertClose(d.cost_cloud, 0.866);
    assert.equal(d.all_infeasible, false);
    assert.equal(d.deadline_violated_local, false);
    assert.equal(d.deadline_violated_edge, false);
    assert.equal(d.deadline_violated_cloud, false);
    assert.equal(d.recommended, 'EDGE');
  });
});

describe('No penalty term exists', () => {
  test('constants have no w_penalty, engine module has no penalty_X', async () => {
    assert.equal(Object.keys(CONSTANTS).some((k) => /penalty/i.test(k)), false);
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../engine.js', import.meta.url), 'utf8');
    assert.equal(/penalty/i.test(src), false);
  });
});

describe('Latency breakdown sums to latency (all 4 presets)', () => {
  const presets = [
    { name: 'A', inputs: { data_size_mb: 0.5, compute_demand_mi: 2000, deadline_ms: 1000, congestion_level: 0, battery_priority: 0.2 } },
    { name: 'B', inputs: { data_size_mb: 0.5, compute_demand_mi: 500, deadline_ms: 300, congestion_level: 0.5, battery_priority: 0.2 } },
    { name: 'C', inputs: { data_size_mb: 0.5, compute_demand_mi: 500, deadline_ms: 300, congestion_level: 0.9, battery_priority: 0.2 } },
    { name: 'D', inputs: { data_size_mb: 3, compute_demand_mi: 100, deadline_ms: 2000, congestion_level: 0.2, battery_priority: 0.95 } },
  ];

  for (const { name, inputs } of presets) {
    test(`Preset ${name}: upload + network + congestion + compute == latency, for local/edge/cloud`, () => {
      const d = computeDecision(inputs);
      const latency = { local: d.t_local_ms, edge: d.t_edge_ms, cloud: d.t_cloud_ms };
      for (const dest of ['local', 'edge', 'cloud']) {
        const b = d.breakdown[dest];
        const sum = b.upload_ms + b.network_ms + b.congestion_ms + b.compute_ms;
        assert.ok(
          Math.abs(sum - latency[dest]) < 1e-9,
          `${dest}: breakdown sum ${sum} should equal latency ${latency[dest]}`
        );
      }
      // Local never leaves the device.
      assert.equal(d.breakdown.local.upload_ms, 0);
      assert.equal(d.breakdown.local.network_ms, 0);
      assert.equal(d.breakdown.local.congestion_ms, 0);
    });
  }
});

describe('Determinism', () => {
  test('identical inputs always produce identical outputs', () => {
    const inputs = {
      data_size_mb: 1.2,
      compute_demand_mi: 750,
      deadline_ms: 400,
      congestion_level: 0.4,
      battery_priority: 0.6,
    };
    const d1 = computeDecision(inputs);
    const d2 = computeDecision(inputs);
    assert.deepEqual(d1, d2);
  });
});
