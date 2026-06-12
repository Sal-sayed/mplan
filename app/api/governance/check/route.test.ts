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

// ─── governance-store mock state (persistence is additive) ───
let savedRuns: any[] = [];
let priorRun: any = null;
let saveThrows = false;

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
// Persistence boundary — mocked so the route's additive store calls are
// observable without a real Supabase. diffReports is NOT mocked (it's pure).
mockModule('@/lib/measurement/governance-store', {
  namedExports: {
    planKeyFor: () => 'test-plan-key',
    buildGovernanceRun: (report: any, plan: any, connectors: any) => ({
      runId: 'run_test', siteUrl: report.meta.url, planKey: 'test-plan-key', createdAt: '2026-06-12T00:00:00.000Z', decision: report.decision, report, plan, connectors,
    }),
    saveRun: async (run: any) => {
      if (saveThrows) throw new Error('storage down');
      savedRuns.push(run);
    },
    getLatestRun: async () => priorRun,
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
  savedRuns = [];
  priorRun = null;
  saveThrows = false;
});

// A prior stored run whose report differs from the current one, so a
// compareToLast call produces a defined drift via the real diffReports.
function priorGovernanceRun() {
  return {
    runId: 'run_prior',
    siteUrl: 'https://shop.example.com',
    planKey: 'test-plan-key',
    createdAt: '2026-06-01T00:00:00.000Z',
    decision: 'no_go',
    report: {
      meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', planSchemaVersion: '1.0.0', readinessSchemaVersion: '0.1.0', generatedAt: '2026-06-01T00:00:00.000Z' },
      decision: 'no_go',
      checks: [{ id: 'event_ids_unique', category: 'events', name: 'Event IDs are unique', status: 'fail', blocking: true, dependsOn: 'plan', summary: '' }],
      blockingFailures: ['event_ids_unique'],
      warnings: [],
      skipped: [],
      approval: { required: false },
    },
  };
}

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

// ─── Persistence (additive) ───

test('default call (no options) stores nothing and returns no drift', async () => {
  const res = await POST(makeReq({ plan: goodPlan() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.report, 'report present');
  assert.equal(body.drift, undefined, 'no drift on default call');
  assert.equal(savedRuns.length, 0, 'nothing persisted by default');
});

test('persist:true stores a run', async () => {
  const res = await POST(makeReq({ plan: goodPlan(), persist: true }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(savedRuns.length, 1, 'one run persisted');
  assert.equal(savedRuns[0].siteUrl, 'https://shop.example.com');
});

test('compareToLast with a prior run returns drift', async () => {
  priorRun = priorGovernanceRun();
  const res = await POST(makeReq({ plan: goodPlan(), compareToLast: true }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.drift, 'drift present when a prior run exists');
  assert.ok(['ok', 'regression', 'inconclusive'].includes(body.drift.verdict));
});

test('first-ever run (no prior) returns the report with no drift', async () => {
  priorRun = null;
  const res = await POST(makeReq({ plan: goodPlan(), compareToLast: true, persist: true }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.report, 'report present');
  assert.equal(body.drift, undefined, 'no drift on the first run');
  assert.equal(savedRuns.length, 1, 'first run is still persisted');
});

test('a storage failure still returns the report (no dead-end)', async () => {
  saveThrows = true;
  const res = await POST(makeReq({ plan: goodPlan(), persist: true }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.report, 'report returned despite the storage failure');
});
