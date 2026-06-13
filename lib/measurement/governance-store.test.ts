/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for governance-store. Mocks @supabase/supabase-js (an in-memory
// fake) and fs/promises (so no disk is touched) — the same boundary-mocking
// style the route tests use.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

// ─── in-memory Supabase fake (chainable to match the real query builder) ───
let rows: any[] = [];
function makeClient() {
  return {
    from() {
      let filtered = rows;
      const api: any = {
        insert(row: any) {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        select() {
          return api;
        },
        eq(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] === val);
          return api;
        },
        order(col: string, { ascending }: { ascending: boolean }) {
          filtered = [...filtered].sort((a, b) =>
            ascending ? (a[col] > b[col] ? 1 : -1) : a[col] < b[col] ? 1 : -1
          );
          return api;
        },
        limit(n: number) {
          return Promise.resolve({ data: filtered.slice(0, n), error: null });
        },
      };
      return api;
    },
  };
}

mockModule('@supabase/supabase-js', { namedExports: { createClient: () => makeClient() } });
// Keep all local-file I/O off disk; readFile rejects so the local fallback is empty.
const fsStub = {
  mkdir: async () => {},
  readFile: async () => {
    throw new Error('no local file');
  },
  writeFile: async () => {},
};
mockModule('fs/promises', { namedExports: fsStub, defaultExport: fsStub });

const { saveRun, getLatestRun, listLatestRuns, buildGovernanceRun, planKeyFor } = await import('./governance-store.ts');
import type { LaunchReadinessReport } from './launch-readiness.ts';
import type { MeasurementPlan } from './types.ts';

function plan(url = 'https://shop.example.com', model = 'ecommerce'): MeasurementPlan {
  return {
    meta: { url, businessModel: model, vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [],
    events: [],
    dataLayer: [],
    consent: { categoriesUsed: ['necessary'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: [], customDimensions: [] }, gtm: { suggestedTagCount: 0, notes: '' } },
  } as unknown as MeasurementPlan;
}

function report(url = 'https://shop.example.com'): LaunchReadinessReport {
  return {
    meta: { url, businessModel: 'ecommerce', planSchemaVersion: '1.0.0', readinessSchemaVersion: '0.1.0', generatedAt: '2026-06-01T00:00:00.000Z' },
    decision: 'go',
    checks: [{ id: 'event_ids_unique', category: 'events', name: 'Event IDs are unique', status: 'pass', blocking: true, dependsOn: 'plan', summary: '' }],
    blockingFailures: [],
    warnings: [],
    skipped: [],
    approval: { required: false },
  };
}

beforeEach(() => {
  rows = [];
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
});

test('saveRun then getLatestRun round-trips the GovernanceRun', async () => {
  const key = planKeyFor(plan());
  const run = buildGovernanceRun(report(), plan(), 'admin');
  assert.equal(run.planKey, key, 'planKey is derived from the plan');
  assert.equal(run.user_id, 'admin', 'run is stamped with the owner');
  await saveRun(run);

  const fetched = await getLatestRun('admin', run.siteUrl, key);
  assert.ok(fetched, 'a prior run is returned');
  assert.equal(fetched.runId, run.runId);
  assert.equal(fetched.siteUrl, run.siteUrl);
  assert.equal(fetched.planKey, run.planKey);
  assert.equal(fetched.decision, run.decision);
  assert.deepEqual(fetched.report, run.report);
});

test('getLatestRun returns the MOST RECENT run for a (site, plan) key', async () => {
  const key = planKeyFor(plan());
  const older = buildGovernanceRun(report(), plan(), 'admin', undefined, new Date('2026-06-01T00:00:00.000Z'));
  const newer = buildGovernanceRun(report(), plan(), 'admin', undefined, new Date('2026-06-02T00:00:00.000Z'));
  await saveRun(older);
  await saveRun(newer);

  const fetched = await getLatestRun('admin', older.siteUrl, key);
  assert.equal(fetched?.createdAt, newer.createdAt);
});

// Stage-2 isolation checkpoint: two users analyzing the SAME url get distinct
// rows, and getLatestRun returns only the caller's own run — never the other's.
test('two users, same site/plan → distinct rows; getLatestRun is owner-scoped', async () => {
  const key = planKeyFor(plan());
  const runA = buildGovernanceRun(report(), plan(), 'user_A');
  const runB = buildGovernanceRun(report(), plan(), 'user_B');
  await saveRun(runA);
  await saveRun(runB);

  const aSees = await getLatestRun('user_A', runA.siteUrl, key);
  const bSees = await getLatestRun('user_B', runB.siteUrl, key);
  assert.equal(aSees?.runId, runA.runId, 'A sees only A');
  assert.equal(aSees?.user_id, 'user_A');
  assert.equal(bSees?.runId, runB.runId, 'B sees only B');
  assert.notEqual(aSees?.runId, bSees?.runId, 'the two owners never share a run');
});

test('listLatestRuns reconstructs plan + connectors (the re-run context the cron needs)', async () => {
  const connectors = { ga4: { propertyId: '123456' }, gtm: { containerId: 'GTM-XXXX' } };
  const run = buildGovernanceRun(report(), plan(), 'admin', connectors);
  await saveRun(run);

  const all = await listLatestRuns();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].plan, plan());
  assert.deepEqual(all[0].connectors, connectors);
});

test('listLatestRuns keeps only the latest run per (site, plan) key', async () => {
  await saveRun(buildGovernanceRun(report(), plan(), 'admin', undefined, new Date('2026-06-01T00:00:00.000Z')));
  await saveRun(buildGovernanceRun(report(), plan(), 'admin', undefined, new Date('2026-06-03T00:00:00.000Z')));
  const all = await listLatestRuns();
  assert.equal(all.length, 1, 'deduped to one per key');
  assert.equal(all[0].createdAt, '2026-06-03T00:00:00.000Z');
});

test('getLatestRun returns null when no prior run exists', async () => {
  const fetched = await getLatestRun('admin', 'https://never-seen.example.com', planKeyFor(plan('https://never-seen.example.com')));
  assert.equal(fetched, null);
});

test('planKeyFor is deterministic for the same plan and distinct across plans', () => {
  assert.equal(planKeyFor(plan()), planKeyFor(plan()), 'same plan → same key');
  assert.notEqual(planKeyFor(plan('https://a.com')), planKeyFor(plan('https://b.com')), 'different url → different key');
  assert.notEqual(planKeyFor(plan('https://a.com', 'ecommerce')), planKeyFor(plan('https://a.com', 'saas')), 'different model → different key');
});

test('saveRun degrades gracefully (no throw) when Supabase is unconfigured', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = planKeyFor(plan());
  // Must not throw even with no durable store and no local file.
  await saveRun(buildGovernanceRun(report(), plan(), 'admin'));
  const fetched = await getLatestRun('admin', 'https://shop.example.com', key);
  assert.equal(fetched, null); // nothing durable persisted
});
