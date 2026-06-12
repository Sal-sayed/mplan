// Pure unit tests for diffReports — the drift engine. No mocks needed: it's a
// pure function over two LaunchReadinessReport values.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffReports } from './governance-diff.ts';
import type {
  LaunchReadinessReport,
  ReadinessCheck,
  ReadinessCheckId,
  CheckStatus,
  LaunchDecision,
} from './launch-readiness.ts';

function check(id: ReadinessCheckId, status: CheckStatus): ReadinessCheck {
  return {
    id,
    category: 'plan',
    name: id,
    status,
    blocking: true,
    dependsOn: 'plan',
    summary: '',
  };
}

function report(decision: LaunchDecision, checks: ReadinessCheck[]): LaunchReadinessReport {
  return {
    meta: {
      url: 'https://shop.example.com',
      businessModel: 'ecommerce',
      planSchemaVersion: '1.0.0',
      readinessSchemaVersion: '0.1.0',
      generatedAt: '2026-06-01T00:00:00.000Z',
    },
    decision,
    checks,
    blockingFailures: [],
    warnings: [],
    skipped: [],
    approval: { required: false },
  };
}

test('pass→fail is a regression and surfaces the check id', () => {
  const prev = report('go', [check('plan_has_key_event', 'pass')]);
  const curr = report('no_go', [check('plan_has_key_event', 'fail')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'regression');
  assert.deepEqual(drift.regressions, ['plan_has_key_event']);
  assert.ok(drift.summary.includes('plan_has_key_event'));
});

test('pass→warn is a regression (degraded)', () => {
  const prev = report('go', [check('consent_coherent', 'pass')]);
  const curr = report('go_with_warnings', [check('consent_coherent', 'warn')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'regression');
  assert.deepEqual(drift.regressions, ['consent_coherent']);
  assert.equal(drift.transitions.find((t) => t.id === 'consent_coherent')?.kind, 'degraded');
});

test('decision go_with_warnings→no_go is a regression even if checks are unchanged', () => {
  const prev = report('go_with_warnings', [check('event_ids_unique', 'pass')]);
  const curr = report('no_go', [check('event_ids_unique', 'pass')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'regression');
  assert.deepEqual(drift.decisionChange, { from: 'go_with_warnings', to: 'no_go' });
  assert.deepEqual(drift.regressions, []); // no check regressed; the decision did
});

test('LOAD-BEARING: pass→skipped is inconclusive, NOT a regression', () => {
  const prev = report('go', [check('ga4_key_events_registered', 'pass')]);
  const curr = report('go', [check('ga4_key_events_registered', 'skipped')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'inconclusive');
  assert.deepEqual(drift.inconclusive, ['ga4_key_events_registered']);
  assert.deepEqual(drift.regressions, []); // never a regression for a skipped check
});

test('a real regression dominates an inconclusive in the same run', () => {
  const prev = report('go', [
    check('plan_has_key_event', 'pass'),
    check('ga4_property_exists', 'pass'),
  ]);
  const curr = report('no_go', [
    check('plan_has_key_event', 'fail'), // confirmed regression
    check('ga4_property_exists', 'skipped'), // unverifiable this run
  ]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'regression');
  assert.deepEqual(drift.regressions, ['plan_has_key_event']);
  assert.deepEqual(drift.inconclusive, ['ga4_property_exists']);
});

test('identical reports = ok, no regressions, no inconclusive', () => {
  const checks = [check('event_ids_unique', 'pass'), check('kpi_links_resolve', 'pass')];
  const drift = diffReports(report('go', checks), report('go', checks));
  assert.equal(drift.verdict, 'ok');
  assert.deepEqual(drift.regressions, []);
  assert.deepEqual(drift.inconclusive, []);
});

test('recovery (fail→pass) is ok, not a regression', () => {
  const prev = report('no_go', [check('plan_has_key_event', 'fail')]);
  const curr = report('go', [check('plan_has_key_event', 'pass')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'ok');
  assert.deepEqual(drift.regressions, []);
});

test('skipped→fail (first verification, no prior baseline) does NOT alarm', () => {
  const prev = report('go', [check('ga4_property_exists', 'skipped')]);
  const curr = report('go', [check('ga4_property_exists', 'fail')]);
  const drift = diffReports(prev, curr);
  assert.equal(drift.verdict, 'ok');
  assert.deepEqual(drift.regressions, []);
  assert.deepEqual(drift.inconclusive, []);
});
