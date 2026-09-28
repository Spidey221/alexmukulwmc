import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const sampleDecision = (overrides = {}) => ({
  congestion_level: 0.3,
  battery_priority: 0.2,
  t_local_ms: 150.0,
  t_edge_ms: 155.263,
  t_cloud_ms: 181.263,
  e_local_mj: 150.0,
  e_edge_mj: 47.105,
  e_cloud_mj: 49.705,
  cost_local: 0.862,
  cost_edge: 0.748,
  cost_cloud: 0.866,
  deadline_violated_local: false,
  deadline_violated_edge: false,
  deadline_violated_cloud: false,
  all_infeasible: false,
  recommended: 'EDGE',
  ...overrides,
});

function tmpFile(ext) {
  return path.join(os.tmpdir(), `edgedecide-dbtest-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

async function runSharedSuite(label, setupEnv) {
  describe(`db backend: ${label}`, () => {
    const files = [];
    let db;

    test('loads the module', async () => {
      const { dbPath, envVar } = setupEnv();
      files.push(dbPath);
      process.env[envVar] = dbPath;
      db = await import(label === 'sqlite' ? '../db.sqlite.js' : '../db.json.js');
    });

    test('insertTask returns a numeric id', () => {
      const id = db.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 250 });
      assert.equal(typeof id, 'number');
      assert.ok(id >= 1);
    });

    test('insertDecision stores deadline_violated_* and all_infeasible as 0/1 integers', () => {
      const task_id = db.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 250 });
      const decision_id = db.insertDecision({ task_id, ...sampleDecision() });
      const [row] = db.getDecisions({ id: decision_id });
      assert.equal(row.deadline_violated_local, 0);
      assert.equal(row.deadline_violated_edge, 0);
      assert.equal(row.deadline_violated_cloud, 0);
      assert.equal(row.all_infeasible, 0);
      assert.equal(row.recommended, 'EDGE');
      assert.equal(row.task_id, task_id);
      assert.equal(row.data_size_mb, 0.5);
    });

    test('all_infeasible=true and deadline_violated=true store as 1', () => {
      const task_id = db.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 20 });
      const decision_id = db.insertDecision({
        task_id,
        ...sampleDecision({
          deadline_violated_local: true,
          deadline_violated_edge: true,
          deadline_violated_cloud: true,
          all_infeasible: true,
        }),
      });
      const [row] = db.getDecisions({ id: decision_id });
      assert.equal(row.deadline_violated_local, 1);
      assert.equal(row.deadline_violated_edge, 1);
      assert.equal(row.deadline_violated_cloud, 1);
      assert.equal(row.all_infeasible, 1);
    });

    test('getDecisions({id}) returns [] for an unknown id', () => {
      assert.deepEqual(db.getDecisions({ id: 999999 }), []);
    });

    test('getDecisions({limit}) returns most-recent-first, respecting the limit', () => {
      for (let i = 0; i < 5; i++) {
        const task_id = db.insertTask({ data_size_mb: 0.1, compute_demand_mi: 50, deadline_ms: 100 });
        db.insertDecision({ task_id, ...sampleDecision({ recommended: 'LOCAL' }) });
      }
      const rows = db.getDecisions({ limit: 3 });
      assert.equal(rows.length, 3);
      for (let i = 0; i < rows.length - 1; i++) {
        assert.ok(rows[i].id > rows[i + 1].id);
      }
    });

    test('getStats aggregates distribution, avg_latency_ms (recommended dest only), and deadline_success_rate', () => {
      const { dbPath, envVar } = setupEnv();
      files.push(dbPath);
      process.env[envVar] = dbPath;
      return import(`${label === 'sqlite' ? '../db.sqlite.js' : '../db.json.js'}?fresh=${Math.random()}`).then((fresh) => {
        const t1 = fresh.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 250 });
        fresh.insertDecision({ task_id: t1, ...sampleDecision({ recommended: 'LOCAL', t_local_ms: 100, all_infeasible: false }) });

        const t2 = fresh.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 250 });
        fresh.insertDecision({ task_id: t2, ...sampleDecision({ recommended: 'EDGE', t_edge_ms: 200, all_infeasible: false }) });

        const t3 = fresh.insertTask({ data_size_mb: 0.5, compute_demand_mi: 300, deadline_ms: 20 });
        fresh.insertDecision({
          task_id: t3,
          ...sampleDecision({
            recommended: 'EDGE',
            t_edge_ms: 300,
            all_infeasible: true,
            deadline_violated_local: true,
            deadline_violated_edge: true,
            deadline_violated_cloud: true,
          }),
        });

        const stats = fresh.getStats();
        assert.equal(stats.total_evaluated, 3);
        assert.equal(stats.distribution.local, 1);
        assert.equal(stats.distribution.edge, 2);
        assert.equal(stats.distribution.cloud, 0);
        assert.equal(stats.avg_latency_ms, (100 + 200 + 300) / 3);
        assert.equal(stats.deadline_success_rate, (100 * 2) / 3);
      });
    });

    after(() => {
      for (const f of files) {
        for (const suffix of ['', '-wal', '-shm']) {
          try {
            fs.unlinkSync(f + suffix);
          } catch {
            // already gone
          }
        }
      }
    });
  });
}

await runSharedSuite('sqlite', () => ({ dbPath: tmpFile('db'), envVar: 'EDGEDECIDE_DB_PATH' }));
await runSharedSuite('json', () => ({ dbPath: tmpFile('json'), envVar: 'EDGEDECIDE_DATA_PATH' }));
