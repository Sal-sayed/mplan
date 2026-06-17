// Unit tests for the plan-level per-event consent coverage view (no live site).
// Asserts one row per event, the ok / needs_attention rules, summary counts,
// needs_attention-first ordering, and — crucially — that the coverage verdict
// never disagrees with computeConsentCoherenceProblems (single source of truth).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConsentCoverage } from './consent-coverage.ts';
import { computeConsentCoherenceProblems } from './consent-compliance.ts';
import { buildPlanFromTemplate } from './template-plan.ts';
import type { BusinessModel, ConsentCategory, EventCategory, MeasurementPlan, TrackedEvent } from './types.ts';

function ev(over: Partial<TrackedEvent> & { id: string; name: string }): TrackedEvent {
  return {
    category: 'engagement' as EventCategory,
    description: '',
    trigger: '',
    isKeyEvent: false,
    requiresConsent: false,
    parameters: [],
    ...over,
  };
}

// Start from a real template (valid meta/tooling) and override the bits we test.
function planWith(events: TrackedEvent[], categoriesUsed: ConsentCategory[], consentModeRequired = false): MeasurementPlan {
  const base = buildPlanFromTemplate('ecommerce');
  return { ...base, events, consent: { categoriesUsed, consentModeRequired, notes: '' } };
}

test('one row per event; mixed events covered correctly', () => {
  const p = planWith(
    [
      ev({ id: 'e1', name: 'purchase', category: 'ecommerce' as EventCategory, isKeyEvent: true, requiresConsent: true }),
      ev({ id: 'e2', name: 'page_view', category: 'page' as EventCategory, requiresConsent: false }),
    ],
    ['analytics'],
  );
  const cov = buildConsentCoverage(p);
  assert.equal(cov.rows.length, 2);
  const purchase = cov.rows.find((r) => r.eventId === 'e1')!;
  const pageView = cov.rows.find((r) => r.eventId === 'e2')!;
  assert.equal(purchase.status, 'ok'); // requiresConsent + 'analytics' covered
  assert.equal(purchase.consentCategoryCovered, true);
  assert.equal(pageView.status, 'ok'); // no consent required
  assert.match(pageView.note, /No consent required/i);
});

test('requiresConsent event whose category is NOT in categoriesUsed → needs_attention', () => {
  const p = planWith(
    [ev({ id: 'e1', name: 'purchase', requiresConsent: true })],
    ['necessary'], // no 'analytics'
  );
  const cov = buildConsentCoverage(p);
  assert.equal(cov.rows[0].status, 'needs_attention');
  assert.equal(cov.rows[0].consentCategoryCovered, false);
  assert.match(cov.rows[0].note, /isn't in the plan's consent categories/i);
});

test('summary counts are correct', () => {
  const p = planWith(
    [
      ev({ id: 'e1', name: 'purchase', requiresConsent: true }), // gated, uncovered
      ev({ id: 'e2', name: 'add_to_cart', requiresConsent: true }), // gated, uncovered
      ev({ id: 'e3', name: 'page_view', requiresConsent: false }), // not gated
    ],
    ['necessary'],
  );
  const cov = buildConsentCoverage(p);
  assert.deepEqual(cov.summary, { totalEvents: 3, requiresConsentCount: 2, needsAttentionCount: 2 });
});

test('needs_attention rows sort first', () => {
  const p = planWith(
    [
      ev({ id: 'ok1', name: 'page_view', requiresConsent: false }), // ok
      ev({ id: 'bad1', name: 'purchase', requiresConsent: true }), // needs_attention (uncovered)
    ],
    ['necessary'],
  );
  const cov = buildConsentCoverage(p);
  assert.equal(cov.rows[0].eventId, 'bad1');
  assert.equal(cov.rows[0].status, 'needs_attention');
});

test('consistency: coverage needs_attention iff computeConsentCoherenceProblems flags the analytics gap (single source of truth)', () => {
  const gatedEvents = [ev({ id: 'e1', name: 'purchase', requiresConsent: true })];
  for (const categories of [['analytics'], ['necessary'], ['necessary', 'analytics'], []] as ConsentCategory[][]) {
    const p = planWith(gatedEvents, categories);
    const flaggedByCoherence = computeConsentCoherenceProblems(p).some((m) => /missing 'analytics'/.test(m));
    const flaggedByCoverage = buildConsentCoverage(p).summary.needsAttentionCount > 0;
    assert.equal(flaggedByCoverage, flaggedByCoherence, `mismatch for categories=${JSON.stringify(categories)}`);
  }
});

test('all 5 business-model templates produce a complete coverage table (row per event, no crash)', () => {
  const models: BusinessModel[] = ['ecommerce', 'saas', 'lead_gen', 'media_content', 'marketplace'];
  for (const m of models) {
    const plan = buildPlanFromTemplate(m);
    const cov = buildConsentCoverage(plan);
    assert.equal(cov.rows.length, plan.events.length, `row per event for ${m}`);
    assert.equal(cov.summary.totalEvents, plan.events.length);
    for (const r of cov.rows) assert.ok(r.status === 'ok' || r.status === 'needs_attention');
  }
});
