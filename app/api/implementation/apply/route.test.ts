/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for /api/implementation/apply (Phase B write). Mocks auth, token
// status/token, the orchestration, rate-limit, next/server. validateMeasurementPlan
// runs for real. Verifies owner gating, the write-scope requirement (409), input
// validation, and the success path — and that it surfaces published:false.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GTM_WRITE_SCOPE } from '@/lib/google/oauth';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let ownerId: string | null = 'admin';
let scopes: string[] = [GTM_WRITE_SCOPE, 'https://www.googleapis.com/auth/analytics.readonly'];
let applyCalls: any[] = [];

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
  },
});
mockModule('@/lib/auth', { namedExports: { resolveConnectOwnerId: async () => ownerId } });
mockModule('@/lib/google/token-store', {
  namedExports: {
    getStatus: async () => ({ connected: scopes.length > 0, scopes }),
    getValidAccessToken: async () => 'fake-token',
  },
});
mockModule('@/lib/measurement/gtm-apply', {
  namedExports: {
    applyPlanToGtm: async (inp: any) => {
      applyCalls.push(inp);
      return { workspaceName: 'Sirah — shop.example.com — 2026-06-14', reviewUrl: 'https://tagmanager.google.com/#/container/accounts/1/containers/2/workspaces/3', created: { variables: ['dlv.value'], triggers: ['purchase trigger', 'page_view trigger'], tags: ['GA4 — purchase', 'GA4 — page_view'] }, skipped: { variables: [], triggers: [], tags: [] }, failures: [], published: false, note: 'unpublished' };
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
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 2, notes: '' } },
  };
}
const body = (over: any = {}) => ({ plan: goodPlan(), gtm: { containerId: 'GTM-ABC123' }, measurementId: 'G-ABC123', ...over });

beforeEach(() => {
  ownerId = 'admin';
  scopes = [GTM_WRITE_SCOPE, 'https://www.googleapis.com/auth/analytics.readonly'];
  applyCalls = [];
});

test('not signed in → 401, nothing applied', async () => {
  ownerId = null;
  const res = await POST(makeReq(body()));
  assert.equal(res.status, 401);
  assert.equal(applyCalls.length, 0);
});

test('signed in but NO write scope → 409 needsWriteConnect, nothing applied', async () => {
  scopes = ['https://www.googleapis.com/auth/analytics.readonly']; // read-only
  const res = await POST(makeReq(body()));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).needsWriteConnect, true);
  assert.equal(applyCalls.length, 0);
});

test('invalid container id → 400', async () => {
  const res = await POST(makeReq(body({ gtm: { containerId: 'not-a-container' } })));
  assert.equal(res.status, 400);
});

test('invalid measurement id → 400', async () => {
  const res = await POST(makeReq(body({ measurementId: '123456' })));
  assert.equal(res.status, 400);
});

test('missing/invalid plan → 400', async () => {
  const res = await POST(makeReq({ gtm: { containerId: 'GTM-ABC' }, measurementId: 'G-ABC' }));
  assert.equal(res.status, 400);
});

test('owner + write scope + valid → 200, applies, published:false', async () => {
  const res = await POST(makeReq(body()));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.result.published, false);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].containerId, 'GTM-ABC123');
  assert.equal(applyCalls[0].measurementId, 'G-ABC123');
});
