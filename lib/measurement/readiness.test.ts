// readiness.test.ts — deterministic unit tests for the launch-readiness gate.
//
// Pure evaluator: no Gemini, no browser, so (unlike generate-plan.test.ts) there
// is no fetch stub / env-key / beforeEach machinery — just import and assert.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateReadiness,
  normalizeEventName,
  validateReadinessOptions,
  READINESS_THRESHOLDS,
} from './readiness.ts';
import { READINESS_SCHEMA_VERSION } from './types.ts';
import type {
  MeasurementPlan,
  ObservedSignals,
  TrackedEvent,
  EventParameter,
} from './types.ts';

// ─── Fixtures (factories return fresh, mutable objects per test) ───

function param(name: string, required: boolean): EventParameter {
  return { name, type: 'string', required, description: `${name} param`, source: 'dataLayer' };
}

function event(
  id: string,
  name: string,
  isKeyEvent: boolean,
  opts: { requiresConsent?: boolean; parameters?: EventParameter[] } = {}
): TrackedEvent {
  return {
    id,
    name,
    category: 'conversion',
    description: `${name} event`,
    trigger: `when ${name}`,
    isKeyEvent,
    requiresConsent: opts.requiresConsent ?? false,
    parameters: opts.parameters ?? [],
  };
}

function meta(): MeasurementPlan['meta'] {
  return {
    url: 'https://staging.example.com',
    businessModel: 'ecommerce',
    vertical: 'retail',
    generatedAt: '2026-06-01T00:00:00.000Z',
    schemaVersion: '1.0.0',
    classificationConfidence: 0.9,
  };
}

function consent(consentModeRequired = true): MeasurementPlan['consent'] {
  return { categoriesUsed: ['analytics', 'marketing'], consentModeRequired, notes: '' };
}

function tooling(): MeasurementPlan['tooling'] {
  return {
    ga4: { keyEvents: ['purchase'], customDimensions: [] },
    gtm: { suggestedTagCount: 3, notes: '' },
  };
}

// Plan: one key event (purchase, consent-gated, two required params), one
// supporting event (view_item, one required param), one ambient (page_view).
function plan(): MeasurementPlan {
  return {
    meta: meta(),
    kpis: [],
    events: [
      event('e_purchase', 'purchase', true, {
        requiresConsent: true,
        parameters: [param('value', true), param('currency', true), param('transaction_id', false)],
      }),
      event('e_view_item', 'view_item', false, { parameters: [param('item_id', true)] }),
      event('e_page_view', 'page_view', false),
    ],
    dataLayer: [],
    consent: consent(),
    tooling: tooling(),
  };
}

// Everything fired correctly, consent banner found.
function observedFull(): ObservedSignals {
  return {
    url: 'https://staging.example.com',
    rawHitCount: 12,
    consentBannerDetected: true,
    consentAccepted: true,
    events: [
      { name: 'purchase', vendor: 'GA4', parameters: ['value', 'currency', 'transaction_id'], count: 1 },
      { name: 'view_item', vendor: 'GA4', parameters: ['item_id'], count: 4 },
      { name: 'page_view', vendor: 'GA4', parameters: [], count: 1 },
    ],
  };
}

const NOW = '2026-06-10T12:00:00.000Z';

// ─── Happy path ───

test('full coverage → verdict pass, overall 1, all implemented', () => {
  const r = evaluateReadiness(plan(), observedFull(), { now: NOW });
  assert.equal(r.verdict, 'pass');
  assert.equal(r.scores.overall, 1);
  assert.equal(r.scores.eventCoverage, 1);
  assert.equal(r.scores.keyEventCoverage, 1);
  assert.equal(r.scores.consentReady, true);
  assert.ok(r.events.every((e) => e.status === 'implemented'));
  assert.equal(r.meta.evaluatedAt, NOW);
  assert.equal(r.meta.readinessSchemaVersion, READINESS_SCHEMA_VERSION);
  assert.equal(r.observedSummary.totalObservedEvents, 3);
  assert.equal(r.observedSummary.matchedObservedEvents, 3);
  assert.equal(r.observedSummary.skippedObservedEvents, 0);
  assert.equal(r.observedSummary.unplannedObservedEvents.length, 0);
});

test('a pass always implies full key-event coverage', () => {
  const r = evaluateReadiness(plan(), observedFull(), { now: NOW });
  if (r.verdict === 'pass') assert.equal(r.scores.keyEventCoverage, 1);
});

// ─── Missing events ───

