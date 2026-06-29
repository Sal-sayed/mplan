import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPreliminaryView, formatTrend, formatChangepoint, formatWeeks,
  STATISTICAL_TIER_LABEL, NOT_VALIDATED_NOTE,
} from './metric-analysis-format.ts';
import type { MetricAnalysis } from './metric-analysis-store.ts';

function make(overrides: Partial<MetricAnalysis> = {}): MetricAnalysis {
  return {
    userId: 'u', propertyId: 'properties/1', metricName: 'eventCount', dimensionValue: 'purchase',
    changepointDetected: false, changepointDate: null,
    trend: 'flat', trendSlope: 0, weeksOfData: 2, confidence: 'low', validated: false,
    verdict: 'Preliminary (2.0w, not validated): trend flat; no clear shift.',
    caveats: ['preliminary — 2.0 week(s) of data', 'day-of-week effects not modelled', 'very thin data'],
    analyzedAt: '2026-01-15T00:00:00+00:00',
    ...overrides,
  };
}

test('trend formatting covers up/down/flat', () => {
  assert.equal(formatTrend(make({ trend: 'up' })), 'Trend: rising');
  assert.equal(formatTrend(make({ trend: 'down' })), 'Trend: falling');
  assert.equal(formatTrend(make({ trend: 'flat' })), 'Trend: flat');
});

test('changepoint formatting shows the date when detected, else a "no shift" line', () => {
  assert.equal(formatChangepoint(make({ changepointDetected: true, changepointDate: '2026-01-08' })), 'Possible shift around 2026-01-08');
  assert.equal(formatChangepoint(make({ changepointDetected: false, changepointDate: null })), 'No clear shift detected');
});

test('weeks formatting pluralises', () => {
  assert.equal(formatWeeks(make({ weeksOfData: 1 })), '1 week of data');
  assert.equal(formatWeeks(make({ weeksOfData: 2 })), '2 weeks of data');
});

test('the preliminary view ALWAYS carries the not-validated label + note + caveats', () => {
  const v = toPreliminaryView(make());
  assert.equal(v.label, STATISTICAL_TIER_LABEL);
  assert.match(v.label, /preliminary — not yet validated on real data/);
  assert.equal(v.note, NOT_VALIDATED_NOTE);
  assert.equal(v.validated, false);
  assert.ok(v.caveats.length > 0);
});

test('honesty fields survive even if caveats are somehow empty (never authoritative)', () => {
  const v = toPreliminaryView(make({ caveats: [] }));
  assert.equal(v.validated, false);
  assert.equal(v.note, NOT_VALIDATED_NOTE);
  // a standing day-of-week caveat is guaranteed
  assert.ok(v.caveats.some((c) => /day-of-week/.test(c)));
});
