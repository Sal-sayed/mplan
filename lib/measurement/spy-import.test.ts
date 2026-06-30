import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceRawHits, observedSignalsFromHits, parseSpyCaptureJson } from './spy-import.ts';

const ga4 = (en: string, ts = 1) => ({
  vendor: 'GA4', transport: 'beacon' as const, method: 'POST',
  url: `https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&en=${en}`,
  body: null, timestamp: ts,
});

test('coerceRawHits fills defaults and keeps URL rows', () => {
  const hits = coerceRawHits([{ url: 'https://www.google-analytics.com/g/collect?en=purchase' }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].vendor, 'GA4');        // detected from the URL
  assert.equal(hits[0].method, 'POST');       // default
  assert.equal(hits[0].transport, 'fetch');   // default
});

test('coerceRawHits accepts a wrapper object and vendor aliases', () => {
  const hits = coerceRawHits({ hits: [{ vendor: 'ga4', url: 'https://x/g/collect?en=x' }, { vendor: 'facebook', url: 'https://www.facebook.com/tr?ev=Purchase' }] });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].vendor, 'GA4');
  assert.equal(hits[1].vendor, 'MetaPixel');
});

test('coerceRawHits drops empty rows and non-objects', () => {
  const hits = coerceRawHits([{}, null, 42, { url: '' }, { url: 'https://x/g/collect?en=ok' }]);
  assert.equal(hits.length, 1);
});

test('observedSignalsFromHits reconciles event names + counts from real hits', () => {
  const signals = observedSignalsFromHits('https://site.example', [ga4('purchase', 1), ga4('purchase', 2), ga4('page_view', 3)]);
  const byName = Object.fromEntries(signals.events.map((e) => [e.name, e.count]));
  assert.equal(byName['purchase'], 2, 'two purchase hits → count 2');
  assert.equal(byName['page_view'], 1);
  assert.equal(signals.rawHitCount, 3);
  // No consent observed via import → honestly "not verified", not a fabricated pass.
  assert.equal(signals.consentBannerDetected, undefined);
});

test('parseSpyCaptureJson throws a friendly error on invalid JSON', () => {
  assert.throws(() => parseSpyCaptureJson('not json'), /valid JSON/);
});

test('parseSpyCaptureJson parses a valid array', () => {
  const hits = parseSpyCaptureJson(JSON.stringify([ga4('sign_up')]));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].vendor, 'GA4');
});
