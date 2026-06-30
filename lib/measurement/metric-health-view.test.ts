import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictBadgeVariant, verdictLabel, overallTone } from './metric-health-view.ts';
import { toPreliminaryView } from './metric-analysis-format.ts';
import type { MetricAnalysis } from './metric-analysis-store.ts';

test('threshold verdict → badge variant (regression stays the serious one)', () => {
  assert.equal(verdictBadgeVariant('ok'), 'success');
  assert.equal(verdictBadgeVariant('regression'), 'danger');
  assert.equal(verdictBadgeVariant('inconclusive'), 'neutral');
});

test('verdict labels are plain, sentence-case', () => {
  assert.equal(verdictLabel.ok, 'healthy');
  assert.equal(verdictLabel.regression, 'needs attention');
  assert.equal(verdictLabel.inconclusive, 'not enough data');
});

test('overall tone: a regression leads with danger', () => {
  const t = overallTone({ regressions: 2, healthy: 1, total: 3 });
  assert.equal(t.variant, 'danger');
  assert.match(t.label, /2 events need attention/);
});

test('insufficient data (all inconclusive) → CALM warning, never danger', () => {
  const t = overallTone({ regressions: 0, healthy: 0, total: 3 });
  assert.equal(t.variant, 'warning'); // amber/calm — the don't-cry-wolf behavior
  assert.match(t.label, /Not enough history yet/);
});

test('all healthy → success; nothing to check → success (no false alarm)', () => {
  assert.equal(overallTone({ regressions: 0, healthy: 3, total: 3 }).variant, 'success');
  assert.equal(overallTone({ regressions: 0, healthy: 0, total: 0 }).variant, 'success');
});

test('the Python statistical tier keeps its preliminary / not-validated honesty after the restyle', () => {
  const a: MetricAnalysis = {
    userId: 'u', propertyId: 'p', metricName: 'eventCount', dimensionValue: 'purchase',
    changepointDetected: false, changepointDate: null, trend: 'flat', trendSlope: 0,
    weeksOfData: 2, confidence: 'low', validated: false, verdict: 'x',
    caveats: ['preliminary — 2 week(s) of data', 'day-of-week effects not modelled'],
    analyzedAt: '2026-01-01T00:00:00Z',
  };
  const view = toPreliminaryView(a);
  assert.match(view.label, /preliminary — not yet validated on real data/);
  assert.equal(view.validated, false);
  assert.ok(view.caveats.length > 0, 'caveats must survive the visual conversion');
});
