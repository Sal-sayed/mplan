// spy-import.ts — adapter for an EXTERNAL "Tracking Spy" capture (the browser
// extension's export) → the app's existing observed-events pipeline. The extension
// exports raw analytics requests; this coerces them into the app's RawHit shape,
// then reuses parseRawHits → dedupeEvents → toObservedSignals so the captured data
// flows through the SAME launch-readiness reconcile as the headless live capture.
//
// PURE (no Playwright, no network): parseRawHits/dedupeEvents/toObservedSignals are
// all pure, so this is unit-testable and safe to import server- or client-side.
//
// Ground-truth caveat: a capture is what fired in the session you exercised — far
// better than heuristic scraping, but not "everything" (only events you triggered,
// consent permitting). Readiness treats it as observed evidence, not absolutes.

import { parseRawHits, dedupeEvents, type RawHit } from '../tracking-spy/parsers.ts';
import { toObservedSignals } from './observed-signals.ts';
import type { ObservedSignals } from './types.ts';

// Canonical vendor keys the parser routes on (PARSERS in tracking-spy/parsers.ts).
const CANONICAL_VENDORS = new Set([
  'GA4', 'UA', 'MetaPixel', 'TikTokPixel', 'LinkedInInsight', 'GoogleAds', 'BingUET',
  'PinterestTag', 'TwitterPixel', 'Hotjar', 'Segment', 'Mixpanel', 'Amplitude', 'AdobeAnalytics', 'GTM',
]);

// Lenient aliases → canonical, so an extension labelling vendors loosely still maps.
const VENDOR_ALIASES: Record<string, string> = {
  ga4: 'GA4', gtag: 'GA4', 'google analytics 4': 'GA4', 'google-analytics': 'GA4', googleanalytics: 'GA4', ga: 'GA4',
  ua: 'UA', 'universal analytics': 'UA',
  meta: 'MetaPixel', metapixel: 'MetaPixel', facebook: 'MetaPixel', 'facebook pixel': 'MetaPixel', fb: 'MetaPixel', fbq: 'MetaPixel', pixel: 'MetaPixel',
  gtm: 'GTM', 'google tag manager': 'GTM', datalayer: 'GTM', 'data layer': 'GTM',
  tiktok: 'TikTokPixel', tiktokpixel: 'TikTokPixel',
  linkedin: 'LinkedInInsight', 'linkedin insight': 'LinkedInInsight',
  googleads: 'GoogleAds', 'google ads': 'GoogleAds', adwords: 'GoogleAds',
  bing: 'BingUET', uet: 'BingUET',
  pinterest: 'PinterestTag', twitter: 'TwitterPixel', x: 'TwitterPixel',
  hotjar: 'Hotjar', segment: 'Segment', mixpanel: 'Mixpanel', amplitude: 'Amplitude', adobe: 'AdobeAnalytics',
};

const TRANSPORTS = new Set(['fetch', 'xhr', 'beacon', 'image', 'dataLayer']);

// Best-effort vendor detection from the request URL — the fallback when the export
// didn't tag a vendor (or tagged one we don't recognise).
function detectVendor(url: string): string | null {
  const u = url.toLowerCase();
  if (/google-analytics\.com\/(g|mp)\/collect|\/g\/collect|region\d*\.google-analytics\.com|googletagmanager\.com\/(g|mp)\/collect/.test(u)) return 'GA4';
  if (/google-analytics\.com\/(collect|r\/collect)|__utm\.gif/.test(u)) return 'UA';
  if (/facebook\.com\/tr|connect\.facebook\.net/.test(u)) return 'MetaPixel';
  if (/googletagmanager\.com\/gtm\.js/.test(u)) return 'GTM';
  if (/analytics\.tiktok\.com/.test(u)) return 'TikTokPixel';
  if (/px\.ads\.linkedin\.com|linkedin\.com\/(li|px)/.test(u)) return 'LinkedInInsight';
  if (/googleadservices\.com|google\.com\/pagead|doubleclick\.net/.test(u)) return 'GoogleAds';
  if (/bat\.bing\.com/.test(u)) return 'BingUET';
  if (/ct\.pinterest\.com/.test(u)) return 'PinterestTag';
  if (/static\.ads-twitter\.com|analytics\.twitter\.com|t\.co\/i\/adsct/.test(u)) return 'TwitterPixel';
  if (/hotjar\.com/.test(u)) return 'Hotjar';
  if (/api\.segment\.io/.test(u)) return 'Segment';
  if (/api(-js)?\.mixpanel\.com/.test(u)) return 'Mixpanel';
  if (/api\d*\.amplitude\.com/.test(u)) return 'Amplitude';
  if (/\/b\/ss\/|2o7\.net|omtrdc\.net/.test(u)) return 'AdobeAnalytics';
  return null;
}

