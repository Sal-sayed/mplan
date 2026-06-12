// Pure unit tests for runGovernanceCheck — the GA4/GTM config readers are
// injected via the gate's existing opts seam, so no browser, no real Google.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGovernanceCheck } from './governance.ts';
import type { ReadinessCheckOptions, LaunchReadinessReport, ReadinessCheckId } from './launch-readiness.ts';
import type { MeasurementPlan } from './types.ts';

function plan(): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [{ id: 'kpi_rev', name: 'Revenue', description: '', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] }],
    events: [
      { id: 'evt_page_view', name: 'page_view', category: 'page', description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: '', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 3, notes: '' } },
  };
}

// Inject the Google readers (the gate's DI seam) — keeps this pure: no token
// store, no REST calls, no browser.
const goodOpts: ReadinessCheckOptions = {
  getGoogleAccessToken: async () => 'fake-token',
  fetchGa4Config: async () => ({ propertyExists: true, displayName: 'MYNTRA', keyEventNames: ['purchase'], customDimensionParameters: [] }),
  fetchGtmConfig: async () => ({ containerExists: true, containerName: 'WEB', liveTagCount: 5 }),
};

const check = (r: LaunchReadinessReport, id: ReadinessCheckId) => {
  const c = r.checks.find((x) => x.id === id);
  assert.ok(c, `check ${id} present`);
  return c;
};

test('runGovernanceCheck runs GA4/GTM config checks and SKIPS the browser-capture checks', async () => {
  const { report } = await runGovernanceCheck(
    { url: 'https://shop.example.com', plan: plan(), ga4: { propertyId: '123456' }, gtm: { containerId: 'GTM-XXXX' } },
    goodOpts
  );
  // GA4/GTM config checks resolved (not skipped) — the point of governance.
  assert.equal(check(report, 'ga4_property_exists').status, 'pass');
  assert.equal(check(report, 'ga4_key_events_registered').status, 'pass');
  assert.equal(check(report, 'ga4_custom_dimensions_created').status, 'pass');
  assert.equal(check(report, 'gtm_container_exists').status, 'pass');
  assert.equal(check(report, 'gtm_tags_configured').status, 'pass');
  // deterministic plan checks ran.
  assert.equal(check(report, 'event_ids_unique').status, 'pass');
  assert.equal(check(report, 'plan_has_key_event').status, 'pass');
  // deployed_site (browser) checks SKIPPED — governance passes no deployedSiteUrl.
  for (const id of ['planned_events_fire', 'tracking_snippet_present', 'datalayer_variables_present', 'consent_mode_configured'] as const) {
    assert.equal(check(report, id).status, 'skipped');
  }
});

test('reuses the gate: a config drift (GA4 key event no longer registered) surfaces the same fail', async () => {
  const driftOpts: ReadinessCheckOptions = {
    ...goodOpts,
    fetchGa4Config: async () => ({ propertyExists: true, keyEventNames: [], customDimensionParameters: [] }),
  };
  const { report } = await runGovernanceCheck({ url: 'https://shop.example.com', plan: plan(), ga4: { propertyId: '123456' } }, driftOpts);
  assert.equal(check(report, 'ga4_key_events_registered').status, 'fail');
});

test('no connectors → GA4/GTM checks stay skipped; deterministic checks still run', async () => {
  const { report } = await runGovernanceCheck({ url: 'https://shop.example.com', plan: plan() }, goodOpts);
  assert.equal(check(report, 'ga4_property_exists').status, 'skipped');
  assert.equal(check(report, 'gtm_container_exists').status, 'skipped');
  assert.equal(check(report, 'event_ids_unique').status, 'pass');
});
