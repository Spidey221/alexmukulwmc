import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const tmpDbPath = path.join(
  os.tmpdir(),
  `edgedecide-apitest-${process.pid}-${Date.now()}.db`
);
process.env.EDGEDECIDE_DB_PATH = tmpDbPath;

const { createApp } = await import('../index.js');
const realDb = await import('../db.js');

let server;
let baseUrl;

before(() => {
  const app = createApp(realDb);
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) =>
    server.close(() => {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(tmpDbPath + suffix);
        } catch {
          // already gone
        }
      }
      resolve();
    })
  );
});

async function evaluate(body) {
  const res = await fetch(`${baseUrl}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(pathAndQuery) {
  const res = await fetch(`${baseUrl}${pathAndQuery}`);
  return { status: res.status, json: await res.json() };
}

describe('POST /api/evaluate', () => {
  test('Test Case 1 inputs return Test Case 1 expected values', async () => {
    const { status, json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 2000,
      deadline_ms: 1000,
      congestion_level: 0,
      battery_priority: 0.2,
    });

    assert.equal(status, 200);
    assert.equal(json.local.latency_ms, 1000.0);
    assert.equal(json.edge.latency_ms, 185.0);
    assert.equal(json.cloud.latency_ms, 160.0);
    assert.equal(json.local.cost, 1.0);
    assert.equal(json.edge.cost, 0.157);
    assert.equal(json.cloud.cost, 0.136);
    assert.equal(json.all_infeasible, false);
    assert.equal(json.recommended, 'CLOUD');
    assert.match(json.explanation, /^RECOMMENDED: CLOUD/);
    assert.equal(typeof json.task_id, 'number');
    assert.equal(typeof json.decision_id, 'number');
    assert.equal(json.warning, undefined);
  });

  test('default-input case matches the errata', async () => {
    const { json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 300,
      deadline_ms: 250,
      congestion_level: 0.3,
      battery_priority: 0.2,
    });
    assert.equal(json.local.latency_ms, 150.0);
    assert.equal(json.local.cost, 0.862);
    assert.equal(json.edge.latency_ms, 155.3);
    assert.equal(json.edge.cost, 0.748);
    assert.equal(json.cloud.latency_ms, 181.3);
    assert.equal(json.cloud.cost, 0.866);
    assert.equal(json.all_infeasible, false);
    assert.equal(json.recommended, 'EDGE');
  });

  test('Test Case 4 (Branch C, all infeasible)', async () => {
    const { json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 300,
      deadline_ms: 20,
      congestion_level: 0.3,
      battery_priority: 0.2,
    });
    assert.equal(json.all_infeasible, true);
    assert.equal(json.recommended, 'EDGE');
    assert.equal(json.local.deadline_violated, true);
    assert.equal(json.edge.deadline_violated, true);
    assert.equal(json.cloud.deadline_violated, true);
    assert.match(json.explanation, /^⚠ ALL THREE OPTIONS MISS THE 20 ms DEADLINE\./);
  });

  test('latency breakdown is present and its components sum to latency_ms', async () => {
    const { json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 500,
      deadline_ms: 300,
      congestion_level: 0.9,
      battery_priority: 0.2,
    });
    for (const dest of ['local', 'edge', 'cloud']) {
      const b = json[dest].breakdown;
      const sum = b.upload_ms + b.network_ms + b.congestion_ms + b.compute_ms;
      assert.ok(Math.abs(sum - json[dest].latency_ms) < 0.05, `${dest} breakdown should sum to latency_ms`);
    }
    assert.equal(json.local.breakdown.upload_ms, 0);
    assert.equal(json.local.breakdown.network_ms, 0);
    assert.equal(json.local.breakdown.congestion_ms, 0);
  });

  test('persist defaults to true: creates history rows and reports persisted:true', async () => {
    const before = await get('/api/decisions?limit=1');
    const { json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 300,
      deadline_ms: 250,
      congestion_level: 0.3,
      battery_priority: 0.2,
    });
    assert.equal(json.persisted, true);
    assert.equal(typeof json.task_id, 'number');
    assert.equal(typeof json.decision_id, 'number');
    const after = await get(`/api/decisions/${json.decision_id}`);
    assert.equal(after.status, 200);
    assert.equal(after.json.recommended, json.recommended);
  });

  test('persist:false does not write history, reports persisted:false and null ids', async () => {
    const statsBefore = await get('/api/stats');
    const { status, json } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 300,
      deadline_ms: 250,
      congestion_level: 0.3,
      battery_priority: 0.2,
      persist: false,
    });
    assert.equal(status, 200);
    assert.equal(json.persisted, false);
    assert.equal(json.task_id, null);
    assert.equal(json.decision_id, null);
    assert.equal(json.recommended, 'EDGE');
    assert.equal(json.warning, undefined);
    const statsAfter = await get('/api/stats');
    assert.equal(statsAfter.json.total_evaluated, statsBefore.json.total_evaluated);
  });

  const validBody = {
    data_size_mb: 0.5,
    compute_demand_mi: 300,
    deadline_ms: 250,
    congestion_level: 0.3,
    battery_priority: 0.2,
  };

  for (const [field, [min, max]] of Object.entries({
    data_size_mb: [0.05, 5],
    compute_demand_mi: [50, 3000],
    deadline_ms: [20, 2000],
    congestion_level: [0, 1],
    battery_priority: [0, 1],
  })) {
    test(`${field} below minimum is rejected with 400`, async () => {
      const { status, json } = await evaluate({ ...validBody, [field]: min - 1000 });
      assert.equal(status, 400);
      assert.match(json.error, new RegExp(`^${field}:`));
    });

    test(`${field} above maximum is rejected with 400`, async () => {
      const { status, json } = await evaluate({ ...validBody, [field]: max + 1000 });
      assert.equal(status, 400);
      assert.match(json.error, new RegExp(`^${field}:`));
    });

    test(`${field} at exactly the minimum is accepted`, async () => {
      const { status } = await evaluate({ ...validBody, [field]: min });
      assert.equal(status, 200);
    });

    test(`${field} at exactly the maximum is accepted`, async () => {
      const { status } = await evaluate({ ...validBody, [field]: max });
      assert.equal(status, 200);
    });

    test(`missing ${field} is rejected with 400`, async () => {
      const body = { ...validBody };
      delete body[field];
      const { status, json } = await evaluate(body);
      assert.equal(status, 400);
      assert.match(json.error, new RegExp(`^${field}:`));
    });
  }
});

describe('Full pipeline: evaluate -> decisions -> decisions/:id -> stats', () => {
  test('a stored decision round-trips through the history and detail endpoints', async () => {
    const { json: evalJson } = await evaluate({
      data_size_mb: 0.5,
      compute_demand_mi: 500,
      deadline_ms: 300,
      congestion_level: 0.9,
      battery_priority: 0.2,
    });
    assert.equal(evalJson.recommended, 'LOCAL');

    const { status: listStatus, json: list } = await get('/api/decisions?limit=5');
    assert.equal(listStatus, 200);
    assert.ok(Array.isArray(list));
    const found = list.find((row) => row.id === evalJson.decision_id);
    assert.ok(found, 'evaluated decision should appear in history');
    assert.equal(found.recommended, 'LOCAL');
    assert.equal(typeof found.all_infeasible, 'boolean');
    assert.equal(found.all_infeasible, false);

    const { status: detailStatus, json: detail } = await get(`/api/decisions/${evalJson.decision_id}`);
    assert.equal(detailStatus, 200);
    assert.equal(detail.recommended, 'LOCAL');
    assert.equal(detail.edge.deadline_violated, true);
    assert.equal(detail.cloud.deadline_violated, true);
    assert.match(detail.explanation, /^RECOMMENDED: LOCAL/);
    assert.match(detail.explanation, /Edge and Cloud miss the 300 ms deadline/);

    const { status: statsStatus, json: stats } = await get('/api/stats');
    assert.equal(statsStatus, 200);
    assert.ok(stats.total_evaluated >= 1);
    assert.ok('local' in stats.distribution && 'edge' in stats.distribution && 'cloud' in stats.distribution);
    assert.equal(typeof stats.avg_latency_ms, 'number');
    assert.equal(typeof stats.deadline_success_rate, 'number');
  });

  test('GET /api/decisions/:id returns 404 for an unknown id', async () => {
    const { status, json } = await get('/api/decisions/999999999');
    assert.equal(status, 404);
    assert.equal(json.error, 'decision not found');
  });

  test('GET /api/decisions defaults limit to 20 when omitted', async () => {
    const { status, json } = await get('/api/decisions');
    assert.equal(status, 200);
    assert.ok(json.length <= 20);
  });
});

describe('Runtime DB-unavailable path (Section 16)', () => {
  test('a failing db.insertDecision still returns the computed result, with a warning field', async () => {
    const fakeDb = {
      insertTask: () => 1,
      insertDecision: () => {
        throw new Error('disk full (simulated)');
      },
      getDecisions: () => [],
      getStats: () => ({ total_evaluated: 0, distribution: { local: 0, edge: 0, cloud: 0 }, avg_latency_ms: 0, deadline_success_rate: 0 }),
    };
    const app = createApp(fakeDb);
    const failServer = app.listen(0);
    await new Promise((resolve) => failServer.once('listening', resolve));
    const port = failServer.address().port;

    const originalError = console.error;
    let loggedError = false;
    console.error = (...args) => {
      loggedError = true;
      originalError(...args);
    };

    try {
      const res = await fetch(`http://localhost:${port}/api/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_size_mb: 0.5,
          compute_demand_mi: 300,
          deadline_ms: 250,
          congestion_level: 0.3,
          battery_priority: 0.2,
        }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.local.latency_ms, 150.0);
      assert.equal(json.recommended, 'EDGE');
      assert.equal(json.warning, "Result computed, but couldn't be saved to history");
      assert.ok(loggedError, 'persistence failure should be logged server-side');
    } finally {
      console.error = originalError;
      await new Promise((resolve) => failServer.close(resolve));
    }
  });
});

