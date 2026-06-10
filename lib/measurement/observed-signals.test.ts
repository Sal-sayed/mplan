// observed-signals.test.ts — pure tests for the spy→ObservedSignals adapter.
// No browser: builds NormalizedEvent-shaped inputs directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toObservedSignals, type SpyCapture } from './observed-signals.ts';
import type { NormalizedEvent } from '../tracking-spy/parsers.ts';

function ev(partial: Partial<NormalizedEvent & { count: number }>): NormalizedEvent & { count: number } {
  return {
    eventName: 'event',
    source: 'GA4 (Measurement Protocol)',
    vendor: 'GA4',
    parameters: {},
    transport: 'fetch',
    method: 'POST',
    timestamp: 0,
    count: 1,
    ...partial,
  };
}

function spy(events: Array<NormalizedEvent & { count: number }>, rawHitCount = 0): SpyCapture {
  return { events, rawHitCount };
}

test('maps eventName/vendor/params/count and url through', () => {
  const obs = toObservedSignals(
    'https://staging.example.com',
    spy([ev({ eventName: 'purchase', vendor: 'GA4', parameters: { value: 49.99, currency: 'USD' }, count: 3 })], 12),
    { detected: true, accepted: true }
  );
  assert.equal(obs.url, 'https://staging.example.com');
  assert.equal(obs.rawHitCount, 12);
  assert.equal(obs.events.length, 1);
  assert.equal(obs.events[0].name, 'purchase');
  assert.equal(obs.events[0].vendor, 'GA4');
  assert.deepEqual(obs.events[0].parameters, ['value', 'currency']); // Object.keys
  assert.equal(obs.events[0].count, 3);
});

test('destinationId = measurementId ?? pixelId', () => {
  const obs = toObservedSignals(
    'x',
    spy([
      ev({ eventName: 'a', measurementId: 'G-ABC', pixelId: '123' }),
      ev({ eventName: 'b', measurementId: null, pixelId: '456' }),
      ev({ eventName: 'c' }), // neither
    ]),
    null
  );
  assert.equal(obs.events[0].destinationId, 'G-ABC'); // measurementId wins
  assert.equal(obs.events[1].destinationId, '456'); // falls back to pixelId
  assert.equal(obs.events[2].destinationId, undefined); // neither → undefined (not null)
});

test('consent {detected,accepted} → consentBannerDetected/consentAccepted', () => {
  const obs = toObservedSignals('x', spy([]), { detected: true, accepted: false });
  assert.equal(obs.consentBannerDetected, true);
  assert.equal(obs.consentAccepted, false);
});

test('null consent → consent flags undefined', () => {
  const obs = toObservedSignals('x', spy([]), null);
  assert.equal(obs.consentBannerDetected, undefined);
  assert.equal(obs.consentAccepted, undefined);
});

test('empty parameters → empty array', () => {
  const obs = toObservedSignals('x', spy([ev({ eventName: 'page_view', parameters: {} })]), null);
  assert.deepEqual(obs.events[0].parameters, []);
});