function normalizeVendor(raw: unknown, url: string, transport: RawHit['transport']): string {
  if (typeof raw === 'string' && raw.trim()) {
    const t = raw.trim();
    if (CANONICAL_VENDORS.has(t)) return t;
    const alias = VENDOR_ALIASES[t.toLowerCase()];
    if (alias) return alias;
  }
  const detected = url ? detectVendor(url) : null;
  if (detected) return detected;
  if (transport === 'dataLayer') return 'GTM'; // a dataLayer push with no URL → GTM
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'unknown';
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Coerce an extension export into the app's RawHit[]. Accepts a bare array or a
// wrapper object ({ hits | events | requests | captures: [...] }). Tolerant: fills
// sensible defaults, keeps anything parseable (a URL, a payload, or an event name),
// and drops empty rows. Never throws.
export function coerceRawHits(input: unknown): RawHit[] {
  let arr: any[] = [];
  if (Array.isArray(input)) arr = input;
  else if (input && typeof input === 'object') {
    const o = input as any;
    arr = o.hits ?? o.events ?? o.requests ?? o.captures ?? [];
  }
  if (!Array.isArray(arr)) return [];

  const out: RawHit[] = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const url = typeof it.url === 'string' ? it.url : '';
    const hasPayload = it.payload && typeof it.payload === 'object';
    const eventName = typeof it.eventName === 'string' ? it.eventName : typeof it.event === 'string' ? it.event : null;
    if (!url && !hasPayload && !eventName) continue; // nothing to parse from this row

    const transport: RawHit['transport'] = TRANSPORTS.has(it.transport)
      ? it.transport
      : !url && hasPayload
        ? 'dataLayer'
        : 'fetch';

    out.push({
      transport,
      vendor: normalizeVendor(it.vendor, url, transport),
      url,
      method: typeof it.method === 'string' ? it.method : 'POST',
      body: typeof it.body === 'string' ? it.body : it.body == null ? null : JSON.stringify(it.body),
      eventName,
      payload: hasPayload ? it.payload : null,
      timestamp: typeof it.timestamp === 'number' ? it.timestamp : 0,
    });
  }
  return out;
}

// Build ObservedSignals from captured RawHits — the same shape the headless live
// capture produces, so it reconciles against the plan identically. consent is null
// (the import doesn't observe the consent banner), so consent checks stay honestly
// "not verified" rather than fabricating a pass.
export function observedSignalsFromHits(url: string, hits: RawHit[]): ObservedSignals {
  const deduped = dedupeEvents(parseRawHits(hits));
  return toObservedSignals(url, { events: deduped, rawHitCount: hits.length }, null);
}

// Parse pasted JSON text → RawHit[] (for the import UI). Throws a friendly error on
// invalid JSON; otherwise coerces leniently.
export function parseSpyCaptureJson(text: string): RawHit[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That capture isn’t valid JSON. Export it from Tracking Spy and paste the whole thing.');
  }
  return coerceRawHits(data);
}
