// Split events by (detectable built-in trigger?) AND (rich app-state params?):
// detectable + no rich → gtmCapturable WITH its trigger; detectable + rich → rich;
// not detectable → rich. Conservative. The assistive file still contains only rich.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvents, routeEvent } from './event-routing.ts';
import { buildImplementationProposal } from './implementation-proposal.ts';
import { buildDataLayerArtifact } from '../github/datalayer-artifact.ts';
import type { EventParameter, MeasurementPlan, TrackedEvent } from './types.ts';

function ev(over: Partial<TrackedEvent> & Pick<TrackedEvent, 'id' | 'name' | 'category'>): TrackedEvent {
  return { description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [], ...over };
}
function param(over: Partial<EventParameter> & Pick<EventParameter, 'name' | 'source'>): EventParameter {
  return { type: 'string', required: false, description: '', ...over };
}
function planWith(events: TrackedEvent[]): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [], events,
    dataLayer: events.flatMap((e) => e.parameters.map((p) => ({ key: p.name, type: p.type, description: '', example: p.type === 'number' ? '1' : 'x', usedByEventIds: [e.id] }))),
    consent: { categoriesUsed: [], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: [], customDimensions: [] }, gtm: { suggestedTagCount: 0, notes: '' } },
  };
}

test('a plain form_submit with NO rich params → gtmCapturable via the Form Submit trigger', () => {
  const r = routeEvent(ev({ id: 'f', name: 'form_submit', category: 'form', parameters: [param({ name: 'form_name', source: 'page' }), param({ name: 'lead_type', source: 'page' })] }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'formSubmit' });
});

test('a contact (tel/whatsapp/email) link click with no rich params → gtmCapturable via a link Click trigger', () => {
  const r = routeEvent(ev({ id: 'c', name: 'contact', category: 'conversion', parameters: [param({ name: 'contact_type', source: 'page' })] }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'linkClick' });
});

test('a promo VIEW with no rich params → gtmCapturable via Element Visibility', () => {
  const r = routeEvent(ev({ id: 'v', name: 'view_promotion', category: 'engagement', parameters: [param({ name: 'promotion_name', source: 'page' })] }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'elementVisibility' });
});

test('a promo CTA click → gtmCapturable via a Click trigger', () => {
  const r = routeEvent(ev({ id: 's', name: 'select_promotion', category: 'engagement' }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'click' });
});

test('an SPA page/route change → gtmCapturable via History Change', () => {
  assert.deepEqual(routeEvent(ev({ id: 'p', name: 'page_view', category: 'page' })), { route: 'gtm', trigger: 'historyChange' });
});

test('detectable action WITH rich params (value/currency/ids/plan) → STILL needsRichPush', () => {
  assert.equal(routeEvent(ev({ id: 'gl', name: 'generate_lead', category: 'form', parameters: [param({ name: 'value', source: 'dataLayer', required: true })] })).route, 'rich');
  assert.equal(routeEvent(ev({ id: 'st', name: 'start_trial', category: 'conversion', parameters: [param({ name: 'plan_name', source: 'dataLayer', required: true })] })).route, 'rich');
  assert.equal(routeEvent(ev({ id: 'pu', name: 'purchase', category: 'ecommerce', parameters: [param({ name: 'value', source: 'dataLayer', required: true }), param({ name: 'currency', source: 'dataLayer' })] })).route, 'rich');
});

test('conservative: a required app-state-looking param (e.g. an id) even if labelled page-readable → needsRichPush', () => {
  const r = routeEvent(ev({ id: 'a', name: 'form_submit', category: 'form', parameters: [param({ name: 'plan_id', source: 'page', required: true })] }));
  assert.equal(r.route, 'rich', "don't over-promise GTM can read a money/id value off the page");
});

test('not detectable by any built-in trigger (no rich params) → still needsRichPush (conservative)', () => {
  assert.equal(routeEvent(ev({ id: 'x', name: 'level_complete', category: 'custom' })).route, 'rich');
});

test('classifyEvents: every gtmCapturable carries a valid trigger; the two sets never overlap', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'form_submit', category: 'form', parameters: [param({ name: 'form_name', source: 'page' })] }),
    ev({ id: 'g2', name: 'contact', category: 'conversion', parameters: [param({ name: 'contact_type', source: 'page' })] }),
    ev({ id: 'g3', name: 'view_promotion', category: 'engagement' }),
    ev({ id: 'r1', name: 'purchase', category: 'ecommerce', parameters: [param({ name: 'value', source: 'dataLayer', required: true })] }),
  ]);
  const { gtmCapturable, needsRichPush } = classifyEvents(plan);
  const VALID = new Set(['formSubmit', 'click', 'linkClick', 'elementVisibility', 'historyChange']);
  for (const g of gtmCapturable) assert.ok(VALID.has(g.trigger), `valid trigger for ${g.event.name}`);
  const gIds = new Set(gtmCapturable.map((g) => g.event.id));
  const rIds = new Set(needsRichPush.map((e) => e.id));
  assert.equal(gIds.size + rIds.size, plan.events.length, 'covers every event');
  assert.ok([...rIds].every((id) => !gIds.has(id)), 'no overlap between the two sets');
  assert.deepEqual([...gIds].sort(), ['g1', 'g2', 'g3']);
  assert.deepEqual([...rIds], ['r1']);
});

test('the assistive dataLayer file still contains ONLY the rich events', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'contact_submit', category: 'form' }), // detectable, no rich → GTM
    ev({ id: 'r1', name: 'purchase', category: 'ecommerce', parameters: [param({ name: 'value', source: 'dataLayer', required: true })] }),
  ]);
  const { needsRichPush } = classifyEvents(plan);
  const richIds = new Set(needsRichPush.map((e) => e.id));
  const items = buildImplementationProposal(plan).items.filter((it) => richIds.has(it.eventId));
  const art = buildDataLayerArtifact(items);
  assert.equal(art.eventCount, 1);
  assert.ok(art.contents.includes('purchase'), 'rich event is in the file');
  assert.ok(!art.contents.includes('contact_submit'), 'GTM-handled event is NOT in the file');
});
