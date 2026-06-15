/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for /api/implementation/proposal. Mocks rate-limit + next/server;
// validateMeasurementPlan and buildImplementationProposal run for real.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({ allowed: true, limit: 999, remaining: 999, reset: Date.now() + 3_600_000 }),
    rateLimitHeaders: () => ({}),
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
      { id: 'evt_pv', name: 'page_view', category: 'page', description: 'Standard page view.', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: 'The revenue event.', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 2, notes: '' } },
  };
}

test('valid plan → 200 with a proposal of one item per event', async () => {
  const res = await POST(makeReq({ plan: goodPlan() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.proposal.items.length, 2);
  assert.equal(body.proposal.items[0].eventName, 'purchase'); // key event first
});

test('missing plan → 400', async () => {
  const res = await POST(makeReq({}));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Provide a generated plan/);
});

test('invalid plan (non-snake_case event) → 400', async () => {
  const plan = goodPlan();
  (plan.events[1] as any).name = 'Purchase';
  const res = await POST(makeReq({ plan }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Invalid plan/);
});
