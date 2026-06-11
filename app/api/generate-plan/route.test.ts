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
// Spy state for the server-side regenerate seam (geminiGenerate).
let geminiCalls = 0;
let geminiRetryBody: any = null; // what a regenerate returns; null → goodPlanBody()

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
    // One-shot SSE used by the templateOnly path — emit a real `complete` frame.
    streamInstantResult: (result: any) =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(`event: complete\ndata: ${JSON.stringify({ result, usage: {} })}\n\n`));
          c.close();
        },
      }),
  },
});

mockModule('@/lib/gemini', {
  namedExports: {
    getGeminiModel: () => 'gemini-2.5-flash',
    // Reachable on the route path now: finalizeStreamedOrRetry does a quiet
    // server-side regenerate via geminiGenerate when the streamed body fails
    // validation. Returns { text, usage } (like the real one); counts calls.
    geminiGenerate: async () => {
      geminiCalls += 1;
      return { text: JSON.stringify(geminiRetryBody ?? goodPlanBody()), usage: { input: 0, output: 0 } };
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
  geminiCalls = 0;
  geminiRetryBody = null;
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
  // postProcess is async now (it awaits finalizeStreamedOrRetry).
  const out = await lastStreamOpts.postProcess(goodPlanBody());
  assert.equal(out.success, true);
  assert.equal(out.classification.businessModel, 'ecommerce');
  assert.equal(out.plan.events[0].name, 'purchase');
  assert.equal(geminiCalls, 0, 'a valid streamed body needs no server-side regenerate');

  // meta is authoritative / server-stamped — never trusted from the model.
  assert.equal(out.plan.meta.url, 'https://shop.example.com');
  assert.equal(out.plan.meta.businessModel, 'ecommerce');
  assert.equal(out.plan.meta.schemaVersion, '1.0.0');
  assert.ok(!Number.isNaN(Date.parse(out.plan.meta.generatedAt)), 'generatedAt is ISO');
});

// ─── b) Real validator still fires — surfaces after the capped regenerate ───
test('postProcess surfaces a non-snake_case validation error after one regenerate', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  assert.ok(lastStreamOpts, 'stream opts captured');

  const bad = goodPlanBody();
  bad.events[0].name = 'AddToCart';
  geminiRetryBody = bad; // the one server-side regenerate is also invalid
  await assert.rejects(() => lastStreamOpts.postProcess(bad), /snake_case/);
  assert.equal(geminiCalls, 1, 'exactly one server-side regenerate, then surfaces');
});

// ─── b2) Streamed body invalid → one quiet server-side regenerate → resolves ───
test('postProcess regenerates once when the streamed body is invalid, then resolves', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  assert.ok(lastStreamOpts, 'stream opts captured');

  geminiRetryBody = goodPlanBody(); // the server-side regenerate returns a good plan
  const badStreamed = goodPlanBody();
  badStreamed.events = []; // the first (streamed + parsed) body fails validation

  const out = await lastStreamOpts.postProcess(badStreamed);
  assert.equal(out.success, true);
  assert.equal(out.plan.events[0].name, 'purchase');
  assert.equal(out.plan.meta.businessModel, 'ecommerce');
  assert.equal(geminiCalls, 1, 'exactly one server-side regenerate');
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
  const out = await lastStreamOpts.postProcess(goodPlanBody());
  assert.equal(out.classification.businessModel, 'saas');
  assert.equal(out.classification.confidence, 1);
});

// ─── e) Guard: no url and no brief → 400, stream NOT called ───
test('empty body → 400, no stream', async () => {
  const res = await POST(makeReq({}));

  assert.equal(res.status, 400);
  assert.equal(streamCalls, 0, 'stream seam NOT called on the 400 path');
});

// ─── f) FIX B: transport-exhausted failure → flagged TEMPLATE fallback ───
test('fallback on transport 503 → valid TEMPLATE plan (source=template), reason gemini_unavailable', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  assert.ok(lastStreamOpts.fallback, 'route supplies a fallback to the stream');
  const out = await lastStreamOpts.fallback(new Error('Gemini API 503: This model is currently experiencing high demand.'));
  assert.equal(out.success, true);
  assert.equal(out.plan.meta.source, 'template');
  assert.equal(out.plan.meta.businessModel, 'ecommerce');
  assert.equal(out.fallback, 'gemini_unavailable');
  assert.ok(out.plan.events.length > 0, 'template events present');
  assert.ok(out.plan.events.some((e: any) => e.name === 'purchase'), 'ecommerce template events present');
});

// ─── g) output-quality failure → template fallback, reason generation_failed ───
test('fallback on output-quality error → TEMPLATE plan, reason generation_failed', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  const out = await lastStreamOpts.fallback(new Error('Plan.events[0].name "AddToCart" is not GA4 snake_case'));
  assert.equal(out.plan.meta.source, 'template');
  assert.equal(out.fallback, 'generation_failed');
});

// ─── h) INVARIANT: a validation-failing model output is NEVER returned as-is ───
test('INVARIANT: the fallback returns template events, never the malformed (empty) output', async () => {
  await POST(makeReq(ECOMMERCE_BODY));
  const malformed = { ...goodPlanBody(), events: [] }; // what the user must NEVER receive
  const out = await lastStreamOpts.fallback(new Error('boom'));
  assert.notDeepEqual(out.plan.events, malformed.events, 'never echoes the malformed empty events');
  assert.ok(out.plan.events.length > 0, 'returns the template events instead');
  assert.equal(out.plan.meta.source, 'template');
});

// ─── i) templateOnly (no-AI) path → 200 SSE, stream builder NOT used ───
test('templateOnly → 200, no AI stream; returns a flagged template plan via SSE', async () => {
  const res = await POST(makeReq({ ...ECOMMERCE_BODY, businessModel: 'saas', templateOnly: true }));
  assert.equal(res.status, 200);
  assert.equal(streamCalls, 0, 'no AI stream on the templateOnly path');
  // Drain the one-shot SSE and find the complete event.
  const text = await res.text();
  const m = text.match(/event: complete\ndata: (.*)/);
  assert.ok(m, 'complete event emitted');
  const payload = JSON.parse(m[1]);
  assert.equal(payload.result.templateOnly, true);
  assert.equal(payload.result.plan.meta.source, 'template');
  assert.equal(payload.result.plan.meta.businessModel, 'saas');
});
