// consent-compliance.test.ts — pure tests for the Consent & Compliance evaluator
// (slice 1: Consent Mode Verification). Runs under plain `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateConsentCompliance, computeConsentCoherenceProblems } from './consent-compliance.ts';
import type { ConsentModeStatus, MeasurementPlan } from './types.ts';

// Minimal coherent plan: one non-key page_view, one key consent-gated purchase.
function plan(): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [],
    events: [
      { id: 'evt_pv', name: 'page_view', category: 'page', description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: '', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [] },
    ],
    dataLayer: [],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 1, notes: '' } },
  };
}

const banner = { detected: true, accepted: true };
const fullV2: ConsentModeStatus = { active: true, hasDefault: true, hasUpdate: true, version: 'v2', hasV2Signals: true };
const none: ConsentModeStatus = { active: false, hasDefault: false, hasUpdate: false, version: null, hasV2Signals: false };

test('consentModeRequired + no consent signals on the page → fail', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  const r = evaluateConsentCompliance({ plan: p, bannerResult: banner, consentModeStatus: none });
  assert.equal(r.verdict, 'fail');
  assert.ok(r.issues.some((i) => i.code === 'consent_mode_missing' && i.severity === 'fail'));
});

test('consentModeRequired + default present but no update → warn (partial)', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  const status: ConsentModeStatus = { active: true, hasDefault: true, hasUpdate: false, version: 'v2', hasV2Signals: true };
  const r = evaluateConsentCompliance({ plan: p, bannerResult: banner, consentModeStatus: status });
  assert.equal(r.verdict, 'warn');
  assert.ok(r.issues.some((i) => i.code === 'consent_mode_no_update'));
});

test('consentModeRequired + present but v2 signals missing → warn', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  const status: ConsentModeStatus = { active: true, hasDefault: true, hasUpdate: true, version: 'v1', hasV2Signals: false };
  const r = evaluateConsentCompliance({ plan: p, bannerResult: banner, consentModeStatus: status });
  assert.equal(r.verdict, 'warn');
  assert.ok(r.issues.some((i) => i.code === 'consent_mode_no_v2'));
});

test('consentModeRequired + all present and coherent → pass', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  const r = evaluateConsentCompliance({ plan: p, bannerResult: banner, consentModeStatus: fullV2 });
  assert.equal(r.verdict, 'pass');
  assert.equal(r.issues.length, 0);
  assert.equal(r.consentModePresent, true);
  assert.equal(r.consentModeV2, true);
});

test('no live capture (consentModeStatus null) → inconclusive, never a false fail', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  const r = evaluateConsentCompliance({ plan: p, bannerResult: null, consentModeStatus: null });
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.captured, false);
  assert.ok(!r.issues.some((i) => i.severity === 'fail' && i.code === 'consent_mode_missing'));
});

test('a requiresConsent event with categoriesUsed lacking analytics flags via folded-in coherence', () => {
  const p = plan();
  p.consent.consentModeRequired = false;
  p.consent.categoriesUsed = []; // evt_purchase requiresConsent but no 'analytics'
  const r = evaluateConsentCompliance({ plan: p, bannerResult: banner, consentModeStatus: fullV2 });
  assert.ok(r.issues.some((i) => i.code === 'consent_incoherent' && /requiresConsent/.test(i.message)));
  assert.equal(r.verdict, 'warn'); // non-blocking because consentModeRequired is false
});

test('computeConsentCoherenceProblems matches the gate consent_coherent rules', () => {
  const p = plan();
  p.consent.consentModeRequired = true;
  p.consent.categoriesUsed = [];
  const problems = computeConsentCoherenceProblems(p);
  assert.ok(problems.some((m) => /categoriesUsed is empty/.test(m)));
  assert.ok(problems.some((m) => /requiresConsent/.test(m)));
});
