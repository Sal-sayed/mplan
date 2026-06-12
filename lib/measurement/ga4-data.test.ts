/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for the GA4 Data API reader. Mocks global.fetch (the reader is raw
// fetch, like ga4-config) to verify row parsing + graceful 401/403/404 handling.

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { runGa4Report } from './ga4-data.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, json: any) {
  globalThis.fetch = (async () => ({ status, json: async () => json })) as unknown as typeof fetch;
}

const REQ = { propertyId: '123456', metrics: ['eventCount'], dimensions: ['date', 'eventName'], dateRange: { startDate: '3daysAgo', endDate: 'yesterday' } };

test('runGa4Report parses runReport rows and headers', async () => {
  mockFetch(200, {
    dimensionHeaders: [{ name: 'date' }, { name: 'eventName' }],
    metricHeaders: [{ name: 'eventCount' }],
    rows: [
      { dimensionValues: [{ value: '20260610' }, { value: 'purchase' }], metricValues: [{ value: '5' }] },
      { dimensionValues: [{ value: '20260610' }, { value: 'page_view' }], metricValues: [{ value: '120' }] },
    ],
  });
  const res = await runGa4Report(REQ, 'tok');
  assert.deepEqual(res.dimensionHeaders, ['date', 'eventName']);
  assert.deepEqual(res.metricHeaders, ['eventCount']);
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.rows[0].dimensionValues, ['20260610', 'purchase']);
  assert.deepEqual(res.rows[0].metricValues, ['5']);
});

test('empty/zero-row report parses to empty rows (no crash)', async () => {
  mockFetch(200, { dimensionHeaders: [{ name: 'date' }], metricHeaders: [{ name: 'eventCount' }] });
  const res = await runGa4Report(REQ, 'tok');
  assert.deepEqual(res.rows, []);
});

test('401 → graceful reconnect error', async () => {
  mockFetch(401, { error: { message: 'invalid' } });
  await assert.rejects(() => runGa4Report(REQ, 'tok'), /reconnect Google/i);
});

test('403 → graceful no-access error', async () => {
  mockFetch(403, { error: { message: 'denied' } });
  await assert.rejects(() => runGa4Report(REQ, 'tok'), /does not have access/i);
});

test('404 → empty result, not a throw', async () => {
  mockFetch(404, { error: { message: 'not found' } });
  const res = await runGa4Report(REQ, 'tok');
  assert.deepEqual(res, { dimensionHeaders: [], metricHeaders: [], rows: [] });
});
