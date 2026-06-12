/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for POST /api/metrics/validate. Mocks rate-limit, the operator gate,
// the validator (validateMetrics), and next/server. validateMeasurementPlan runs
// for real over a good plan. Verifies plan validation, operator gating of the
// property, per-key-event validation, and the no-property quiet path.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let operator = false;
let verdictByEvent: Record<string, any> = {};
let validateCalls: any[] = [];

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
  },
});
mockModule('@/lib/auth', { namedExports: { isOperatorRequest: async () => operator } });
mockModule('@/lib/measurement/data-validation', {
  namedExports: {
    validateMetrics: async (target: any) => {
      validateCalls.push(target);
      return verdictByEvent[target.dimensionValue] ?? { verdict: 'ok', daysObserved: 7, summary: 'steady' };
    },
  },
});
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

function goodPlan() {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [{ id: 'kpi_rev', name: 'Revenue', description: '', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] }],
    events: [
      { id: 'evt_pv', name: 'page_view', category: 'page', description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: '', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 3, notes: '' } },
  };
}

beforeEach(() => {
  operator = false;
  verdictByEvent = {};
  validateCalls = [];
});

test('no plan → 400', async () => {
  const res = await POST(makeReq({}));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Provide a generated plan/);
});

test('invalid plan (non-snake_case event) → 400', async () => {
  const plan = goodPlan();
  plan.events[1].name = 'Purchase';
  const res = await POST(makeReq({ plan }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Invalid plan/);
});

test('anonymous caller cannot use the property → propertyChecked:false, no validation', async () => {
  operator = false;
  const res = await POST(makeReq({ plan: goodPlan(), ga4: { propertyId: '123456' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.propertyChecked, false);
  assert.deepEqual(body.results, []);
  assert.equal(validateCalls.length, 0);
});

test('operator without a property → propertyChecked:false', async () => {
  operator = true;
  const res = await POST(makeReq({ plan: goodPlan() }));
  const body = await res.json();
  assert.equal(body.propertyChecked, false);
  assert.deepEqual(body.results, []);
});

test('operator + property → validates each KEY event and tags the result', async () => {
  operator = true;
  verdictByEvent['purchase'] = { verdict: 'regression', daysObserved: 7, finding: { kind: 'zero_fire', metricName: 'eventCount', severity: 'critical', date: '2026-06-11', latestValue: 0, baselineAvg: 8, detail: 'purchase fired 0' }, summary: 'purchase stopped firing' };
  const res = await POST(makeReq({ plan: goodPlan(), ga4: { propertyId: '123456' } }));
  const body = await res.json();
  assert.equal(body.propertyChecked, true);
  assert.equal(body.results.length, 1, 'only the one key event (purchase) is validated, not page_view');
  assert.equal(body.results[0].eventName, 'purchase');
  assert.equal(body.results[0].verdict, 'regression');
  // validateMetrics was called for the key event by GA4 event NAME.
  assert.equal(validateCalls[0].dimensionValue, 'purchase');
  assert.equal(validateCalls[0].metricName, 'eventCount');
  assert.equal(validateCalls[0].propertyId, '123456');
});