describe('GET /api/sweep', () => {
  const params = 'data_size_mb=0.5&compute_demand_mi=500&deadline_ms=300&battery_priority=0.2';

  test('returns 101 points from congestion 0 to 1 in 0.01 steps', async () => {
    const { status, json } = await get(`/api/sweep?${params}`);
    assert.equal(status, 200);
    assert.equal(json.deadline_ms, 300);
    assert.equal(json.points.length, 101);
    assert.equal(json.points[0].congestion_level, 0);
    assert.equal(json.points[100].congestion_level, 1);
    assert.ok(Math.abs(json.points[50].congestion_level - 0.5) < 1e-9);
  });

  test('Severe Congestion inputs: Edge recommended up to ~74%, Local above it', async () => {
    const { json } = await get(
      '/api/sweep?data_size_mb=0.5&compute_demand_mi=500&deadline_ms=300&battery_priority=0.2'
    );
    const at = (c) => json.points.find((p) => Math.abs(p.congestion_level - c) < 1e-9).recommended;
    assert.equal(at(0), 'EDGE');
    assert.equal(at(0.5), 'EDGE');
    assert.equal(at(0.73), 'EDGE');
    assert.equal(at(0.75), 'LOCAL');
    assert.equal(at(0.9), 'LOCAL');
    assert.equal(at(1), 'LOCAL');
  });

  test('each sweep point matches a direct persist:false evaluate at that congestion', async () => {
    const { json } = await get(`/api/sweep?${params}`);
    for (const c of [0, 0.13, 0.37, 0.5, 0.74, 0.9, 1]) {
      const point = json.points.find((p) => Math.abs(p.congestion_level - c) < 1e-9);
      const { json: direct } = await evaluate({
        data_size_mb: 0.5,
        compute_demand_mi: 500,
        deadline_ms: 300,
        congestion_level: c,
        battery_priority: 0.2,
        persist: false,
      });
      for (const dest of ['local', 'edge', 'cloud']) {
        assert.deepEqual(point[dest], direct[dest], `mismatch at congestion=${c}, dest=${dest}`);
      }
      assert.equal(point.recommended, direct.recommended, `recommended mismatch at congestion=${c}`);
      assert.equal(point.all_infeasible, direct.all_infeasible, `all_infeasible mismatch at congestion=${c}`);
    }
  });

  test('validates query params the same way as /api/evaluate', async () => {
    const { status, json } = await get('/api/sweep?data_size_mb=0.5&compute_demand_mi=500&deadline_ms=300');
    assert.equal(status, 400);
    assert.match(json.error, /^battery_priority:/);
  });

  test('rejects out-of-range query params with 400', async () => {
    const { status, json } = await get(
      '/api/sweep?data_size_mb=999&compute_demand_mi=500&deadline_ms=300&battery_priority=0.2'
    );
    assert.equal(status, 400);
    assert.match(json.error, /^data_size_mb:/);
  });
});
