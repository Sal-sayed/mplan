/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for POST /api/metrics/backfill. Mocks rate-limit, the operator gate,
// the token, the GA4 reader, the store, and next/server. Verifies operator
// gating, date-range validation, row mapping to history, and the Google-not-
// connected path.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let operator = false;
let tokenThrows = false;
let lastReportReq: any = null;
let reportRows: any[] = [];
let savedBatches: any[][] = [];

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
  },
});
mockModule('@/lib/auth', { namedExports: { isOperatorRequest: async () => operator } });
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
      lastReportReq = req;
      return { dimensionHeaders: ['date', 'eventName'], metricHeaders: ['eventCount'], rows: reportRows };
    },
  },
});
mockModule('@/lib/measurement/metric-store', { namedExports: { saveMetrics: async (rows: any[]) => { savedBatches.push(rows); } } });
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
        return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
      },
    },
  },
});

const { POST } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response> };
const makeReq = (body: any) => ({ json: async () => body });

beforeEach(() => {
  operator = false;
  tokenThrows = false;
  lastReportReq = null;
  reportRows = [];
  savedBatches = [];
});

test('non-operator → 403, nothing saved', async () => {
  const res = await POST(makeReq({ ga4: { propertyId: '123' }, startDate: '2026-01-01', endDate: '2026-01-31' }));
  assert.equal(res.status, 403);
  assert.equal(savedBatches.length, 0);
});

test('operator without a property → 400', async () => {
  operator = true;
  const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /property id/i);
});

test('bad date format → 400', async () => {
  operator = true;
  const res = await POST(makeReq({ ga4: { propertyId: '123' }, startDate: '01/01/2026', endDate: '2026-01-31' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /YYYY-MM-DD/);
});

test('start after end → 400', async () => {
  operator = true;
  const res = await POST(makeReq({ ga4: { propertyId: '123' }, startDate: '2026-02-01', endDate: '2026-01-01' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /on or before/);
});

test('Google not connected → 409, nothing saved', async () => {
  operator = true;
  tokenThrows = true;
  const res = await POST(makeReq({ ga4: { propertyId: '123' }, startDate: '2026-01-01', endDate: '2026-01-31' }));
  assert.equal(res.status, 409);
  assert.equal(savedBatches.length, 0);
});

test('operator + valid range → fetches the range, maps rows, saves history', async () => {
  operator = true;
  reportRows = [
    { dimensionValues: ['20260101', 'purchase'], metricValues: ['12'] },
    { dimensionValues: ['20260102', 'purchase'], metricValues: ['9'] },
  ];
  const res = await POST(makeReq({ ga4: { propertyId: '123456' }, startDate: '2026-01-01', endDate: '2026-01-31' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.rowsSaved, 2);
  assert.deepEqual(body.range, { startDate: '2026-01-01', endDate: '2026-01-31' });
  // The chosen range was passed straight to the reader.
  assert.deepEqual(lastReportReq.dateRange, { startDate: '2026-01-01', endDate: '2026-01-31' });
  // Rows mapped to the store shape (YYYYMMDD → YYYY-MM-DD, numeric value).
  assert.equal(savedBatches.length, 1);
  assert.deepEqual(savedBatches[0][0], { propertyId: '123456', metricName: 'eventCount', dimensionValue: 'purchase', date: '2026-01-01', value: 12, fetchedAt: savedBatches[0][0].fetchedAt });
});
