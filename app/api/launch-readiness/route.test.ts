/* eslint-disable @typescript-eslint/no-explicit-any */
// Route-level INTEGRATION test for app/api/launch-readiness/route.ts.
//
// Drives the REAL POST handler, mocking ONLY the boundaries: rate-limit,
// next/server, and the Playwright capture (@/lib/measurement/live-capture). The
// gate (deterministic checks, evaluateReadiness, projections, decision) runs for
// real. Mocking '@/lib/measurement/live-capture' also intercepts the dynamic
// import('./live-capture.ts') inside launch-readiness.ts (same resolved URL), so
// the live path is exercised without launching a browser.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

// ─── Mutable spy/control state (reset per test, mocks registered once) ───
let rateLimit: any = { allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 };
let captureResult: any = { url: 'https://staging.example.com', events: [], rawHitCount: 0 };

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => rateLimit,
    rateLimitHeaders: () => ({}),
  },
});

mockModule('@/lib/measurement/live-capture', {
  namedExports: {
    captureObservedSignals: async () => captureResult,
  },
});

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

// A coherent ecommerce MeasurementPlan (with meta) — every deterministic check passes.
function goodPlan() {
  return {
    meta: {
      url: 'https://shop.example.com',
      businessModel: 'ecommerce',
      vertical: 'retail',
      generatedAt: '2026-06-01T00:00:00.000Z',
      schemaVersion: '1.0.0',
      classificationConfidence: 0.9,
    },
    kpis: [{ id: 'kpi_revenue', name: 'Revenue', description: '', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] }],
    events: [
      { id: 'evt_page_view', name: 'page_view', category: 'page', description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      {
        id: 'evt_purchase',
        name: 'purchase',
        category: 'ecommerce',
        description: '',
        trigger: '',
        isKeyEvent: true,
        requiresConsent: true,
        parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }],
      },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 3, notes: '' } },
  };
}

beforeEach(() => {
  rateLimit = { allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 };
  captureResult = { url: 'https://staging.example.com', events: [], rawHitCount: 0 };
});

// ─── Validation guards ───

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

test('bad deployedSiteUrl → 400', async () => {
  const res = await POST(makeReq({ plan: goodPlan(), deployedSiteUrl: 'not-a-url' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /http/);
});

test('rate limited → 429, gate not run', async () => {
  rateLimit = { allowed: false, limit: 5, remaining: 0, reset: Date.now() + 1_800_000 };
  const res = await POST(makeReq({ plan: goodPlan() }));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).success, false);
});

// ─── Deterministic path (no deployedSiteUrl, no browser) ───

test('coherent plan, no deployedSiteUrl → 200, go_with_warnings, 9 skipped', async () => {
  const res = await POST(makeReq({ plan: goodPlan() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.report.decision, 'go_with_warnings');
  assert.deepEqual(body.report.blockingFailures, []);
  assert.equal(body.report.skipped.length, 9); // all 9 live checks skipped
  assert.equal(body.report.meta.businessModel, 'ecommerce');
});

test('deterministic blocking failure → 200 with no_go (no key event)', async () => {
  const plan = goodPlan();
  plan.events[1].isKeyEvent = false;
  plan.tooling.ga4.keyEvents = [];
  const res = await POST(makeReq({ plan }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report.decision, 'no_go');
  assert.ok(body.report.blockingFailures.includes('plan_has_key_event'));
});

// ─── Live path (deployedSiteUrl + mocked capture, no real browser) ───

test('deployedSiteUrl present → capture mocked, 4 deployed checks projected (5 skipped)', async () => {
  captureResult = {
    url: 'https://staging.example.com',
    rawHitCount: 5,
    consentBannerDetected: true,
    consentAccepted: true,
    events: [
      { name: 'page_view', vendor: 'GA4', parameters: [], count: 1 },
      { name: 'purchase', vendor: 'GA4', destinationId: 'G-X', parameters: ['value'], count: 1 },
    ],
  };
  const res = await POST(makeReq({ plan: goodPlan(), deployedSiteUrl: 'https://staging.example.com' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.report.skipped.length, 5); // only the 5 OAuth checks remain skipped
  const planned = body.report.checks.find((c: any) => c.id === 'planned_events_fire');
  assert.equal(planned.status, 'pass');
  const snippet = body.report.checks.find((c: any) => c.id === 'tracking_snippet_present');
  assert.equal(snippet.status, 'pass');
});

test('deployedSiteUrl present but capture sees nothing → no_go (tracking_snippet_present fail)', async () => {
  captureResult = { url: 'https://staging.example.com', events: [], rawHitCount: 0 };
  const res = await POST(makeReq({ plan: goodPlan(), deployedSiteUrl: 'https://staging.example.com' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report.decision, 'no_go');
  assert.ok(body.report.blockingFailures.includes('tracking_snippet_present'));
});
