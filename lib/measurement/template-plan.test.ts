// template-plan.test.ts — the no-API plan generator must produce schema-valid,
// internally-consistent, clearly-flagged plans for every business model.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlanFromTemplate } from './template-plan.ts';
import { validateMeasurementPlan } from './generate-plan.ts';
import { runLaunchReadinessGate } from './launch-readiness.ts';
import type { BusinessModel, SiteContext } from './types.ts';

const MODELS: BusinessModel[] = ['ecommerce', 'saas', 'lead_gen', 'media_content', 'marketplace'];
const NOW = '2026-06-01T00:00:00.000Z';
const ctx = (): SiteContext => ({ mode: 'new', url: 'https://example.com' });
const GA4_SNAKE = /^[a-z0-9_]+$/;

for (const m of MODELS) {
  test(`buildPlanFromTemplate(${m}): schema-valid, flagged source=template, has key events`, () => {
    const plan = buildPlanFromTemplate(m, ctx(), NOW);
    validateMeasurementPlan(plan); // throws on any structural problem
    assert.equal(plan.meta.source, 'template');
    assert.equal(plan.meta.businessModel, m);
    assert.equal(plan.meta.schemaVersion, '1.0.0');
    assert.equal(plan.meta.generatedAt, NOW);
    assert.ok(plan.events.length >= 2, 'has page_view + template events');
    assert.ok(plan.events.every((e) => GA4_SNAKE.test(e.name)), 'all event names are snake_case');
    assert.ok(plan.events.some((e) => e.isKeyEvent), 'has at least one key event');
    // tooling.ga4.keyEvents reference real isKeyEvent ids
    const keyIds = new Set(plan.events.filter((e) => e.isKeyEvent).map((e) => e.id));
    assert.ok(plan.tooling.ga4.keyEvents.length > 0, 'GA4 key events populated');
    for (const ke of plan.tooling.ga4.keyEvents) {
      assert.ok(keyIds.has(ke), `ga4.keyEvents ${ke} maps to a real key event`);
    }
  });

  test(`buildPlanFromTemplate(${m}): passes deterministic launch-readiness (no blocking failures)`, async () => {
    const plan = buildPlanFromTemplate(m, ctx(), NOW);
    const { report } = await runLaunchReadinessGate({ url: plan.meta.url, plan });
    assert.deepEqual(report.blockingFailures, [], `${m}: ${JSON.stringify(report.blockingFailures)}`);
    assert.equal(report.decision, 'go_with_warnings'); // 9 live checks skip → never no_go
  });
}

test('buildPlanFromTemplate: unique event ids', () => {
  const plan = buildPlanFromTemplate('ecommerce', ctx(), NOW);
  const ids = plan.events.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('buildPlanFromTemplate: works with no ctx (defaults applied)', () => {
  const plan = buildPlanFromTemplate('saas');
  validateMeasurementPlan(plan);
  assert.equal(plan.meta.source, 'template');
});