test('missing key event → verdict fail with a blocking issue', () => {
  const obs = observedFull();
  obs.events = obs.events.filter((e) => e.name !== 'purchase');
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.events.find((e) => e.eventId === 'e_purchase')?.status, 'missing');
  assert.ok(r.issues.some((i) => i.code === 'key_event_missing' && i.severity === 'blocking'));
});

test('missing only a non-key event → verdict warn (no blocker)', () => {
  const obs = observedFull();
  obs.events = obs.events.filter((e) => e.name !== 'view_item');
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.verdict, 'warn');
  assert.ok(r.issues.some((i) => i.code === 'event_missing' && i.severity === 'warning'));
  assert.ok(!r.issues.some((i) => i.severity === 'blocking'));
});

// ─── False-FAIL guard (finding #1): key conversions fire, supporting gaps remain ───

test('all key events fire but most supporting events missing → warn, never fail', () => {
  const p = plan();
  p.events = [
    event('e_purchase', 'purchase', true), // key, no required params
    event('e_generate_lead', 'generate_lead', true), // key, no required params
    ...Array.from({ length: 8 }, (_, i) => event(`e_s${i}`, `support_${i}`, false)),
  ];
  const obs: ObservedSignals = {
    url: 'x',
    rawHitCount: 20,
    events: [
      { name: 'purchase', count: 1 },
      { name: 'generate_lead', count: 1 },
    ],
  };
  const r = evaluateReadiness(p, obs, { now: NOW });
  assert.equal(r.scores.keyEventCoverage, 1); // every conversion fires
  assert.ok(r.scores.overall < READINESS_THRESHOLDS.warn); // low overall coverage
  assert.equal(r.verdict, 'warn'); // ...but NOT fail — conversions are fine
  assert.ok(!r.issues.some((i) => i.severity === 'blocking'));
});

// ─── Parameters ───

test('misconfigured KEY event (missing required param) → fail, blocking', () => {
  const obs = observedFull();
  obs.events[0].parameters = ['value']; // purchase drops required `currency`
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  const purchase = r.events.find((e) => e.eventId === 'e_purchase');
  assert.equal(purchase?.status, 'misconfigured');
  assert.deepEqual(purchase?.missingRequiredParameters, ['currency']);
  assert.equal(r.scores.keyEventCoverage, 0);
  assert.equal(r.verdict, 'fail');
  assert.ok(r.issues.some((i) => i.code === 'key_event_misconfigured' && i.severity === 'blocking'));
});

test('misconfigured NON-key event → warn (not blocking)', () => {
  const obs = observedFull();
  obs.events[1].parameters = ['something_else']; // view_item fired, no item_id
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  const viewItem = r.events.find((e) => e.eventId === 'e_view_item');
  assert.equal(viewItem?.status, 'misconfigured');
  assert.deepEqual(viewItem?.missingRequiredParameters, ['item_id']);
  assert.equal(r.verdict, 'warn');
  assert.ok(r.issues.some((i) => i.code === 'event_misconfigured' && i.severity === 'warning'));
  assert.ok(!r.issues.some((i) => i.severity === 'blocking'));
});

test('empty observed params are treated as unknown, not missing (no penalty)', () => {
  const obs = observedFull();
  obs.events[0].parameters = []; // purchase captured with no params
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.events.find((e) => e.eventId === 'e_purchase')?.status, 'implemented');
  assert.equal(r.verdict, 'pass');
});

test('checkParameters:false skips param validation', () => {
  const obs = observedFull();
  obs.events[0].parameters = ['value']; // missing currency
  const r = evaluateReadiness(plan(), obs, { now: NOW, checkParameters: false });
  assert.equal(r.events.find((e) => e.eventId === 'e_purchase')?.status, 'implemented');
});

// ─── Param check is per-firing, not a cross-vendor union (finding #6) ───

test('required params must be satisfied by a SINGLE firing, not a union across vendors', () => {
  const obs = observedFull();
  // Two distinct destinations both fire "purchase", each carrying only half the
  // required params. Neither real hit is complete — must not pass via the union.
  obs.events[0] = { name: 'purchase', vendor: 'GA4', parameters: ['value'], count: 1 };
  obs.events.push({ name: 'Purchase', vendor: 'MetaPixel', parameters: ['currency'], count: 1 });
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  const purchase = r.events.find((e) => e.eventId === 'e_purchase');
  assert.equal(purchase?.status, 'misconfigured');
  assert.equal(r.verdict, 'fail'); // key event broken
});

// ─── Claim-once: colliding planned names can't share one firing (finding #5) ───

