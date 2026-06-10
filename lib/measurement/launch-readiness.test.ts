// launch-readiness.test.ts — pure deterministic tests for the launch gate core.
// Runs under plain `node --test` (no @/ imports, no module mocks, no flags).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runLaunchReadinessGate,
  LAUNCH_READINESS_SCHEMA_VERSION,
  projectPlannedEventsFire,
  projectTrackingSnippetPresent,
  projectConsentModeConfigured,
  projectDataLayerVariablesPresent,
} from './launch-readiness.ts';
import type {
  LaunchReadinessReport,
  ReadinessCheckOptions,
  ReadinessCheckId,
} from './launch-readiness.ts';
import type { MeasurementPlan, ObservedSignals, ReadinessReport } from './types.ts';

// A coherent ecommerce plan (consentModeRequired false) — every deterministic
// check passes. events: [0] page_view (non-key), [1] purchase (key, consent-gated).
function goodPlan(): MeasurementPlan {
  return {
    meta: {
      url: 'https://shop.example.com',
      businessModel: 'ecommerce',
      vertical: 'retail',
      generatedAt: '2026-06-01T00:00:00.000Z',
      schemaVersion: '1.0.0',
      classificationConfidence: 0.9,
    },
    kpis: [
      { id: 'kpi_revenue', name: 'Revenue', description: '', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] },
    ],
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

async function run(plan: MeasurementPlan, opts?: ReadinessCheckOptions): Promise<LaunchReadinessReport> {
  const { report } = await runLaunchReadinessGate({ url: plan.meta.url, plan }, opts);
  return report;
}

// ─── Happy path ───

test('coherent plan → no blockingFailures, go_with_warnings, 9 skipped, approval required', async () => {
  const r = await run(goodPlan());
  assert.deepEqual(r.blockingFailures, []);
  assert.equal(r.decision, 'go_with_warnings');
  assert.equal(r.skipped.length, 9);
  assert.equal(r.approval.required, true);
  assert.equal(r.meta.readinessSchemaVersion, LAUNCH_READINESS_SCHEMA_VERSION);
  assert.equal(r.meta.businessModel, 'ecommerce');
  assert.equal(r.meta.planSchemaVersion, '1.0.0');
});

// ─── Blocking deterministic failures → no_go ───

test('no key event → no_go on plan_has_key_event, approval not required', async () => {
  const p = goodPlan();
  p.events[1].isKeyEvent = false;
  p.tooling.ga4.keyEvents = [];
  const r = await run(p);
  assert.equal(r.decision, 'no_go');
  assert.ok(r.blockingFailures.includes('plan_has_key_event'));
  assert.equal(r.approval.required, false);
});

test('dangling kpi link → no_go on kpi_links_resolve', async () => {
  const p = goodPlan();
  p.kpis[0].linkedEventIds = ['evt_missing'];
  const r = await run(p);
  assert.equal(r.decision, 'no_go');
  assert.ok(r.blockingFailures.includes('kpi_links_resolve'));
});

test('GA4 keyEvents pointing at a non-key event → no_go on key_events_reference_real_events', async () => {
  const p = goodPlan();
  p.tooling.ga4.keyEvents = ['evt_page_view']; // exists but isKeyEvent false
  const r = await run(p);
  assert.equal(r.decision, 'no_go');
  assert.ok(r.blockingFailures.includes('key_events_reference_real_events'));
});

test('duplicate event ids → no_go on event_ids_unique', async () => {
  const p = goodPlan();
  p.events.push({
    id: 'evt_purchase', // duplicate
    name: 'purchase_dup',
    category: 'ecommerce',
    description: '',
    trigger: '',
    isKeyEvent: false,
    requiresConsent: false,
    parameters: [],
  });
  const r = await run(p);
  assert.equal(r.decision, 'no_go');
  assert.ok(r.blockingFailures.includes('event_ids_unique'));
});

test('consentModeRequired true + empty categoriesUsed → no_go on consent_coherent', async () => {
  const p = goodPlan();
  p.consent.consentModeRequired = true;
  p.consent.categoriesUsed = [];
  const r = await run(p);
  assert.equal(r.decision, 'no_go');
  assert.ok(r.blockingFailures.includes('consent_coherent'));
});

// ─── Non-blocking issues → warning only ───

test('same consent issue but consentModeRequired false → warning, not blocking', async () => {
  const p = goodPlan();
  p.consent.consentModeRequired = false;
  p.consent.categoriesUsed = []; // evt_purchase requiresConsent but no 'analytics'
  const r = await run(p);
  assert.equal(r.decision, 'go_with_warnings');
  assert.ok(!r.blockingFailures.includes('consent_coherent'));
  assert.ok(r.warnings.includes('consent_coherent'));
});

test('unbacked dataLayer param → warning only, no blockingFailures', async () => {
  const p = goodPlan();
  p.events[1].parameters.push({ name: 'currency', type: 'string', required: false, description: '', source: 'dataLayer' });
  const r = await run(p);
  assert.deepEqual(r.blockingFailures, []);
  assert.ok(r.warnings.includes('datalayer_params_backed'));
  assert.equal(r.decision, 'go_with_warnings');
});

// ─── Options ───

test('strictOnSkipped true → no_go (a blocking check is skipped this phase)', async () => {
  const r = await run(goodPlan(), { strictOnSkipped: true });
  assert.equal(r.decision, 'no_go');
});

test('requireApproval false → approval not required on go_with_warnings', async () => {
  const r = await run(goodPlan(), { requireApproval: false });
  assert.equal(r.decision, 'go_with_warnings');
  assert.equal(r.approval.required, false);
});

// ─── Deployed-site projections (pure: hand-built ReadinessReport) ───

function baseReport(): ReadinessReport {
  return {
    meta: {
      url: 'https://staging.example.com',
      planSchemaVersion: '1.0.0',
      readinessSchemaVersion: '1.0.0',
      evaluatedAt: '2026-06-10T12:00:00.000Z',
    },
    verdict: 'pass',
    scores: { overall: 1, eventCoverage: 1, keyEventCoverage: 1, consentReady: true },
    events: [
      { eventId: 'e_pv', eventName: 'page_view', isKeyEvent: false, status: 'implemented', matchedObservedName: 'page_view', observedCount: 1, missingRequiredParameters: [], detail: '' },
      { eventId: 'e_pur', eventName: 'purchase', isKeyEvent: true, status: 'implemented', matchedObservedName: 'purchase', observedCount: 1, missingRequiredParameters: [], detail: '' },
    ],
    issues: [],
    observedSummary: {
      totalObservedEvents: 2,
      matchedObservedEvents: 2,
      unplannedObservedEvents: [],
      skippedObservedEvents: 0,
      rawHitCount: 10,
      consentBannerDetected: true,
      consentAccepted: true,
    },
  };
}

test('projectPlannedEventsFire: all implemented → pass (non-blocking)', () => {
  const c = projectPlannedEventsFire(baseReport());
  assert.equal(c.status, 'pass');
  assert.equal(c.blocking, false);
});

test('projectPlannedEventsFire: missing KEY event → warn, flagged in summary + evidence', () => {
  const r = baseReport();
  r.events[1].status = 'missing';
  r.scores.keyEventCoverage = 0;
  const c = projectPlannedEventsFire(r);
  assert.equal(c.status, 'warn');
  assert.match(c.summary, /KEY/);
  assert.ok(c.evidence?.some((e) => e.includes('purchase')));
});

test('projectTrackingSnippetPresent: no signals → fail (blocking)', () => {
  const r = baseReport();
  r.issues = [{ severity: 'blocking', code: 'no_signals_captured', message: 'nothing fired' }];
  const c = projectTrackingSnippetPresent(r);
  assert.equal(c.status, 'fail');
  assert.equal(c.blocking, true);
});

test('projectTrackingSnippetPresent: signals present → pass', () => {
  assert.equal(projectTrackingSnippetPresent(baseReport()).status, 'pass');
});

test('projectConsentModeConfigured: PARTIAL → warn, scoped summary, blocking follows consentModeRequired', () => {
  const required = projectConsentModeConfigured(baseReport(), true);
  assert.equal(required.status, 'warn'); // never a confident green
  assert.equal(required.blocking, true);
  assert.match(required.summary, /not verifiable|Consent Mode/i);
  assert.equal(projectConsentModeConfigured(baseReport(), false).blocking, false);
});

test('projectDataLayerVariablesPresent: PARTIAL → warn; lists missing required params', () => {
  const r = baseReport();
  r.events[1].status = 'misconfigured';
  r.events[1].missingRequiredParameters = ['value'];
  const c = projectDataLayerVariablesPresent(r);
  assert.equal(c.status, 'warn');
  assert.equal(c.blocking, false);
  assert.ok(c.evidence?.some((e) => e.includes('value')));
});

// ─── Wiring: deployedSiteUrl drives a single capture→reconcile→project ───

function check(report: LaunchReadinessReport, id: ReadinessCheckId) {
  const c = report.checks.find((x) => x.id === id);
  assert.ok(c, `check ${id} present`);
  return c;
}

test('no deployedSiteUrl → the 4 deployed-site checks stay skipped (9 skipped total)', async () => {
  const r = await run(goodPlan());
  for (const id of ['planned_events_fire', 'tracking_snippet_present', 'datalayer_variables_present', 'consent_mode_configured'] as const) {
    assert.equal(check(r, id).status, 'skipped');
  }
  assert.equal(r.skipped.length, 9);
  assert.equal(r.observed, undefined); // omitted on the deterministic-only path
});

test('deployedSiteUrl present (injected capture) → 4 deployed checks come from the ReadinessReport', async () => {
  const observed: ObservedSignals = {
    url: 'https://staging.example.com',
    rawHitCount: 5,
    consentBannerDetected: true,
    consentAccepted: true,
    events: [
      { name: 'page_view', vendor: 'GA4', parameters: [], count: 1 },
      { name: 'purchase', vendor: 'GA4', destinationId: 'G-X', parameters: ['value'], count: 1 },
    ],
  };
  const { report } = await runLaunchReadinessGate(
    { url: 'https://staging.example.com', plan: goodPlan(), connectors: { deployedSiteUrl: 'https://staging.example.com' } },
    { captureObservedSignals: async () => observed }
  );
  assert.equal(check(report, 'planned_events_fire').status, 'pass');
  assert.equal(check(report, 'tracking_snippet_present').status, 'pass');
  assert.equal(check(report, 'consent_mode_configured').status, 'warn');
  assert.equal(check(report, 'datalayer_variables_present').status, 'warn');
  assert.ok(!report.skipped.includes('planned_events_fire'));
  assert.equal(report.skipped.length, 5); // only the 5 OAuth checks remain skipped
  assert.equal(report.decision, 'go_with_warnings');

  // Observed evidence is attached on the live path (sourced from the same
  // capture/reconcile — no second browser run) so a UI can show what fired.
  const ev = report.observed;
  assert.ok(ev, 'observed evidence attached on the live path');
  assert.equal(ev.summary.rawHitCount, 5);
  assert.equal(ev.summary.totalObservedEvents, 2);
  assert.equal(ev.events.length, 2);
  assert.deepEqual(ev.events.map((e) => e.name), ['page_view', 'purchase']);
});

test('deployedSiteUrl present but no signals → tracking_snippet_present fail → no_go', async () => {
  const observed: ObservedSignals = { url: 'x', events: [], rawHitCount: 0 };
  const { report } = await runLaunchReadinessGate(
    { url: 'x', plan: goodPlan(), connectors: { deployedSiteUrl: 'x' } },
    { captureObservedSignals: async () => observed }
  );
  assert.equal(check(report, 'tracking_snippet_present').status, 'fail');
  assert.ok(report.blockingFailures.includes('tracking_snippet_present'));
  assert.equal(report.decision, 'no_go');
});
