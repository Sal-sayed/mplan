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
  projectGa4Checks,
  projectGtmChecks,
} from './launch-readiness.ts';
import type {
  LaunchReadinessReport,
  ReadinessCheckOptions,
  ReadinessCheckId,
} from './launch-readiness.ts';
import { evaluateConsentCompliance } from './consent-compliance.ts';
import type { Ga4ConfigData } from './ga4-config.ts';
import type { GtmConfigData } from './gtm-config.ts';
import type { ConsentModeStatus, MeasurementPlan, ObservedSignals, ReadinessReport } from './types.ts';

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
      consentMode: null,
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

test('projectConsentModeConfigured: evidence-backed status from the compliance verdict; blocking follows consentModeRequired', () => {
  // Required by the plan + no Consent Mode present on the page → fail (blocking).
  const reqPlan = goodPlan();
  reqPlan.consent.consentModeRequired = true;
  const failC = evaluateConsentCompliance({
    plan: reqPlan,
    bannerResult: { detected: true, accepted: true },
    consentModeStatus: { active: false, hasDefault: false, hasUpdate: false, version: null, hasV2Signals: false },
  });
  const failCheck = projectConsentModeConfigured(failC);
  assert.equal(failCheck.status, 'fail'); // evidence-backed, not the old blind warn
  assert.equal(failCheck.blocking, true);

  // Not required + fully present → pass, non-blocking.
  const okPlan = goodPlan();
  okPlan.consent.consentModeRequired = false;
  const passC = evaluateConsentCompliance({
    plan: okPlan,
    bannerResult: { detected: true, accepted: true },
    consentModeStatus: { active: true, hasDefault: true, hasUpdate: true, version: 'v2', hasV2Signals: true },
  });
  const passCheck = projectConsentModeConfigured(passC);
  assert.equal(passCheck.status, 'pass');
  assert.equal(passCheck.blocking, false);
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

// ─── Consent Mode Verification: the gate now reads granular Consent Mode ───

function requiredPlan(): MeasurementPlan {
  const p = goodPlan();
  p.consent.consentModeRequired = true; // categoriesUsed already ['necessary','analytics'] → coherent
  return p;
}

function observedWith(consentMode: ConsentModeStatus | undefined): ObservedSignals {
  return {
    url: 'https://staging.example.com',
    rawHitCount: 5,
    consentBannerDetected: true,
    consentAccepted: true,
    events: [
      { name: 'page_view', vendor: 'GA4', parameters: [], count: 1 },
      { name: 'purchase', vendor: 'GA4', destinationId: 'G-X', parameters: ['value'], count: 1 },
    ],
    ...(consentMode ? { consentMode } : {}),
  };
}

async function runDeployed(plan: MeasurementPlan, consentMode: ConsentModeStatus | undefined) {
  const { report } = await runLaunchReadinessGate(
    { url: 'https://staging.example.com', plan, connectors: { deployedSiteUrl: 'https://staging.example.com' } },
    { captureObservedSignals: async () => observedWith(consentMode) }
  );
  return report;
}

test('consent_mode_configured: required + full Consent Mode v2 present → pass (not the old blind warn)', async () => {
  const report = await runDeployed(requiredPlan(), { active: true, hasDefault: true, hasUpdate: true, version: 'v2', hasV2Signals: true });
  assert.equal(check(report, 'consent_mode_configured').status, 'pass');
  assert.equal(report.consentCompliance?.verdict, 'pass');
  assert.ok(!report.blockingFailures.includes('consent_mode_configured'));
});

test('consent_mode_configured: required but NO consent signals on the page → fail → no_go', async () => {
  const report = await runDeployed(requiredPlan(), { active: false, hasDefault: false, hasUpdate: false, version: null, hasV2Signals: false });
  assert.equal(check(report, 'consent_mode_configured').status, 'fail');
  assert.equal(check(report, 'consent_mode_configured').blocking, true);
  assert.ok(report.blockingFailures.includes('consent_mode_configured'));
  assert.equal(report.decision, 'no_go');
  assert.equal(report.consentCompliance?.verdict, 'fail');
});

test('consent_mode_configured: required, default present but no update / no v2 → warn (partial)', async () => {
  const report = await runDeployed(requiredPlan(), { active: true, hasDefault: true, hasUpdate: false, version: 'v1', hasV2Signals: false });
  assert.equal(check(report, 'consent_mode_configured').status, 'warn');
  assert.notEqual(report.decision, 'no_go'); // warn is non-blocking even when required
  assert.equal(report.consentCompliance?.verdict, 'warn');
});

test('consent_mode_configured: severity stays non-blocking when consentModeRequired is false', async () => {
  const report = await runDeployed(goodPlan(), { active: false, hasDefault: false, hasUpdate: false, version: null, hasV2Signals: false });
  assert.equal(check(report, 'consent_mode_configured').blocking, false);
  assert.notEqual(report.decision, 'no_go');
});

test('no deployed URL → consent_mode_configured skipped + consentCompliance inconclusive (never false fail)', async () => {
  const r = await run(requiredPlan());
  assert.equal(check(r, 'consent_mode_configured').status, 'skipped');
  assert.equal(r.consentCompliance?.verdict, 'inconclusive');
});

// ─── GA4 / GTM projections (pure) ───

function ga4Cfg(over: Partial<Ga4ConfigData> = {}): Ga4ConfigData {
  return { propertyExists: true, displayName: 'My GA4', keyEventNames: ['purchase'], customDimensionParameters: [], ...over };
}

test('projectGa4Checks: property + key events + dims present → 3 pass', () => {
  const checks = projectGa4Checks(ga4Cfg(), goodPlan());
  assert.deepEqual(checks.map((c) => c.status), ['pass', 'pass', 'pass']);
  assert.ok(checks.every((c) => c.dependsOn === 'ga4_oauth'));
});

test('projectGa4Checks: planned key event not registered → key-events fail (matched by NAME not id)', () => {
  const checks = projectGa4Checks(ga4Cfg({ keyEventNames: [] }), goodPlan());
  const ke = checks.find((c) => c.id === 'ga4_key_events_registered')!;
  assert.equal(ke.status, 'fail');
  assert.ok(ke.evidence?.includes('purchase')); // evt_purchase id → 'purchase' name
});

test('projectGa4Checks: missing custom dimension → dims fail', () => {
  const p = goodPlan();
  p.tooling.ga4.customDimensions = [{ name: 'Item ID', scope: 'event', parameter: 'item_id' }];
  const checks = projectGa4Checks(ga4Cfg({ customDimensionParameters: [] }), p);
  const cd = checks.find((c) => c.id === 'ga4_custom_dimensions_created')!;
  assert.equal(cd.status, 'fail');
  assert.ok(cd.evidence?.includes('item_id'));
});

test('projectGa4Checks: property not found → all 3 fail', () => {
  const checks = projectGa4Checks(ga4Cfg({ propertyExists: false }), goodPlan());
  assert.deepEqual(checks.map((c) => c.status), ['fail', 'fail', 'fail']);
});

test('projectGtmChecks: container found with enough live tags → both pass', () => {
  const checks = projectGtmChecks({ containerExists: true, containerName: 'Web', liveTagCount: 5 }, goodPlan());
  assert.deepEqual(checks.map((c) => c.status), ['pass', 'pass']);
});

test('projectGtmChecks: fewer live tags than suggested → tags warn (non-blocking)', () => {
  const checks = projectGtmChecks({ containerExists: true, liveTagCount: 1 }, goodPlan());
  const tags = checks.find((c) => c.id === 'gtm_tags_configured')!;
  assert.equal(tags.status, 'warn');
  assert.equal(tags.blocking, false);
});

test('projectGtmChecks: container not found → exists fail, tags warn', () => {
  const checks = projectGtmChecks({ containerExists: false, liveTagCount: 0 }, goodPlan());
  assert.equal(checks.find((c) => c.id === 'gtm_container_exists')!.status, 'fail');
  assert.equal(checks.find((c) => c.id === 'gtm_tags_configured')!.status, 'warn');
});

// ─── Gate wiring: GA4/GTM connectors + Google token (injected seams) ───

test('ga4 connector + token + fetch → GA4 checks become real (skipped drops to 6)', async () => {
  const { report } = await runLaunchReadinessGate(
    { url: goodPlan().meta.url, plan: goodPlan(), connectors: { ga4: { propertyId: '123456789' } } },
    { getGoogleAccessToken: async () => 'tok', fetchGa4Config: async () => ga4Cfg() }
  );
  assert.equal(check(report, 'ga4_property_exists').status, 'pass');
  assert.equal(check(report, 'ga4_key_events_registered').status, 'pass');
  assert.equal(report.skipped.length, 6); // 4 deployed + 2 gtm
});

test('ga4 connector but Google not connected → GA4 checks stay skipped (9 skipped)', async () => {
  const { report } = await runLaunchReadinessGate(
    { url: goodPlan().meta.url, plan: goodPlan(), connectors: { ga4: { propertyId: '123456789' } } },
    { getGoogleAccessToken: async () => { throw new Error('not connected'); }, fetchGa4Config: async () => ga4Cfg() }
  );
  assert.equal(check(report, 'ga4_property_exists').status, 'skipped');
  assert.equal(report.skipped.length, 9);
});

test('ga4 connector + token but fetch throws → GA4 checks fail → no_go', async () => {
  const { report } = await runLaunchReadinessGate(
    { url: goodPlan().meta.url, plan: goodPlan(), connectors: { ga4: { propertyId: 'bad' } } },
    { getGoogleAccessToken: async () => 'tok', fetchGa4Config: async () => { throw new Error('boom'); } }
  );
  assert.equal(check(report, 'ga4_property_exists').status, 'fail');
  assert.ok(report.blockingFailures.includes('ga4_property_exists'));
  assert.equal(report.decision, 'no_go');
});

test('gtm connector + token + fetch → GTM checks become real (skipped drops to 7)', async () => {
  const { report } = await runLaunchReadinessGate(
    { url: goodPlan().meta.url, plan: goodPlan(), connectors: { gtm: { containerId: 'GTM-XYZ' } } },
    { getGoogleAccessToken: async () => 'tok', fetchGtmConfig: async () => ({ containerExists: true, liveTagCount: 9 }) }
  );
  assert.equal(check(report, 'gtm_container_exists').status, 'pass');
  assert.equal(check(report, 'gtm_tags_configured').status, 'pass');
  assert.equal(report.skipped.length, 7); // 4 deployed + 3 ga4
});
