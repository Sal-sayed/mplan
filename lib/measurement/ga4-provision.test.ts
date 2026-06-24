/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for createGa4Property. The GA4 client is injected, so no live API:
// asserts it creates a property under the account + a web data stream, returns the
// Measurement ID, applies defaults, and handles 0 / 1 / many accounts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGa4Property, NeedsAccountSelection, type Ga4ProvisionClient } from './ga4-provision.ts';
import type { MeasurementPlan } from './types.ts';

function plan(url = 'https://shop.example.com'): MeasurementPlan {
  return {
    meta: { url, businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [], events: [], dataLayer: [],
    consent: { categoriesUsed: [], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: [], customDimensions: [] }, gtm: { suggestedTagCount: 0, notes: '' } },
  };
}

function fakeClient(overrides: Partial<Ga4ProvisionClient> = {}): { client: Ga4ProvisionClient; calls: any } {
  const calls = { properties: [] as any[], streams: [] as any[] };
  const base: Ga4ProvisionClient = {
    listAccounts: async () => [{ accountId: '900', name: 'My GA Account' }],
    createProperty: async (args) => { calls.properties.push(args); return { propertyId: '456', displayName: args.displayName }; },
    createWebDataStream: async (args) => { calls.streams.push(args); return { measurementId: 'G-TEST123', streamId: '789' }; },
  };
  return { client: { ...base, ...overrides }, calls };
}

const input = (over: Record<string, unknown> = {}) => ({ plan: plan(), token: 't', ...over });

test('single account → creates property + web stream, returns the Measurement ID', async () => {
  const { client, calls } = fakeClient();
  const result = await createGa4Property(input(), client);
  assert.equal(calls.properties.length, 1);
  assert.equal(calls.properties[0].accountId, '900');
  assert.equal(calls.streams.length, 1);
  assert.equal(result.measurementId, 'G-TEST123');
  assert.equal(result.propertyId, '456');
  assert.equal(result.accountName, 'My GA Account');
});

test('defaults: property name = site host, time zone UTC, currency USD, absolute stream URI', async () => {
  const { client, calls } = fakeClient();
  await createGa4Property(input(), client);
  assert.equal(calls.properties[0].displayName, 'shop.example.com');
  assert.equal(calls.properties[0].timeZone, 'Etc/UTC');
  assert.equal(calls.properties[0].currencyCode, 'USD');
  assert.equal(calls.streams[0].defaultUri, 'https://shop.example.com');
});

test('overrides are honored (name, time zone, currency)', async () => {
  const { client, calls } = fakeClient();
  await createGa4Property(input({ displayName: 'My Shop', timeZone: 'Asia/Kolkata', currencyCode: 'inr' }), client);
  assert.equal(calls.properties[0].displayName, 'My Shop');
  assert.equal(calls.properties[0].timeZone, 'Asia/Kolkata');
  assert.equal(calls.properties[0].currencyCode, 'INR', 'currency is upper-cased');
});

test('zero GA4 accounts → throws a clear error (cannot create an account via API)', async () => {
  const { client } = fakeClient({ listAccounts: async () => [] });
  await assert.rejects(() => createGa4Property(input(), client), /No Google Analytics account/i);
});

test('multiple accounts and none chosen → NeedsAccountSelection with the list', async () => {
  const { client } = fakeClient({ listAccounts: async () => [{ accountId: '1', name: 'A' }, { accountId: '2', name: 'B' }] });
  await assert.rejects(
    () => createGa4Property(input(), client),
    (err: unknown) => {
      assert.ok(err instanceof NeedsAccountSelection);
      assert.equal((err as NeedsAccountSelection).needsAccount, true);
      assert.equal((err as NeedsAccountSelection).accounts.length, 2);
      return true;
    }
  );
});

test('multiple accounts + chosen accountId → creates under the chosen one', async () => {
  const { client, calls } = fakeClient({ listAccounts: async () => [{ accountId: '1', name: 'A' }, { accountId: '2', name: 'B' }] });
  await createGa4Property(input({ accountId: '2' }), client);
  assert.equal(calls.properties[0].accountId, '2');
});

test('throws if the stream returns no Measurement ID is surfaced by the writer (client contract)', async () => {
  // The provisioner trusts the client to throw on a missing id; simulate it.
  const { client } = fakeClient({ createWebDataStream: async () => { throw new Error('GA4 created the stream but returned no Measurement ID.'); } });
  await assert.rejects(() => createGa4Property(input(), client), /no Measurement ID/i);
});