test('two planned events normalizing to the same name cannot both claim one firing', () => {
  const p = plan();
  p.events = [
    event('e_a', 'generate_lead', true),
    event('e_b', 'generate__lead', true), // distinct id, collides under normalization
  ];
  const obs: ObservedSignals = { url: 'x', rawHitCount: 4, events: [{ name: 'generate_lead', count: 1 }] };
  const r = evaluateReadiness(p, obs, { now: NOW });
  const statuses = r.events.map((e) => e.status).sort();
  assert.deepEqual(statuses, ['implemented', 'missing']); // exactly one claims it
  assert.equal(r.observedSummary.matchedObservedEvents, 1);
  assert.equal(r.verdict, 'fail'); // the unmatched one is a missing key event
});

// ─── Capture health ───

test('no signals captured (rawHitCount 0) → blocking, fail, capture-failure message', () => {
  const obs: ObservedSignals = { url: 'https://staging.example.com', events: [], rawHitCount: 0 };
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.verdict, 'fail');
  const issue = r.issues.find((i) => i.code === 'no_signals_captured');
  assert.equal(issue?.severity, 'blocking');
  assert.match(issue?.message ?? '', /capture failed/);
});

test('no events but raw hits seen → different (misconfigured-vendor) message', () => {
  const obs: ObservedSignals = { url: 'https://staging.example.com', events: [], rawHitCount: 5 };
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.match(r.issues.find((i) => i.code === 'no_signals_captured')?.message ?? '', /raw network hit/);
});

test('malformed observed entries are skipped and counted, never thrown', () => {
  const obs = {
    url: 'x',
    rawHitCount: 3,
    events: [{ name: 'purchase', parameters: ['value', 'currency'], count: 1 }, { name: 123 }, null, { name: '...' }],
  } as unknown as ObservedSignals;
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.observedSummary.skippedObservedEvents, 3);
  assert.equal(r.observedSummary.totalObservedEvents, 1); // only "purchase" indexed
  assert.equal(r.events.find((e) => e.eventId === 'e_purchase')?.status, 'implemented');
});

// ─── Consent ───

test('consent required but no banner detected → warning, consentReady false', () => {
  const obs = observedFull();
  obs.consentBannerDetected = false;
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.scores.consentReady, false);
  assert.ok(r.issues.some((i) => i.code === 'consent_banner_not_detected'));
  assert.equal(r.verdict, 'warn');
});

test('consent required but banner status unknown (undefined) → lenient: consentReady true, pass', () => {
  const obs = observedFull();
  obs.consentBannerDetected = undefined;
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.scores.consentReady, true);
  assert.ok(!r.issues.some((i) => i.code === 'consent_banner_not_detected'));
  assert.equal(r.verdict, 'pass');
});

test('event-level consent (consentModeRequired false) still drives consentReady', () => {
  const p = plan();
  p.consent = consent(false); // mode not required, but purchase.requiresConsent === true
  const obs = observedFull();
  obs.consentBannerDetected = false;
  const r = evaluateReadiness(p, obs, { now: NOW });
  assert.equal(r.scores.consentReady, false);
  assert.ok(r.issues.some((i) => i.code === 'consent_banner_not_detected'));
});

// ─── Orphans ───

test('observed events not in the plan are reported as info orphans (merged by name)', () => {
  const obs = observedFull();
  obs.events.push({ name: 'Scroll Depth', vendor: 'GA4', count: 2 });
  obs.events.push({ name: 'scroll-depth', vendor: 'GA4', count: 1 }); // same normalized name
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.deepEqual(r.observedSummary.unplannedObservedEvents, ['Scroll Depth']); // one entry, first-seen name
  const orphan = r.issues.find((i) => i.code === 'unplanned_events');
  assert.equal(orphan?.severity, 'info');
  assert.match(orphan?.message ?? '', /1 event/);
  assert.equal(r.verdict, 'pass'); // info does not block
});

// ─── Destination scope (finding #7): name-only matching, destination not verified ───

test('an event firing to an unexpected destination still counts (destination is out of scope here)', () => {
  const obs = observedFull();
  obs.events[0].destinationId = 'G-WRONGPROP';
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.events.find((e) => e.eventId === 'e_purchase')?.status, 'implemented');
  assert.equal(r.verdict, 'pass');
});

// ─── Name normalization ───

