/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for /api/governance/check. Mocks the boundaries (rate-limit,
// next/server, the operator gate, and the Google token/GA4 readers — the latter
// two intercept the gate's dynamic imports). Verifies validation, the SAME
// operator gating as launch-readiness, and the operator path returning a report.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let operator = false;
let ga4Config: any = { propertyExists: true, displayName: 'MYNTRA', keyEventNames: ['purchase'], customDimensionParameters: [] };

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
  },
});
mockModule('@/lib/auth', { namedExports: { isOperatorRequest: async () => operator } });
// These intercept the gate's dynamic imports (../google/token-store, ./ga4-config).
mockModule('@/lib/google/token-store', { namedExports: { getValidAccessToken: async () => 'fake-token' } });
mockModule('@/lib/measurement/ga4-config', { namedExports: { fetchGa4Config: async () => ga4Config } });
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        });
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
  ga4Config = { propertyExists: true, displayName: 'MYNTRA', keyEventNames: ['purchase'], customDimensionParameters: [] };
});

test('no plan → 400', async () => {
  const res = await POST(makeReq({}));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Provide a generated plan/);
});

test('invalid plan (non-snake_case event) → 400', async () => {
  const plan = goodPlan();
  plan.events[1].name = 'AddToCart';
  const res = await POST(makeReq({ plan }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Invalid plan.*snake_case/);
});

test('plan missing meta → 400', async () => {
  const plan = goodPlan() as any;
  delete plan.meta;
  const res = await POST(makeReq({ plan }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /missing meta/);
});

test('anonymous caller cannot inject ga4 connector → GA4 checks stay skipped', async () => {
  operator = false;
  const res = await POST(makeReq({ plan: goodPlan(), ga4: { propertyId: '123456' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.report.checks.find((c: any) => c.id === 'ga4_property_exists').status, 'skipped');
});

test('operator path returns a real report — GA4 config check resolves, no browser checks run', async () => {
  operator = true;
  const res = await POST(makeReq({ plan: goodPlan(), ga4: { propertyId: '123456' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.report.checks.find((c: any) => c.id === 'ga4_property_exists').status, 'pass');
  assert.equal(body.report.checks.find((c: any) => c.id === 'ga4_key_events_registered').status, 'pass');
  // governance never spawns a browser → deployed-site checks stay skipped.
  assert.equal(body.report.checks.find((c: any) => c.id === 'tracking_snippet_present').status, 'skipped');
});
