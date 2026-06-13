/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for POST /api/governance/run-scheduled (the cron-triggered, secret-
// gated scheduler). Mocks the gate (runGovernanceCheck) and the store
// (listLatestRuns/saveRun/buildGovernanceRun); diffReports runs for real.
// Verifies the MONITOR_SECRET gate, plan+connector reconstruction, drift
// surfacing, and per-site isolation.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

// ─── mutable test state ───
let persistedRuns: any[] = [];
let savedRuns: any[] = [];
let lastCtxs: any[] = [];
let gateThrowsForUrl: string | null = null;
let gateReportByUrl: Record<string, any> = {};

mockModule('@/lib/measurement/governance', {
  namedExports: {
    runGovernanceCheck: async (ctx: any) => {
      lastCtxs.push(ctx);
      if (gateThrowsForUrl && ctx.url === gateThrowsForUrl) throw new Error('gate boom');
      return { report: gateReportByUrl[ctx.url] ?? report('go', [check('event_ids_unique', 'pass')], ctx.url) };
    },
  },
});
mockModule('@/lib/measurement/governance-store', {
  namedExports: {
    listLatestRuns: async () => persistedRuns,
    saveRun: async (run: any) => {
      savedRuns.push(run);
    },
    buildGovernanceRun: (rep: any, plan: any, ownerId: any, connectors: any) => ({
      runId: 'run_new', siteUrl: rep.meta.url, planKey: 'k', createdAt: 't', decision: rep.decision, report: rep, plan, connectors, user_id: ownerId,
    }),
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

function check(id: string, status: string) {
  return { id, category: 'plan', name: id, status, blocking: true, dependsOn: 'plan', summary: '' };
}
function report(decision: string, checks: any[], url = 'https://shop.example.com') {
  return {
    meta: { url, businessModel: 'ecommerce', planSchemaVersion: '1.0.0', readinessSchemaVersion: '0.1.0', generatedAt: '2026-06-01T00:00:00.000Z' },
    decision,
    checks,
    blockingFailures: [],
    warnings: [],
    skipped: [],
    approval: { required: false },
  };
}
function priorRun(url: string, opts: { plan?: any; connectors?: any; report?: any } = {}) {
  return {
    runId: `run_${url}`,
    siteUrl: url,
    planKey: 'k',
    createdAt: '2026-06-01T00:00:00.000Z',
    decision: 'go',
    report: opts.report ?? report('go', [check('event_ids_unique', 'pass')], url),
    plan: 'plan' in opts ? opts.plan : { meta: { url, businessModel: 'ecommerce' }, marker: url },
    connectors: opts.connectors,
  };
}

const makeReq = (body: any, headers: Record<string, string> = {}) => ({
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  process.env.MONITOR_SECRET = 'topsecret';
  persistedRuns = [];
  savedRuns = [];
  lastCtxs = [];
  gateThrowsForUrl = null;
  gateReportByUrl = {};
});

// ─── secret gate ───

test('unset MONITOR_SECRET → 500', async () => {
  delete process.env.MONITOR_SECRET;
  const res = await POST(makeReq({}, auth('anything')));
  assert.equal(res.status, 500);
});

test('wrong MONITOR_SECRET → 401 (no run)', async () => {
  persistedRuns = [priorRun('https://shop.example.com')];
  const res = await POST(makeReq({}, auth('wrong')));
  assert.equal(res.status, 401);
  assert.equal(lastCtxs.length, 0, 'gate never invoked');
});

test('missing auth header → 401', async () => {
  const res = await POST(makeReq({}, {}));
  assert.equal(res.status, 401);
});

test('correct secret with no persisted sites → 200, empty results', async () => {
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.results, []);
});

// ─── plan + connector reconstruction ───

test('reconstructs plan + connectors from persistence and runs the gate', async () => {
  const plan = { meta: { url: 'https://shop.example.com', businessModel: 'ecommerce' }, marker: 'P' };
  persistedRuns = [priorRun('https://shop.example.com', { plan, connectors: { ga4: { propertyId: '123456' } } })];
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  assert.equal(lastCtxs.length, 1);
  assert.deepEqual(lastCtxs[0].plan, plan, 'plan reconstructed and passed to the gate');
  assert.deepEqual(lastCtxs[0].ga4, { propertyId: '123456' }, 'connectors reconstructed');
  assert.equal(savedRuns.length, 1, 'the new run is persisted');
});

// ─── drift ───

test('a site that regressed vs its prior run surfaces a regression', async () => {
  const url = 'https://shop.example.com';
  // prior had the check passing; this run fails it + decision drops to no_go.
  persistedRuns = [priorRun(url, { report: report('go', [check('event_ids_unique', 'pass')], url) })];
  gateReportByUrl[url] = report('no_go', [check('event_ids_unique', 'fail')], url);

  const res = await POST(makeReq({}, auth('topsecret')));
  const body = await res.json();
  assert.equal(body.anyRegression, true);
  const r = body.results[0];
  assert.equal(r.verdict, 'regression');
  assert.deepEqual(r.regressions, ['event_ids_unique']);
});

test('first/identical scheduled run returns ok, persists, no crash', async () => {
  const url = 'https://shop.example.com';
  const same = report('go', [check('event_ids_unique', 'pass')], url);
  persistedRuns = [priorRun(url, { report: same })];
  gateReportByUrl[url] = same;

  const res = await POST(makeReq({}, auth('topsecret')));
  const body = await res.json();
  assert.equal(body.anyRegression, false);
  assert.equal(body.results[0].verdict, 'ok');
  assert.equal(savedRuns.length, 1);
});

// ─── resilience / skips ───

test('per-site isolation: one site failing does not abort the others', async () => {
  gateThrowsForUrl = 'https://broken.example.com';
  persistedRuns = [
    priorRun('https://broken.example.com'),
    priorRun('https://ok.example.com'),
  ];
  const res = await POST(makeReq({}, auth('topsecret')));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.results.length, 2);
  const broken = body.results.find((r: any) => r.siteUrl === 'https://broken.example.com');
  const ok = body.results.find((r: any) => r.siteUrl === 'https://ok.example.com');
  assert.ok(broken.error, 'broken site recorded an error');
  assert.equal(ok.verdict, 'ok', 'the other site still ran');
  assert.equal(savedRuns.length, 1, 'only the successful site persisted');
});

test('explicit target with no persisted run is skipped (not crashed)', async () => {
  persistedRuns = [];
  const res = await POST(makeReq({ sites: [{ siteUrl: 'https://never.example.com', planKey: 'k' }] }, auth('topsecret')));
  assert.equal(res.status, 200);
  const r = (await res.json()).results[0];
  assert.equal(r.skipped, true);
  assert.match(r.error, /no persisted run/);
});

test('a persisted run with no plan is skipped (cannot re-run)', async () => {
  persistedRuns = [priorRun('https://shop.example.com', { plan: undefined })];
  const res = await POST(makeReq({}, auth('topsecret')));
  const r = (await res.json()).results[0];
  assert.equal(r.skipped, true);
  assert.match(r.error, /no persisted plan/);
  assert.equal(lastCtxs.length, 0, 'the gate is never run without a plan');
});
