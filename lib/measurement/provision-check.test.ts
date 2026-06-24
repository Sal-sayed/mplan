// Unit tests for check-before-create: detect an existing GTM container / GA4
// property for a site (matched by name = host), the "can create only when none
// exists" rule, and the duplicate-name detector. Client injected — no live API.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkProvisionStatus, canCreate, isDuplicateNameError, siteHost, type ProvisionCheckClient } from './provision-check.ts';

function client(over: Partial<ProvisionCheckClient> = {}): ProvisionCheckClient {
  return {
    listContainers: async () => [],
    listProperties: async () => [],
    getMeasurementId: async () => null,
    ...over,
  };
}

const URL = 'https://shop.example.com/';

test('GTM container with the site name exists → gtm.exists true + the container id', async () => {
  const status = await checkProvisionStatus(URL, 't', client({
    listContainers: async () => [{ path: 'a/c', name: 'Shop.Example.com', publicId: 'GTM-ABC123' }],
  }));
  assert.equal(status.gtm.exists, true);
  assert.equal(status.gtm.containerId, 'GTM-ABC123');
});

test('no matching container → gtm.exists false', async () => {
  const status = await checkProvisionStatus(URL, 't', client({
    listContainers: async () => [{ path: 'a/c', name: 'some-other-site.com', publicId: 'GTM-ZZZ' }],
  }));
  assert.equal(status.gtm.exists, false);
});

test('GA4 property with the site name exists → ga4.exists true + property id + measurement id', async () => {
  const status = await checkProvisionStatus(URL, 't', client({
    listProperties: async () => [{ propertyId: '777', displayName: 'shop.example.com' }],
    getMeasurementId: async () => 'G-XYZ999',
  }));
  assert.equal(status.ga4.exists, true);
  assert.equal(status.ga4.propertyId, '777');
  assert.equal(status.ga4.measurementId, 'G-XYZ999');
});

test('no matching property → ga4.exists false', async () => {
  const status = await checkProvisionStatus(URL, 't', client());
  assert.equal(status.ga4.exists, false);
});

test('Meta is reported as unknown (not auto-checkable)', async () => {
  const status = await checkProvisionStatus(URL, 't', client());
  assert.equal(status.meta.status, 'unknown');
});

test('a read failure degrades to "not found", never throws', async () => {
  const status = await checkProvisionStatus(URL, 't', client({
    listContainers: async () => { throw new Error('403'); },
    listProperties: async () => { throw new Error('403'); },
  }));
  assert.equal(status.gtm.exists, false);
  assert.equal(status.ga4.exists, false);
});

test('canCreate is true only when nothing exists', () => {
  assert.equal(canCreate({ exists: false }), true);
  assert.equal(canCreate({ exists: true }), false);
});

test('isDuplicateNameError matches Google’s duplicate-name 400', () => {
  assert.equal(isDuplicateNameError(new Error('Create container failed (400): Found entity with duplicate name')), true);
  assert.equal(isDuplicateNameError(new Error('Some other error')), false);
  assert.equal(isDuplicateNameError(null), false);
});

test('siteHost strips protocol + trailing slash and lower-cases', () => {
  assert.equal(siteHost('https://Shop.Example.com/'), 'shop.example.com');
  assert.equal(siteHost('http://a.io'), 'a.io');
});
