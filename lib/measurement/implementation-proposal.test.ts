// Pure unit tests for buildImplementationProposal (Phase A — derivation only).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildImplementationProposal } from './implementation-proposal.ts';
import { buildPlanFromTemplate } from './template-plan.ts';
import type { BusinessModel, MeasurementPlan } from './types.ts';

const MODELS: BusinessModel[] = ['ecommerce', 'saas', 'lead_gen', 'media_content', 'marketplace'];

function plan(): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [{ id: 'kpi_rev', name: 'Revenue', description: '', metric: 'sum(value)', linkedEventIds: ['evt_purchase'] }],
    events: [
      { id: 'evt_pv', name: 'page_view', category: 'page', description: 'Standard page view.', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: 'Completed orders — the revenue event.', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 2, notes: '' } },
  };
}

test('one ProposalItem per event, each fully populated', () => {
  const p = plan();
  const proposal = buildImplementationProposal(p);
  assert.equal(proposal.items.length, p.events.length);
  for (const item of proposal.items) {
    assert.ok(item.trigger.type && item.trigger.condition, 'trigger present');
    assert.equal(item.tag.ga4EventName, item.eventName, 'tag GA4 event name matches the event');
    assert.ok(item.dataLayerSnippet.startsWith('dataLayer.push('), 'valid dataLayer.push snippet');
    assert.ok(item.dataLayerSnippet.includes(`'${item.eventName}'`), 'snippet contains the event name');
    assert.ok(item.explanation.trim().length > 0, 'non-empty explanation');
  }
});

test('key events are flagged and surfaced first', () => {
  const proposal = buildImplementationProposal(plan());
  assert.equal(proposal.items[0].isKeyEvent, true, 'a key event leads the list');
  assert.equal(proposal.items[0].eventName, 'purchase');
  assert.equal(proposal.summary.keyEvents, 1);
});

test('a param-bearing event maps params into the tag and the snippet', () => {
  const proposal = buildImplementationProposal(plan());
  const purchase = proposal.items.find((i) => i.eventName === 'purchase')!;
  assert.deepEqual(purchase.tag.parameters, [{ name: 'value', value: '{{dlv.value}}' }]);
  assert.ok(purchase.dataLayerSnippet.includes("'value': 49.99"), 'numeric example used from dataLayer');
});

test('thin description falls back to a derived explanation (never empty)', () => {
  const p = plan();
  p.events[0].description = '';
  const proposal = buildImplementationProposal(p);
  const pv = proposal.items.find((i) => i.eventName === 'page_view')!;
  assert.ok(pv.explanation.trim().length > 0);
  assert.ok(/page_view/.test(pv.explanation));
});

test('all 5 template plans yield a complete proposal with no empty fields', () => {
  for (const model of MODELS) {
    const proposal = buildImplementationProposal(buildPlanFromTemplate(model));
    assert.ok(proposal.items.length > 0, `${model}: has items`);
    for (const item of proposal.items) {
      assert.ok(item.trigger.type && item.trigger.condition, `${model}/${item.eventName}: trigger`);
      assert.ok(item.tag.ga4EventName.length > 0, `${model}/${item.eventName}: tag name`);
      assert.ok(item.dataLayerSnippet.includes(`'${item.eventName}'`), `${model}/${item.eventName}: snippet`);
      assert.ok(item.explanation.trim().length > 0, `${model}/${item.eventName}: explanation`);
    }
  }
});
