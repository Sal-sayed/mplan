/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for POST /api/metrics/fetch-scheduled. Mocks the store
// (listLatestRuns/saveMetrics), the token (token-store), and the GA4 reader
// (ga4-data). Verifies the MONITOR_SECRET gate, per-property isolation, mapping
// to metric rows, and graceful skip when Google isn't connected.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let persistedRuns: any[] = [];
let tokenThrows = false;
let ga4ThrowsForProp: string | null = null;
let ga4ReportByProp: Record<string, any> = {};
let savedBatches: any[][] = [];

mockModule('@/lib/measurement/governance-store', { namedExports: { listLatestRuns: async () => persistedRuns } });
mockModule('@/lib/google/token-store', {
  namedExports: {
    getValidAccessToken: async () => {
      if (tokenThrows) throw new Error('Google account not connected');
      return 'fake-token';
    },
  },
});
mockModule('@/lib/measurement/ga4-data', {
  namedExports: {
    runGa4Report: async (req: any) => {
      if (ga4ThrowsForProp && req.propertyId === ga4ThrowsForProp) throw new Error('GA4 boom');
      return ga4ReportByProp[req.propertyId] ?? { dimensionHeaders: ['date', 'eventName'], metricHeaders: ['eventCount'], rows: [] };
    },
  },
});
mockModule('@/lib/measurement/metric-store', { namedExports: { saveMetrics: async (rows: any[]) => { savedBatches.push(rows); } } });
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number }) {
        return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } });
      },
    },
  },
});

const { POST } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response> };

const makeReq = (body: any, headers: Record<string, string> = {}) => ({
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const runWithProp = (propertyId: string) => ({ siteUrl: `https://${propertyId}.example.com`, planKey: 'k', connectors: { ga4: { propertyId } } });

beforeEach(() => {
  process.env.MONITOR_SECRET = 'topsecret';
  persistedRuns = [];
  tokenThrows = false;
  ga4ThrowsForProp = null;
  ga4ReportByProp = {};
  savedBatches = [];
});

test('unset MONITOR_SECRET → 500', async () => {
  delete process.env.MONITOR_SECRET;
  const res = await POST(makeReq({}, auth('x')));
  assert.equal(res.status, 500);
});

test('wrong secret → 401 (timing-safe)', async () => {
  persistedRuns = [runWithProp('111')];
  const res = await POST(makeReq({}, auth('wrong')));
  assert.equal(res.status, 401);
  assert.equal(savedBatches.length, 0);
});

test('missing auth header → 401', async () => {
  const res = await POST(makeReq({}, {}));
  assert.equal(res.status, 401);
});

test('no persisted properties → 200, empty results', async () => {
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).results, []);
});

test('maps runReport rows to metric records and saves them', async () => {
  persistedRuns = [runWithProp('111')];
  ga4ReportByProp['111'] = {
    dimensionHeaders: ['date', 'eventName'],
    metricHeaders: ['eventCount'],
    rows: [{ dimensionValues: ['20260610', 'purchase'], metricValues: ['5'] }],
  };
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  assert.equal(savedBatches.length, 1);
  const row = savedBatches[0][0];
  assert.equal(row.propertyId, '111');
  assert.equal(row.metricName, 'eventCount');
  assert.equal(row.dimensionValue, 'purchase');
  assert.equal(row.date, '2026-06-10'); // YYYYMMDD → YYYY-MM-DD
  assert.equal(row.value, 5);
});

test('per-property isolation: one property failing does not abort the others', async () => {
  persistedRuns = [runWithProp('bad'), runWithProp('good')];
  ga4ThrowsForProp = 'bad';
  ga4ReportByProp['good'] = { dimensionHeaders: ['date', 'eventName'], metricHeaders: ['eventCount'], rows: [{ dimensionValues: ['20260610', 'purchase'], metricValues: ['3'] }] };
  const res = await POST(makeReq({}, auth('topsecret')));
  const body = await res.json();
  assert.equal(body.results.length, 2);
  assert.ok(body.results.find((r: any) => r.propertyId === 'bad').error);
  assert.equal(body.results.find((r: any) => r.propertyId === 'good').rowsSaved, 1);
  assert.equal(savedBatches.length, 1); // only the good property persisted
});

test('Google not connected → graceful skip, no crash', async () => {
  persistedRuns = [runWithProp('111')];
  tokenThrows = true;
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.results[0].skipped, true);
  assert.equal(savedBatches.length, 0);
});

test('dedupes properties across persisted runs', async () => {
  persistedRuns = [runWithProp('111'), runWithProp('111')];
  ga4ReportByProp['111'] = { dimensionHeaders: ['date', 'eventName'], metricHeaders: ['eventCount'], rows: [] };
  const res = await POST(makeReq({}, auth('topsecret')));
  const body = await res.json();
  assert.equal(body.results.length, 1, 'one property despite two runs');
});
