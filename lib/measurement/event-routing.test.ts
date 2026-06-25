// Classifier is STRUCTURAL + GENERIC: it routes by action type (triggerType/category)
// and parameter source ONLY — never by the event name. Tests use arbitrary names to
// prove name-independence.

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

test('a form-submission-category event with no rich params → gtmCapturable formSubmit (any name)', () => {
  const r = routeEvent(ev({ id: '1', name: 'evt_qwerty', category: 'form', parameters: [param({ name: 'p1', source: 'page' })] }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'formSubmit' });
});

test('a link-click event (triggerType=linkClick) with no rich params → gtmCapturable linkClick (arbitrary name)', () => {
  // category 'conversion' would be ambiguous by itself — the STRUCTURAL triggerType decides.
  const r = routeEvent(ev({ id: '2', name: 'evt_xyz', category: 'conversion', triggerType: 'linkClick', parameters: [param({ name: 'href', source: 'page' })] }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'linkClick' });
});

test('a click event (triggerType=click) with no rich params → gtmCapturable click (arbitrary name)', () => {
  const r = routeEvent(ev({ id: '3', name: 'foo_bar_baz', category: 'custom', triggerType: 'click' }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'click' });
});

test('an impression (triggerType=elementVisibility) with no rich params → elementVisibility (any name)', () => {
  const r = routeEvent(ev({ id: '4', name: 'zzz', category: 'engagement', triggerType: 'elementVisibility' }));
  assert.deepEqual(r, { route: 'gtm', trigger: 'elementVisibility' });
});

test('any event with a param source "appState" → needsRichPush (any name)', () => {
  assert.equal(routeEvent(ev({ id: '5', name: 'aaa', category: 'form', triggerType: 'formSubmit', parameters: [param({ name: 'amount', source: 'appState' })] })).route, 'rich');
});

test('a param source "unknown" → needsRichPush (conservative)', () => {
  assert.equal(routeEvent(ev({ id: '6', name: 'bbb', category: 'form', triggerType: 'formSubmit', parameters: [param({ name: 'x', source: 'unknown' })] })).route, 'rich');
});

test('legacy "dataLayer" source is still treated as rich → needsRichPush', () => {
  assert.equal(routeEvent(ev({ id: '7', name: 'ccc', category: 'engagement', triggerType: 'click', parameters: [param({ name: 'value', source: 'dataLayer' })] })).route, 'rich');
});

test('detectable action WITH rich params → needsRichPush (GTM catches the action, not the data)', () => {
  assert.equal(routeEvent(ev({ id: '8', name: 'ddd', category: 'form', triggerType: 'formSubmit', parameters: [param({ name: 'plan_value', source: 'appState', required: true })] })).route, 'rich');
});

test('action NOT detectable by any built-in trigger (no rich params) → needsRichPush', () => {
  // triggerType 'none' (or an ambiguous category with no triggerType) → conservative.
  assert.equal(routeEvent(ev({ id: '9', name: 'eee', category: 'custom', triggerType: 'none' })).route, 'rich');
  assert.equal(routeEvent(ev({ id: '9b', name: 'fff', category: 'conversion' })).route, 'rich', 'ambiguous category, no triggerType → rich');
});

test('triggerType OVERRIDES category; category is only a fallback', () => {
  // ecommerce category, but the structural action says it is just a visible offer.
  assert.deepEqual(routeEvent(ev({ id: '10', name: 'ggg', category: 'ecommerce', triggerType: 'elementVisibility' })), { route: 'gtm', trigger: 'elementVisibility' });
  // page category falls back to historyChange when no triggerType.
  assert.deepEqual(routeEvent(ev({ id: '11', name: 'hhh', category: 'page' })), { route: 'gtm', trigger: 'historyChange' });
});

test('NEVER branches on the event NAME: identical structure + different names → identical results', () => {
  const gtmStruct = { category: 'form' as const, triggerType: 'formSubmit' as const, parameters: [param({ name: 'p', source: 'page' })] };
  assert.deepEqual(
    routeEvent(ev({ id: 'a', name: 'alpha_event', ...gtmStruct })),
    routeEvent(ev({ id: 'b', name: 'totally_different_zzz', ...gtmStruct }))
  );
  const richStruct = { category: 'form' as const, triggerType: 'formSubmit' as const, parameters: [param({ name: 'q', source: 'appState' })] };
  const x = routeEvent(ev({ id: 'c', name: 'contact_call', ...richStruct }));
  const y = routeEvent(ev({ id: 'd', name: 'generate_lead', ...richStruct }));
  assert.deepEqual(x, y);
  assert.equal(x.route, 'rich');
});

test('classifyEvents: every gtmCapturable carries a valid trigger; the two sets never overlap', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'n1', category: 'form', triggerType: 'formSubmit', parameters: [param({ name: 'form_name', source: 'page' })] }),
    ev({ id: 'g2', name: 'n2', category: 'conversion', triggerType: 'linkClick', parameters: [param({ name: 'href', source: 'page' })] }),
    ev({ id: 'g3', name: 'n3', category: 'engagement', triggerType: 'elementVisibility' }),
    ev({ id: 'r1', name: 'n4', category: 'ecommerce', triggerType: 'click', parameters: [param({ name: 'value', source: 'appState', required: true })] }),
  ]);
  const { gtmCapturable, needsRichPush } = classifyEvents(plan);
  const VALID = new Set(['formSubmit', 'click', 'linkClick', 'elementVisibility', 'historyChange']);
  for (const g of gtmCapturable) assert.ok(VALID.has(g.trigger));
  const gIds = new Set(gtmCapturable.map((g) => g.event.id));
  const rIds = new Set(needsRichPush.map((e) => e.id));
  assert.equal(gIds.size + rIds.size, plan.events.length, 'covers every event');
  assert.ok([...rIds].every((id) => !gIds.has(id)), 'no overlap');
  assert.deepEqual([...gIds].sort(), ['g1', 'g2', 'g3']);
  assert.deepEqual([...rIds], ['r1']);
});

test('the assistive dataLayer file still contains ONLY the rich events', () => {
  const plan = planWith([
    ev({ id: 'g1', name: 'submit_thing', category: 'form', triggerType: 'formSubmit' }),
    ev({ id: 'r1', name: 'buy_thing', category: 'ecommerce', triggerType: 'click', parameters: [param({ name: 'value', source: 'appState', required: true })] }),
  ]);
  const { needsRichPush } = classifyEvents(plan);
  const richIds = new Set(needsRichPush.map((e) => e.id));
  const items = buildImplementationProposal(plan).items.filter((it) => richIds.has(it.eventId));
  const art = buildDataLayerArtifact(items);
  assert.equal(art.eventCount, 1);
  assert.ok(art.contents.includes('buy_thing'), 'rich event is in the file');
  assert.ok(!art.contents.includes('submit_thing'), 'GTM-handled event is NOT in the file');
});
