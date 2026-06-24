/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for createContainerAndApply (the GTM-container auto-create flow). The
// client is injected, so no live API: asserts it creates a container under the
// account, populates variables + triggers, makes GA4 tags ONLY when a measurement
// id is given, handles 0 / 1 / many accounts, returns the new GTM-XXXX, and NEVER
// publishes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContainerAndApply, NeedsAccountSelection, type CreateContainerClient } from './gtm-apply.ts';
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

function fakeClient(overrides: Partial<CreateContainerClient> = {}): { client: CreateContainerClient; calls: any } {
  const calls = { createdContainers: [] as any[], workspace: [] as string[], variables: [] as string[], triggers: [] as string[], tags: [] as string[] };
  const base: CreateContainerClient = {
    listAccounts: async () => [{ accountId: '100', name: 'My GTM Account' }],
    createContainer: async (accountId, name) => {
      calls.createdContainers.push({ accountId, name });
      return { path: `accounts/${accountId}/containers/55`, name, publicId: 'GTM-NEW123' };
    },
    resolveContainer: async () => ({ path: 'accounts/100/containers/55', name: 'Web', publicId: 'GTM-NEW123' }),
    listWorkspaces: async () => new Map(),
    createWorkspace: async (_cp, name) => { calls.workspace.push(name); return { path: 'accounts/100/containers/55/workspaces/3', workspaceId: '3' }; },
    listVariableNames: async () => new Set<string>(),
    listTriggers: async () => new Map<string, string>(),
    listTagNames: async () => new Set<string>(),
    createDataLayerVariable: async (_wp, key) => { calls.variables.push(key); return { name: `dlv.${key}` }; },
    createTrigger: async (_wp, spec) => { calls.triggers.push(spec.name); return { triggerId: `trig_${spec.name}`, name: spec.name }; },
    createGa4EventTag: async (_wp, spec) => { calls.tags.push(spec.name); return { name: spec.name }; },
    createCustomHtmlTag: async (_wp, spec) => { calls.tags.push(spec.name); return { name: spec.name }; },
  };
  return { client: { ...base, ...overrides }, calls };
}

const input = (over: Record<string, unknown> = {}) => ({ plan: plan(), token: 't', now: new Date('2026-06-14T00:00:00.000Z'), ...over });

test('single account → creates a container under it, populates, returns the new GTM-XXXX', async () => {
  const { client, calls } = fakeClient();
  const result = await createContainerAndApply(input(), client);
  assert.equal(calls.createdContainers.length, 1);
  assert.equal(calls.createdContainers[0].accountId, '100');
  assert.equal(result.newContainerId, 'GTM-NEW123');
  assert.equal(result.accountName, 'My GTM Account');
  assert.equal(result.created.triggers.length, 2);
  assert.deepEqual(result.created.variables, ['dlv.value']);
});

test('no measurement id → variables + triggers only, NO GA4 tags', async () => {
  const { client, calls } = fakeClient();
  const result = await createContainerAndApply(input(), client);
  assert.equal(result.created.tags.length, 0, 'no GA4 tags without a measurement id');
  assert.equal(calls.tags.length, 0);
  assert.equal(result.created.triggers.length, 2, 'triggers still created');
});

test('with a measurement id → GA4 tags ARE created', async () => {
  const { client } = fakeClient();
  const result = await createContainerAndApply(input({ measurementId: 'G-ABC123' }), client);
  assert.equal(result.created.tags.length, 2);
  assert.ok(result.created.tags.includes('GA4 — purchase'));
});

test('default container name is the site host when none given', async () => {
  const { client, calls } = fakeClient();
  await createContainerAndApply(input(), client);
  assert.equal(calls.createdContainers[0].name, 'shop.example.com');
});

test('custom container name is used when provided', async () => {
  const { client, calls } = fakeClient();
  await createContainerAndApply(input({ containerName: 'My Shop Web' }), client);
  assert.equal(calls.createdContainers[0].name, 'My Shop Web');
});

test('zero GTM accounts → throws a clear error (cannot create an account via API)', async () => {
  const { client } = fakeClient({ listAccounts: async () => [] });
  await assert.rejects(() => createContainerAndApply(input(), client), /No Google Tag Manager account/i);
});

test('multiple accounts and none chosen → NeedsAccountSelection with the list', async () => {
  const { client } = fakeClient({
    listAccounts: async () => [{ accountId: '1', name: 'A' }, { accountId: '2', name: 'B' }],
  });
  await assert.rejects(
    () => createContainerAndApply(input(), client),
    (err: unknown) => {
      assert.ok(err instanceof NeedsAccountSelection);
      assert.equal((err as NeedsAccountSelection).needsAccount, true);
      assert.equal((err as NeedsAccountSelection).accounts.length, 2);
      return true;
    }
  );
});

test('multiple accounts + chosen accountId → creates under the chosen one', async () => {
  const { client, calls } = fakeClient({
    listAccounts: async () => [{ accountId: '1', name: 'A' }, { accountId: '2', name: 'B' }],
  });
  await createContainerAndApply(input({ accountId: '2' }), client);
  assert.equal(calls.createdContainers[0].accountId, '2');
});

test('INVARIANT: never publishes (result.published is always false)', async () => {
  const { client } = fakeClient();
  const result = await createContainerAndApply(input({ measurementId: 'G-ABC123' }), client);
  assert.equal(result.published, false);
});

test('Meta Pixel id → the new container also gets the Meta base + per-event tags', async () => {
  const { client } = fakeClient();
  const result = await createContainerAndApply(input({ metaPixelId: '123456789012345' }), client);
  assert.ok(result.created.tags.includes('Meta Pixel — Base'));
  assert.ok(result.created.tags.includes('Meta — purchase'));
});
