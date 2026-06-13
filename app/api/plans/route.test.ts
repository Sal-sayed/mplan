/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for /api/plans (saved-plan history). Mocks rate-limit, the session,
// the plans-store, and next/server. validateMeasurementPlan runs for real.
// Verifies sign-in gating, save, list, and the OWNERSHIP check on get-by-id —
// the plan-isolation checkpoint (one user can't fetch another's plan).

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let sessionUser: any = null;
let stored: any[] = [];

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
  },
});
mockModule('@/lib/auth', { namedExports: { getSessionUser: async () => sessionUser } });
mockModule('@/lib/measurement/plans-store', {
  namedExports: {
    buildPlan: (input: any) => ({ id: 'plan_test', user_id: input.user_id, site_url: input.site_url, business_model: input.business_model, plan: input.plan, created_at: '2026-06-13T00:00:00.000Z' }),
    savePlan: async (p: any) => { stored.push(p); },
    getPlan: async (id: string) => stored.find((p) => p.id === id) ?? null,
    listPlansByUser: async (userId: string) => stored.filter((p) => p.user_id === userId),
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

const { POST, GET } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response>; GET: (req: any) => Promise<Response> };
const postReq = (body: any) => ({ json: async () => body, url: 'http://localhost/api/plans' });
const getReq = (id?: string) => ({ url: `http://localhost/api/plans${id ? `?id=${id}` : ''}` });

function goodPlan(url = 'https://shop.example.com') {
  return {
    meta: { url, businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
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
  sessionUser = null;
  stored = [];
});

test('POST without a session → 401, nothing saved', async () => {
  const res = await POST(postReq({ plan: goodPlan() }));
  assert.equal(res.status, 401);
  assert.equal(stored.length, 0);
});

test('POST signed in → saves the plan owned by the user', async () => {
  sessionUser = { user_id: 'user_A' };
  const res = await POST(postReq({ plan: goodPlan() }));
  assert.equal(res.status, 200);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].user_id, 'user_A');
});

test('POST invalid plan → 400', async () => {
  sessionUser = { user_id: 'user_A' };
  const plan = goodPlan();
  (plan.events[1] as any).name = 'Purchase'; // not snake_case
  const res = await POST(postReq({ plan }));
  assert.equal(res.status, 400);
});

test('GET list returns ONLY the caller’s plans', async () => {
  stored = [
    { id: 'p1', user_id: 'user_A', site_url: 'https://a.com', business_model: 'ecommerce', plan: goodPlan(), created_at: '2026-06-12T00:00:00.000Z' },
    { id: 'p2', user_id: 'user_B', site_url: 'https://b.com', business_model: 'saas', plan: goodPlan(), created_at: '2026-06-12T00:00:00.000Z' },
  ];
  sessionUser = { user_id: 'user_A' };
  const body = await (await GET(getReq())).json();
  assert.equal(body.plans.length, 1);
  assert.equal(body.plans[0].id, 'p1');
});

test('GET ?id for an OWNED plan returns its MeasurementPlan', async () => {
  stored = [{ id: 'p1', user_id: 'user_A', site_url: 'https://a.com', business_model: 'ecommerce', plan: goodPlan(), created_at: '2026-06-12T00:00:00.000Z' }];
  sessionUser = { user_id: 'user_A' };
  const res = await GET(getReq('p1'));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).plan.meta);
});

test('CHECKPOINT: GET ?id for ANOTHER user’s plan → 404 (no cross-user access)', async () => {
  stored = [{ id: 'p1', user_id: 'user_A', site_url: 'https://a.com', business_model: 'ecommerce', plan: goodPlan(), created_at: '2026-06-12T00:00:00.000Z' }];
  sessionUser = { user_id: 'user_B' }; // not the owner
  const res = await GET(getReq('p1'));
  assert.equal(res.status, 404, "another user's plan is invisible");
});

test('GET without a session → 401', async () => {
  const res = await GET(getReq());
  assert.equal(res.status, 401);
});
