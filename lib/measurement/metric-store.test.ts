/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for metric-store. Mocks @supabase/supabase-js (in-memory, PK-upsert)
// and fs/promises (no disk) — mirrors the governance-store test boundary mocks.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

const PK = ['property_id', 'metric_name', 'dimension_value', 'date'];
let rows: any[] = [];
function keyOf(r: any) {
  return PK.map((c) => r[c]).join('::');
}
function makeClient() {
  return {
    from() {
      let filtered = rows;
      const api: any = {
        upsert(incoming: any[]) {
          const byPk = new Map(rows.map((r) => [keyOf(r), r]));
          for (const r of incoming) byPk.set(keyOf(r), r); // PK upsert — no dupes
          rows.length = 0;
          rows.push(...byPk.values());
          return Promise.resolve({ error: null });
        },
        select() {
          return api;
        },
        eq(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] === val);
          return api;
        },
        gte(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] >= val);
          return api;
        },
        order(col: string, { ascending }: { ascending: boolean }) {
          const sorted = [...filtered].sort((a, b) => (ascending ? (a[col] > b[col] ? 1 : -1) : a[col] < b[col] ? 1 : -1));
          return Promise.resolve({ data: sorted, error: null });
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

const { saveMetrics, getMetricHistory } = await import('./metric-store.ts');
import type { Ga4MetricDaily } from './metric-store.ts';

function m(date: string, value: number, dimensionValue = 'purchase'): Ga4MetricDaily {
  return { propertyId: '123', metricName: 'eventCount', dimensionValue, date, value, fetchedAt: '2026-06-12T00:00:00.000Z' };
}

beforeEach(() => {
  rows = [];
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
});

test('saveMetrics then getMetricHistory round-trips, ordered by date ascending', async () => {
  await saveMetrics([m('2026-06-03', 8), m('2026-06-01', 5), m('2026-06-02', 6)]);
  const hist = await getMetricHistory({ propertyId: '123', metricName: 'eventCount', dimensionValue: 'purchase' });
  assert.deepEqual(hist.map((h) => h.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
  assert.deepEqual(hist.map((h) => h.value), [5, 6, 8]);
});

test('PK upsert does not duplicate — same (prop,metric,dim,date) overwrites', async () => {
  await saveMetrics([m('2026-06-01', 5)]);
  await saveMetrics([m('2026-06-01', 9)]); // same PK, new value
  const hist = await getMetricHistory({ propertyId: '123', metricName: 'eventCount', dimensionValue: 'purchase' });
  assert.equal(hist.length, 1);
  assert.equal(hist[0].value, 9);
});

test('getMetricHistory filters by dimensionValue and sinceDate', async () => {
  await saveMetrics([m('2026-06-01', 5, 'purchase'), m('2026-06-02', 7, 'purchase'), m('2026-06-02', 99, 'add_to_cart')]);
  const purchases = await getMetricHistory({ propertyId: '123', metricName: 'eventCount', dimensionValue: 'purchase', sinceDate: '2026-06-02' });
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].value, 7);
});

test('saveMetrics([]) is a no-op and getMetricHistory returns [] for unknown keys', async () => {
  await saveMetrics([]);
  const none = await getMetricHistory({ propertyId: 'nope', metricName: 'eventCount' });
  assert.deepEqual(none, []);
});

test('Stage 2: user_id round-trips through save → history (owner is carried)', async () => {
  await saveMetrics([{ ...m('2026-06-01', 5), user_id: 'admin' }]);
  const hist = await getMetricHistory({ propertyId: '123', metricName: 'eventCount', dimensionValue: 'purchase' });
  assert.equal(hist.length, 1);
  assert.equal(hist[0].user_id, 'admin', 'the owner is persisted and read back');
});
