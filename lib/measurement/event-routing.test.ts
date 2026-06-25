// Split events: GTM-capturable (auto, no code) vs needs-rich-push (developer places
// the dataLayer.push). Conservative. And the assistive dataLayer file must contain
// ONLY the rich events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvents, routeEvent } from './event-routing.ts';
import { buildImplementationProposal } from './implementation-proposal.ts';
import { buildDataLayerArtifact } from '../github/datalayer-artifact.ts';
import type { MeasurementPlan, TrackedEvent } from './types.ts';

function ev(over: Partial<TrackedEvent> & Pick<TrackedEvent, 'id' | 'name' | 'category'>): TrackedEvent {
  return { description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [], ...over };
}

function planWith(events: TrackedEvent[]): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [], events, dataLayer: events.flatMap((e) => e.parameters.map((p) => ({ key: p.name, type: p.type, description: '', example: p.type === 'number' ? '1' : 'x', usedByEventIds: [e.id] }))),
    consent: { categoriesUsed: [], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: [], customDimensions: [] }, gtm: { suggestedTagCount: 0, notes: '' } },
  };
}

test('rich app-state params (value, currency, item ids) → needsRichPush', () => {
  assert.equal(routeEvent(ev({ id: 'e', name: 'purchase', category: 'ecommerce', parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] })), 'rich');
  assert.equal(routeEvent(ev({ id: 'e', name: 'add_to_cart', category: 'engagement', parameters: [{ name: 'item_id', type: 'string', required: true, description: '', source: 'dataLayer' }] })), 'rich', 'even a click becomes rich if it carries app-state data');
});

test('a form-submit / click / page-view event with no or page-readable params → gtmCapturable', () => {
  assert.equal(routeEvent(ev({ id: 'e', name: 'contact_submit', category: 'form', parameters: [] })), 'gtm');
  assert.equal(routeEvent(ev({ id: 'e', name: 'cta_click', category: 'engagement', parameters: [{ name: 'link_url', type: 'string', required: false, description: '', source: 'page' }] })), 'gtm');
  assert.equal(routeEvent(ev({ id: 'e', name: 'page_view', category: 'page', parameters: [] })), 'gtm');
});

test('unsure category (custom / conversion) with no clear page action → needsRichPush (conservative)', () => {
  assert.equal(routeEvent(ev({ id: 'e', name: 'custom_thing', category: 'custom', parameters: [] })), 'rich');
  assert.equal(routeEvent(ev({ id: 'e', name: 'lead', category: 'conversion', parameters: [] })), 'rich');
});

test('classifyEvents partitions ALL events with no overlap', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'page_view', category: 'page' }),
    ev({ id: 'g2', name: 'cta_click', category: 'engagement' }),
    ev({ id: 'r1', name: 'purchase', category: 'ecommerce', parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] }),
  ]);
  const { gtmCapturable, needsRichPush } = classifyEvents(plan);
  const gIds = new Set(gtmCapturable.map((e) => e.id));
  const rIds = new Set(needsRichPush.map((e) => e.id));
  assert.equal(gIds.size + rIds.size, plan.events.length, 'covers every event');
  assert.ok([...rIds].every((id) => !gIds.has(id)), 'no overlap between the two sets');
  assert.deepEqual([...gIds].sort(), ['g1', 'g2']);
  assert.deepEqual([...rIds], ['r1']);
});

test('the assistive dataLayer file contains ONLY the rich events (not the GTM-handled ones)', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'contact_submit', category: 'form' }),
    ev({ id: 'r1', name: 'purchase', category: 'ecommerce', parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] }),
  ]);
  const { needsRichPush } = classifyEvents(plan);
  const richIds = new Set(needsRichPush.map((e) => e.id));
  const items = buildImplementationProposal(plan).items.filter((it) => richIds.has(it.eventId));
  const art = buildDataLayerArtifact(items);
  assert.equal(art.eventCount, 1);
  assert.ok(art.contents.includes('purchase'), 'rich event is in the file');
  assert.ok(!art.contents.includes('contact_submit'), 'GTM-handled event is NOT in the file');
});
