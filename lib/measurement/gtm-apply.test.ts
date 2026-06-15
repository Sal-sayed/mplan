/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for the Phase-B orchestration. The GTM client is injected, so no
// live API: asserts workspace + per-event trigger/tag + dataLayer variables,
// key-event-first order, per-event failure isolation, skip-existing, and the
// INVARIANT that it NEVER publishes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyPlanToGtm, type GtmApplyClient } from './gtm-apply.ts';
import type { MeasurementPlan } from './types.ts';

function plan(): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [],
    events: [
      { id: 'evt_pv', name: 'page_view', category: 'page', description: '', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: '', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [{ key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] }],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 2, notes: '' } },
  };
}

function fakeClient(overrides: Partial<GtmApplyClient> = {}): { client: GtmApplyClient; calls: any } {
  const calls = { workspace: [] as string[], variables: [] as string[], triggers: [] as string[], tags: [] as string[] };
  const base: GtmApplyClient = {
    resolveContainer: async () => ({ path: 'accounts/1/containers/2', name: 'Web', publicId: 'GTM-XXXX' }),
    createWorkspace: async (_cp, name) => { calls.workspace.push(name); return { path: 'accounts/1/containers/2/workspaces/3', workspaceId: '3' }; },
    listVariableNames: async () => new Set<string>(),
    listTriggers: async () => new Map<string, string>(),
    listTagNames: async () => new Set<string>(),
    createDataLayerVariable: async (_wp, key) => { calls.variables.push(key); return { name: `dlv.${key}` }; },
    createTrigger: async (_wp, spec) => { calls.triggers.push(spec.name); return { triggerId: `trig_${spec.name}`, name: spec.name }; },
    createGa4EventTag: async (_wp, spec) => { calls.tags.push(spec.name); return { name: spec.name }; },
  };
  return { client: { ...base, ...overrides }, calls };
}

const input = (p = plan()) => ({ plan: p, containerId: 'GTM-XXXX', measurementId: 'G-ABC123', token: 't', now: new Date('2026-06-14T00:00:00.000Z') });

test('creates a workspace + a trigger and GA4 tag per event + the needed dataLayer variables', async () => {
  const { client, calls } = fakeClient();
  const result = await applyPlanToGtm(input(), client);
  assert.equal(calls.workspace.length, 1);
  assert.equal(result.created.triggers.length, 2);
  assert.equal(result.created.tags.length, 2);
  assert.deepEqual(result.created.variables, ['dlv.value']);
  assert.ok(result.reviewUrl.includes('tagmanager.google.com'));
  assert.equal(result.failures.length, 0);
});

test('INVARIANT: never publishes (result.published is always false)', async () => {
  const { client } = fakeClient();
  const result = await applyPlanToGtm(input(), client);
  assert.equal(result.published, false);
});

test('key events are applied first', async () => {
  const { client, calls } = fakeClient();
  await applyPlanToGtm(input(), client);
  assert.equal(calls.tags[0], 'GA4 — purchase');
});

test('a per-event failure is isolated — the other event still applies', async () => {
  const { client } = fakeClient({
    createGa4EventTag: async (_wp, spec) => { if (spec.eventName === 'purchase') throw new Error('boom'); return { name: spec.name }; },
  });
  const result = await applyPlanToGtm(input(), client);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].item, 'purchase');
  assert.ok(result.created.tags.includes('GA4 — page_view'));
});

test('skips items already in the container — no duplicates', async () => {
  const { client, calls } = fakeClient({
    listTagNames: async () => new Set(['GA4 — purchase']),
    listTriggers: async () => new Map([['purchase trigger', 'existing_id']]),
  });
  const result = await applyPlanToGtm(input(), client);
  assert.ok(result.skipped.tags.includes('GA4 — purchase'));
  assert.ok(result.skipped.triggers.includes('purchase trigger'));
  assert.ok(!calls.tags.includes('GA4 — purchase'), 'existing tag not re-created');
});

test('container not found → throws', async () => {
  const { client } = fakeClient({ resolveContainer: async () => null });
  await assert.rejects(() => applyPlanToGtm({ ...input(), containerId: 'GTM-NOPE' }, client), /not found/);
});
