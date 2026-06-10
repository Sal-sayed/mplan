/* eslint-disable @typescript-eslint/no-explicit-any */
// Route-level INTEGRATION test for app/api/generate-plan/route.ts.
//
// Drives the REAL POST handler end to end, mocking ONLY the external boundaries
// (rate-limit, the SSE stream builder, the Gemini client, and next/server). The
// measurement pipeline (classification gate, prompt build, finalize/validate,
// meta stamping) runs for real — that's the glue the unit tests never exercise.
//
// Mechanics (see the three non-obvious facts in the task brief):
//  - mock.module needs --experimental-test-module-mocks (set in the test script).
//  - "@/..." specifiers are resolved by test/resolve-alias.mjs (registered via
//    --import ./test/setup.mjs) before substitution.
//  - mock.module is URL-keyed: mocking "@/lib/gemini" also intercepts
//    generate-plan.ts's relative "../gemini.ts" (same file), so the gemini mock
//    exports EVERY binding any importer needs (getGeminiModel + geminiGenerate).

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// node:test's mock.module is experimental and may be untyped depending on the
// @types/node version — reach it through a narrow cast so tsc stays happy.
type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

// ─── Spy state for the stream seam (reset per test, not re-registered) ───
let streamCalls = 0;
let lastStreamOpts: any = null;

// ─── Mock ONLY the boundaries, ONCE at module top level ───

mockModule('@/lib/rate-limit', {
  namedExports: {
    getClientIdentifier: () => 'test-client',
    checkRateLimit: async () => ({
      allowed: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 3_600_000,
    }),
    rateLimitHeaders: () => ({}),
  },
});

mockModule('@/lib/claude-stream', {
  namedExports: {
    buildClaudeSseStream: (opts: any) => {
      streamCalls += 1;
      lastStreamOpts = opts;
      return new ReadableStream({ start(c) { c.close(); } });
    },
    streamResponseHeaders: () => ({}),
  },
});

mockModule('@/lib/gemini', {
  namedExports: {
    getGeminiModel: () => 'gemini-2.5-flash',
    // Must exist (URL-keyed mock also feeds generate-plan.ts) but must never run
    // on the route path — the route streams via buildClaudeSseStream instead.
    geminiGenerate: async () => {
      throw new Error('geminiGenerate must not be called in the route integration test');
    },
  },
});

mockModule('next/server', {
  namedExports: {
    // Bare class — the route only annotates `req: NextRequest`.
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

// Import the handler AFTER mocks are registered.
const { POST } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response> };

// Minimal request: the route only calls req.json() and getClientIdentifier(req).
const makeReq = (body: any) => ({ json: async () => body });

// A structurally valid plan BODY (no meta — meta is stamped server-side).
function goodPlanBody() {
  return {
    kpis: [
      { id: 'kpi_revenue', name: 'Revenue', description: 'Total purchase value.', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] },
    ],
    events: [
      {
        id: 'evt_purchase',
        name: 'purchase',
        category: 'ecommerce',
        description: 'A completed purchase.',
        trigger: 'Order confirmation page load.',
        isKeyEvent: true,
        requiresConsent: true,
        parameters: [{ name: 'value', type: 'number', required: true, description: 'Order total.', source: 'dataLayer' }],
      },
    ],
    dataLayer: [
      { key: 'value', type: 'number', description: 'Order total.', example: '49.99', usedByEventIds: ['evt_purchase'] },
    ],
    consent: { categoriesUsed: ['analytics'], consentModeRequired: true, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 3, notes: '' } },
  };
}

const ECOMMERCE_BODY = {
  url: 'https://shop.example.com',
  pages: [{ path: '/product/widget' }, { path: '/cart' }, { path: '/checkout' }],
  forms: [{ action: '/checkout', fields: ['email'], purpose: 'checkout' }],
};

beforeEach(() => {
  streamCalls = 0;
  lastStreamOpts = null;
});

// ─── a) Confident path: 200, real prompt + real finalize through postProcess ───
test('confident ecommerce → 200, streams, real buildPlanPrompt + finalize/stamp', async () => {
  const res = await POST(makeReq(ECOMMERCE_BODY));

  assert.equal(res.status, 200);
  assert.equal(streamCalls, 1, 'stream seam invoked exactly once');
  assert.ok(lastStreamOpts, 'stream opts captured');
  assert.equal(lastStreamOpts.model, 'gemini-2.5-flash');

  // REAL buildPlanPrompt output flowed through the route.
  const systemText = (lastStreamOpts.system as any[]).map((s) => s.text).join('\n');
  assert.match(systemText, /GA4/);
  assert.match(lastStreamOpts.userMessage, /shop\.example\.com/);

  // Calling postProcess runs the REAL finalize (validate + server-stamped meta).
  const out = lastStreamOpts.postProcess(goodPlanBody());
  assert.equal(out.success, true);
  assert.equal(out.classification.businessModel, 'ecommerce');
  assert.equal(out.plan.events[0].name, 'purchase');

  // meta is authoritative / server-stamped — never trusted from the model.
  assert.equal(out.plan.meta.url, 'https://shop.example.com');
  assert.equal(out.plan.meta.businessModel, 'ecommerce');
  assert.equal(out.plan.meta.schemaVersion, '1.0.0');
  assert.ok(!Number.isNaN(Date.parse(out.plan.meta.generatedAt)), 'generatedAt is ISO');
});

// ─── b) Real validator fires through the route's postProcess ───
test('postProcess rejects a non-snake_case event name (real validator)', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  assert.ok(lastStreamOpts, 'stream opts captured');

  const bad = goodPlanBody();
  bad.events[0].name = 'AddToCart';
  assert.throws(() => lastStreamOpts.postProcess(bad), /snake_case/);
});

// ─── c) Low confidence: 409 confirm branch, stream NOT called ───
test('signal-free brief → 409 needsConfirmation, no stream', async () => {
  const res = await POST(makeReq({ brief: 'hello world' }));

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.needsConfirmation, true);
  assert.equal(body.classification.businessModel, 'lead_gen');
  assert.equal(body.classification.confidence, 0);
  assert.equal(streamCalls, 0, 'stream seam NOT called on the 409 path');
});

// ─── d) Override bypasses the gate ───
test('businessModel override → 200, classification forced to saas at confidence 1', async () => {
  const res = await POST(makeReq({ brief: 'hello world', businessModel: 'saas' }));

  assert.equal(res.status, 200);
  assert.equal(streamCalls, 1);
  const out = lastStreamOpts.postProcess(goodPlanBody());
  assert.equal(out.classification.businessModel, 'saas');
  assert.equal(out.classification.confidence, 1);
});

// ─── e) Guard: no url and no brief → 400, stream NOT called ───
test('empty body → 400, no stream', async () => {
  const res = await POST(makeReq({}));

  assert.equal(res.status, 400);
  assert.equal(streamCalls, 0, 'stream seam NOT called on the 400 path');
});