test('normalizeEventName is case/separator-insensitive but does not over-collapse', () => {
  assert.equal(normalizeEventName('Add To Cart'), 'add_to_cart');
  assert.equal(normalizeEventName('add-to-cart'), 'add_to_cart');
  assert.equal(normalizeEventName('  view.item  '), 'view_item');
  assert.equal(normalizeEventName('product_click'), 'product_click'); // trailing modifier kept
});

test('planned event matches a differently-cased/separated observed name', () => {
  const obs = observedFull();
  obs.events[1].name = 'View-Item';
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.events.find((e) => e.eventId === 'e_view_item')?.status, 'implemented');
});

// ─── Thresholds & knobs ───

test('default thresholds are pass 0.9 / warn 0.6', () => {
  assert.equal(READINESS_THRESHOLDS.pass, 0.9);
  assert.equal(READINESS_THRESHOLDS.warn, 0.6);
});

test('warn threshold is a sparseness floor for plans with NO key events', () => {
  const p = plan();
  p.events = Array.from({ length: 5 }, (_, i) => event(`e_s${i}`, `support_${i}`, false));
  const obs: ObservedSignals = { url: 'x', rawHitCount: 5, events: [{ name: 'support_0', count: 1 }] };
  // overall ≈ 0.2: below default warn 0.6 → fail; below a lowered warn → warn.
  assert.equal(evaluateReadiness(p, obs, { now: NOW }).verdict, 'fail');
  assert.equal(evaluateReadiness(p, obs, { now: NOW, thresholds: { pass: 0.9, warn: 0.1 } }).verdict, 'warn');
});

test('keyEventWeight changes the overall score', () => {
  const obs = observedFull();
  obs.events = obs.events.filter((e) => e.name !== 'view_item'); // 1 key impl + 1 non-key missing + page_view impl
  const heavy = evaluateReadiness(plan(), obs, { now: NOW, keyEventWeight: 5 });
  const light = evaluateReadiness(plan(), obs, { now: NOW, keyEventWeight: 1 });
  assert.ok(heavy.scores.overall > light.scores.overall);
});

test('misconfiguredCredit changes the overall score', () => {
  const p = plan();
  p.events = [event('e_view_item', 'view_item', false, { parameters: [param('item_id', true)] })];
  const obs: ObservedSignals = { url: 'x', rawHitCount: 1, events: [{ name: 'view_item', parameters: ['nope'], count: 1 }] };
  assert.equal(evaluateReadiness(p, obs, { now: NOW, misconfiguredCredit: 0 }).scores.overall, 0);
  assert.equal(evaluateReadiness(p, obs, { now: NOW, misconfiguredCredit: 1 }).scores.overall, 1);
});

test('observed.url empty falls back to plan.meta.url', () => {
  const obs = observedFull();
  obs.url = '';
  const r = evaluateReadiness(plan(), obs, { now: NOW });
  assert.equal(r.meta.url, 'https://staging.example.com');
});

// ─── Determinism ───

test('same inputs produce a deeply equal report', () => {
  const a = evaluateReadiness(plan(), observedFull(), { now: NOW });
  const b = evaluateReadiness(plan(), observedFull(), { now: NOW });
  assert.deepEqual(a, b);
});

// ─── Input & option guards ───

test('throws on an empty plan.events', () => {
  const p = plan();
  p.events = [];
  assert.throws(() => evaluateReadiness(p, observedFull()), /non-empty array/);
});

test('throws on a non-array observed.events', () => {
  const bad = { url: 'x', events: null } as unknown as ObservedSignals;
  assert.throws(() => evaluateReadiness(plan(), bad), /observed\.events must be an array/);
});

test('rejects NaN thresholds rather than silently passing everything', () => {
  assert.throws(
    () => evaluateReadiness(plan(), observedFull(), { thresholds: { pass: NaN, warn: NaN } }),
    /thresholds\.(pass|warn) must be a finite number/
  );
});

test('rejects inverted thresholds (warn > pass)', () => {
  assert.throws(
    () => evaluateReadiness(plan(), observedFull(), { thresholds: { pass: 0.5, warn: 0.9 } }),
    /warn must be <= .*pass/
  );
});

test('rejects a non-positive keyEventWeight', () => {
  assert.throws(() => validateReadinessOptions({ keyEventWeight: 0 }), /keyEventWeight must be a positive/);
  assert.throws(() => validateReadinessOptions({ keyEventWeight: -1 }), /keyEventWeight must be a positive/);
});

test('rejects misconfiguredCredit outside [0, 1]', () => {
  assert.throws(() => validateReadinessOptions({ misconfiguredCredit: 2 }), /misconfiguredCredit must be a finite number/);
});
