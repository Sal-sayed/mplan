// launch-readiness.test.ts — pure deterministic tests for the launch gate core.
// Runs under plain `node --test` (no @/ imports, no module mocks, no flags).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runLaunchReadinessGate, LAUNCH_READINESS_SCHEMA_VERSION } from './launch-readiness.ts';
import type { LaunchReadinessReport, ReadinessCheckOptions } from './launch-readiness.ts';
import type { MeasurementPlan } from './types.ts';

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
