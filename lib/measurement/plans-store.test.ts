/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for plans-store (Stage-0 scaffolding, not wired to routes). Mocks
// @supabase/supabase-js (in-memory, id-upsert) and fs/promises (no disk), like the
// governance-store / metric-store tests. Also asserts the additive optional
// user_id on the existing ownership types compiles + round-trips at runtime.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

// ─── in-memory Supabase fake (chainable; upsert keyed on id) ───
let rows: any[] = [];
function makeClient() {
  return {
    from() {
      let filtered = rows;
      const api: any = {
        upsert(input: any) {
          const incoming = Array.isArray(input) ? input : [input];
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const r of incoming) byId.set(r.id, r);
          rows.length = 0;
          rows.push(...byId.values());
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
          const sorted = [...filtered].sort((a, b) => (ascending ? (a[col] > b[col] ? 1 : -1) : a[col] < b[col] ? 1 : -1));
          return Promise.resolve({ data: sorted, error: null });
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
const fsStub = {
  mkdir: async () => {},
  readFile: async () => {
    throw new Error('no local file');
  },
  writeFile: async () => {},
};
mockModule('fs/promises', { namedExports: fsStub, defaultExport: fsStub });

const { savePlan, getPlan, listPlansByUser, buildPlan } = await import('./plans-store.ts');
import type { Plan } from './plans-store.ts';
import type { Ga4MetricDaily } from './metric-store.ts';
import type { GovernanceRun } from './governance-store.ts';
import type { MeasurementPlan } from './types.ts';

const fakePlan = () => ({ meta: { url: 'https://shop.example.com', businessModel: 'ecommerce' } } as unknown as MeasurementPlan);

beforeEach(() => {
  rows = [];
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
});

test('savePlan then getPlan round-trips', async () => {
  const p = buildPlan({ user_id: 'admin', plan: fakePlan(), site_url: 'https://shop.example.com', business_model: 'ecommerce' });
  await savePlan(p);
  const got = await getPlan(p.id);
  assert.ok(got, 'plan is returned');
  assert.deepEqual(got, p);
});

test('getPlan returns null for an unknown id', async () => {
  assert.equal(await getPlan('plan_does_not_exist'), null);
});

test('listPlansByUser returns ONLY rows matching the given userId', async () => {
  await savePlan(buildPlan({ user_id: 'admin', plan: fakePlan() }));
  await savePlan(buildPlan({ user_id: 'admin', plan: fakePlan() }));
  await savePlan(buildPlan({ user_id: 'someone_else', plan: fakePlan() }));

  const adminPlans = await listPlansByUser('admin');
  assert.equal(adminPlans.length, 2);
  assert.ok(adminPlans.every((p: Plan) => p.user_id === 'admin'), 'no other user leaks in');

  const otherPlans = await listPlansByUser('someone_else');
  assert.equal(otherPlans.length, 1);
});

test('listPlansByUser is newest-first', async () => {
  await savePlan(buildPlan({ user_id: 'admin', plan: fakePlan() }, new Date('2026-06-01T00:00:00.000Z')));
  await savePlan(buildPlan({ user_id: 'admin', plan: fakePlan() }, new Date('2026-06-03T00:00:00.000Z')));
  const list = await listPlansByUser('admin');
  assert.equal(list[0].created_at, '2026-06-03T00:00:00.000Z');
});

// Stage-0 type check: the ownership types accept an optional user_id, AND existing
// construction WITHOUT user_id still compiles (additive, non-breaking).
test('ownership types expose an optional user_id (additive, unused this stage)', () => {
  const run: Pick<GovernanceRun, 'runId' | 'user_id'> = { runId: 'r1', user_id: 'admin' };
  const withOwner: Ga4MetricDaily = { propertyId: '1', metricName: 'eventCount', dimensionValue: '', date: '2026-06-01', value: 5, fetchedAt: '2026-06-01T00:00:00.000Z', user_id: 'admin' };
  const noOwner: Ga4MetricDaily = { propertyId: '1', metricName: 'eventCount', dimensionValue: '', date: '2026-06-01', value: 5, fetchedAt: '2026-06-01T00:00:00.000Z' };
  assert.equal(run.user_id, 'admin');
  assert.equal(withOwner.user_id, 'admin');
  assert.equal(noOwner.user_id, undefined);
});
