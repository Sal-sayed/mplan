// Pure unit tests for the threshold Data Validation agent. getHistory is injected
// (the DI seam), so no store/Supabase — just the threshold logic + the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateMetrics } from './data-validation.ts';
import type { Ga4MetricDaily } from './metric-store.ts';

function series(values: number[], startDay = 1): Ga4MetricDaily[] {
  return values.map((value, i) => ({
    propertyId: '123',
    metricName: 'eventCount',
    dimensionValue: 'purchase',
    date: `2026-06-${String(startDay + i).padStart(2, '0')}`,
    value,
    fetchedAt: '2026-06-12T00:00:00.000Z',
  }));
}
const inject = (rows: Ga4MetricDaily[]) => async () => rows;
const target = { propertyId: '123', metricName: 'eventCount', dimensionValue: 'purchase' };

test('a drop > threshold vs the trailing average → regression (dropped)', async () => {
  // trailing ~10/day, latest crashes to 2 (80% drop).
  const r = await validateMetrics(target, {}, inject(series([10, 11, 9, 10, 2])));
  assert.equal(r.verdict, 'regression');
  assert.equal(r.finding?.kind, 'dropped');
  assert.equal(r.finding?.severity, 'warning');
  assert.equal(r.finding?.latestValue, 2);
});

test('a metric that fired then went to 0 → regression (zero_fire, critical)', async () => {
  const r = await validateMetrics(target, {}, inject(series([8, 9, 7, 8, 0])));
  assert.equal(r.verdict, 'regression');
  assert.equal(r.finding?.kind, 'zero_fire');
  assert.equal(r.finding?.severity, 'critical');
});

test('LOAD-BEARING: insufficient history → inconclusive, NOT a false regression', async () => {
  // 2 days < default minHistoryDays (4); even a huge drop must not alarm.
  const r = await validateMetrics(target, {}, inject(series([100, 1])));
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.finding, undefined);
  assert.equal(r.daysObserved, 2);
});

test('a steady metric → ok', async () => {
  const r = await validateMetrics(target, {}, inject(series([10, 11, 9, 10, 10])));
  assert.equal(r.verdict, 'ok');
  assert.equal(r.finding, undefined);
});

test('a within-threshold dip → ok (not every wobble is a regression)', async () => {
  // ~30% dip with a 50% threshold → still ok.
  const r = await validateMetrics(target, {}, inject(series([10, 10, 10, 10, 7])));
  assert.equal(r.verdict, 'ok');
});

test('zero baseline (never fired) with a zero latest → ok, no false zero_fire', async () => {
  const r = await validateMetrics(target, {}, inject(series([0, 0, 0, 0, 0])));
  assert.equal(r.verdict, 'ok');
});

// ── Synthetic seed scenarios — the permanent in-memory guard mirroring the dev
// script scripts/seed-and-verify-metrics.mjs. Same three histories; here driven
// through the injected DI seam so the logic is covered in CI without Supabase.
// Keep these series IN SYNC with STABLE/DROP/THIN in that script.
const SYNTHETIC_STABLE = [98, 102, 100, 99, 101, 100, 100, 103, 97, 100, 101, 99, 100, 100];
const SYNTHETIC_DROP = [...Array(13).fill(100), 20];
const SYNTHETIC_THIN = [100, 20];

test('synthetic STABLE (14d ~100/day) → ok', async () => {
  const r = await validateMetrics(target, {}, inject(series(SYNTHETIC_STABLE)));
  assert.equal(r.verdict, 'ok');
});

test('synthetic DROP (100/day → 20) → regression (dropped)', async () => {
  const r = await validateMetrics(target, {}, inject(series(SYNTHETIC_DROP)));
  assert.equal(r.verdict, 'regression');
  assert.equal(r.finding?.kind, 'dropped');
});

test('synthetic THIN (2 days) → inconclusive, never a false regression', async () => {
  const r = await validateMetrics(target, {}, inject(series(SYNTHETIC_THIN)));
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.finding, undefined);
});
