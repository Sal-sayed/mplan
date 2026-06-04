/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tracking Spy — Node-side payload parsers.
 *
 * Each parser converts a raw hit captured by `injected.js` into a normalized
 * NormalizedEvent. EVERY parser is wrapped so an unknown / malformed vendor
 * payload never crashes the audit — bad hits log a warning and are dropped.
 */

export interface RawHit {
  transport: 'fetch' | 'xhr' | 'beacon' | 'image' | 'dataLayer';
  vendor: string;
  url: string;
  method: string;
  body?: string | null;
  eventName?: string | null;
  payload?: Record<string, any> | null;
  timestamp: number;
}

export interface NormalizedEvent {
  eventName: string;
  source: string;        // human-readable vendor label
  vendor: string;        // canonical vendor key (matches RawHit.vendor)
  parameters: Record<string, any>;
  pixelId?: string | null;
  measurementId?: string | null;
  transport: RawHit['transport'];
  method: RawHit['method'];
  timestamp: number;
  isStandard?: boolean;
  rawUrlSample?: string; // truncated URL for debug context
}

// GA4 events that are auto-collected by gtag itself — useful for the
// "isStandard" flag so downstream UI can dim them.
const GA4_STANDARD_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'view_search_results', 'form_start', 'form_submit',
  'video_start', 'video_progress', 'video_complete', 'file_download', 'user_engagement',
  'session_start', 'first_visit', 'first_open',
]);

const META_STANDARD_EVENTS = new Set([
  'PageView', 'ViewContent', 'AddToCart', 'AddPaymentInfo', 'AddToWishlist',
  'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate', 'FindLocation',
  'InitiateCheckout', 'Lead', 'Purchase', 'Schedule', 'Search', 'StartTrial',
  'SubmitApplication', 'Subscribe',
]);

// Names to suppress from captured-event lists — see comment on the matching
// set in lib/existing-site-auditor.ts.
const GTM_INTERNAL_EVENTS = new Set([
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick',
  'gtm.formSubmit', 'gtm.historyChange', 'gtm.timer', 'gtm.scrollDepth',
  'gtm.video', 'gtm.elementVisibility', 'gtm.triggerGroup', 'gtm.init_consent',
  'load', 'DOMContentLoaded', 'readystatechange', 'beforeunload', 'unload',
  'pageshow', 'pagehide', 'visibilitychange',
  'OneTrustLoaded', 'OptanonLoaded', 'OneTrustGroupsUpdated', 'OptanonConsent',
  'CookieConsent', 'cookiebot_loaded', 'cookiebot_consent',
  'consent_default', 'consent_update', 'cookie_consent_update',
  'customEvent', 'pageEvent',
  'virtualPageview', 'virtual_pageview',
]);

function parseQuery(url: string): URLSearchParams | null {
  try { return new URL(url).searchParams; } catch { return null; }
}

function parseBodyParams(body?: string | null): URLSearchParams | null {
  if (!body) return null;
  try { return new URLSearchParams(body); } catch { return null; }
}

function tryJson(body?: string | null): any | null {
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

// ─── GA4 ────────────────────────────────────────────────────────
function parseGA4(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  if (!q) return [];

  // GA4 batches: each non-prefixed `en` is the event; for batch payloads the
  // body is newline-separated key=value pairs, one event per line.
  const batchBody = hit.body && (hit.body.includes('\n') || hit.body.includes('en=')) ? hit.body : null;

  const out: NormalizedEvent[] = [];
  const baseMeasurementId = q.get('tid');
  const pageLocation = q.get('dl') || q.get('page_location');

  function pushOne(params: URLSearchParams) {
    const en = params.get('en');
    if (!en) return;
    const eventParameters: Record<string, any> = {};
    const userProperties: Record<string, any> = {};
    const items: any[] = [];
    params.forEach((value, key) => {
      if (key.startsWith('ep.')) eventParameters[key.substring(3)] = value;
      else if (key.startsWith('epn.')) eventParameters[key.substring(4)] = Number(value);
      else if (key.startsWith('up.')) userProperties[key.substring(3)] = value;
      else if (key.startsWith('upn.')) userProperties[key.substring(4)] = Number(value);
      else if (/^pr\d+$/.test(key)) items.push({ position: key, raw: value });
    });
    if (pageLocation && !eventParameters.page_location) eventParameters.page_location = pageLocation;
    if (Object.keys(userProperties).length) eventParameters._user_properties = userProperties;
    if (items.length) eventParameters._items = items;
    out.push({
      eventName: en,
      source: 'GA4 (Measurement Protocol)',
      vendor: 'GA4',
      parameters: eventParameters,
      measurementId: params.get('tid') || baseMeasurementId,
      transport: hit.transport,
      method: hit.method,
      timestamp: hit.timestamp,
      isStandard: GA4_STANDARD_EVENTS.has(en),
      rawUrlSample: hit.url.slice(0, 200),
    });
  }

  // Always push the URL params (single-event case)
  pushOne(q);

  // Batch case — body has one URL-encoded event per line
  if (batchBody) {
    batchBody.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const params = parseBodyParams(trimmed);
      if (params) pushOne(params);
    });
  }

  return out;
}

// ─── Universal Analytics ─────────────────────────────────────────
function parseUA(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  if (!q) return [];
  if (q.get('t') !== 'event' && q.get('t') !== 'pageview') return [];
  const ec = q.get('ec') || '';
  const ea = q.get('ea') || '';
  const el = q.get('el') || '';
  const eventName = q.get('t') === 'pageview' ? 'pageview' : `${ec}_${ea}`.replace(/^_|_$/g, '');
  if (!eventName) return [];
  return [{
    eventName,
    source: 'Universal Analytics',
    vendor: 'UA',
    parameters: { category: ec, action: ea, label: el, ...(q.get('ev') ? { value: Number(q.get('ev')) } : {}) },
    measurementId: q.get('tid') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Meta Pixel ──────────────────────────────────────────────────
function parseMetaPixel(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  if (!q) return [];
  const ev = q.get('ev');
  if (!ev) return [];
  // Custom event parameters arrive as cd[key]=value
  const cd: Record<string, any> = {};
  q.forEach((v, k) => {
    const m = k.match(/^cd\[(.+)\]$/);
    if (m) cd[m[1]] = v;
  });
  return [{
    eventName: ev,
    source: 'Meta Pixel',
    vendor: 'MetaPixel',
    parameters: cd,
    pixelId: q.get('id') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    isStandard: META_STANDARD_EVENTS.has(ev),
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── TikTok Pixel ────────────────────────────────────────────────
function parseTikTok(hit: RawHit): NormalizedEvent[] {
  const json = tryJson(hit.body);
  const eventName = json?.event || json?.event_name || 'tiktok_track';
  return [{
    eventName,
    source: 'TikTok Pixel',
    vendor: 'TikTokPixel',
    parameters: json?.properties || json?.context || json || {},
    pixelId: json?.context?.pixel?.code || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── LinkedIn Insight ────────────────────────────────────────────
function parseLinkedIn(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  return [{
    eventName: q?.get('conversionId') ? `linkedin_conversion_${q.get('conversionId')}` : 'linkedin_insight',
    source: 'LinkedIn Insight',
    vendor: 'LinkedInInsight',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    pixelId: q?.get('pid') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Google Ads ──────────────────────────────────────────────────
function parseGoogleAds(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  const conv = q?.get('label') || q?.get('cv') || 'google_ads_hit';
  return [{
    eventName: `google_ads_${conv}`,
    source: 'Google Ads',
    vendor: 'GoogleAds',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    pixelId: q?.get('cid') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Bing UET ────────────────────────────────────────────────────
function parseBingUET(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  const evt = q?.get('evt') || q?.get('en') || 'bing_uet';
  return [{
    eventName: evt,
    source: 'Microsoft (Bing UET)',
    vendor: 'BingUET',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    pixelId: q?.get('ti') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Pinterest Tag ───────────────────────────────────────────────
function parsePinterest(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  return [{
    eventName: q?.get('event') || q?.get('ev') || 'pinterest_track',
    source: 'Pinterest Tag',
    vendor: 'PinterestTag',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    pixelId: q?.get('tid') || null,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Twitter / X Pixel ──────────────────────────────────────────
function parseTwitter(hit: RawHit): NormalizedEvent[] {
  const q = parseQuery(hit.url);
  return [{
    eventName: q?.get('events') || q?.get('event_id') || 'twitter_track',
    source: 'Twitter/X Pixel',
    vendor: 'TwitterPixel',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Hotjar ─────────────────────────────────────────────────────
function parseHotjar(hit: RawHit): NormalizedEvent[] {
  const json = tryJson(hit.body);
  return [{
    eventName: json?.event || json?.event_name || 'hotjar_hit',
    source: 'Hotjar',
    vendor: 'Hotjar',
    parameters: json || {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Segment ────────────────────────────────────────────────────
function parseSegment(hit: RawHit): NormalizedEvent[] {
  const json = tryJson(hit.body);
  if (!json) return [];
  const eventName = json.event || json.name || json.type || 'segment_call';
  return [{
    eventName,
    source: 'Segment',
    vendor: 'Segment',
    parameters: json.properties || json.traits || json,
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

// ─── Mixpanel ───────────────────────────────────────────────────
function parseMixpanel(hit: RawHit): NormalizedEvent[] {
  // Mixpanel ships base64-encoded JSON in `data` query OR body
  const q = parseQuery(hit.url);
  let payload: any = tryJson(hit.body);
  if (!payload && q?.get('data')) {
    try { payload = JSON.parse(Buffer.from(q.get('data')!, 'base64').toString('utf8')); }
    catch { payload = null; }
  }
  const events = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return events.map((evt: any) => ({
    eventName: evt?.event || evt?.name || 'mixpanel_event',
    source: 'Mixpanel',
    vendor: 'Mixpanel',
    parameters: evt?.properties || evt || {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }));
}

// ─── Amplitude ──────────────────────────────────────────────────
function parseAmplitude(hit: RawHit): NormalizedEvent[] {
  const formParams = parseBodyParams(hit.body);
  let raw: any = null;
  if (formParams?.get('e')) {
    try { raw = JSON.parse(formParams.get('e')!); } catch { /* skip */ }
  }
  if (!raw) raw = tryJson(hit.body);
  const events = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return events.map((evt: any) => ({
    eventName: evt?.event_type || evt?.event || 'amplitude_event',
    source: 'Amplitude',
    vendor: 'Amplitude',
    parameters: evt?.event_properties || evt || {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }));
}

// ─── Adobe Analytics ────────────────────────────────────────────
function parseAdobe(hit: RawHit): NormalizedEvent[] {
  // Adobe uses /b/ss/<rsid>/... — events live in `events` param or `pe` (page event)
  const q = parseQuery(hit.url);
  const pageName = q?.get('pageName') || q?.get('g') || 'adobe_hit';
  const events = (q?.get('events') || '').split(',').filter(Boolean);
  if (!events.length) {
    return [{
      eventName: q?.get('pe') || `adobe_${pageName}`,
      source: 'Adobe Analytics',
      vendor: 'AdobeAnalytics',
      parameters: q ? Object.fromEntries(q.entries()) : {},
      transport: hit.transport,
      method: hit.method,
      timestamp: hit.timestamp,
      rawUrlSample: hit.url.slice(0, 200),
    }];
  }
  return events.map(evt => ({
    eventName: `adobe_${evt}`,
    source: 'Adobe Analytics',
    vendor: 'AdobeAnalytics',
    parameters: q ? Object.fromEntries(q.entries()) : {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }));
}

// ─── dataLayer push (GTM) ───────────────────────────────────────
function parseDataLayer(hit: RawHit): NormalizedEvent[] {
  const eventName = hit.eventName || hit.payload?.event || hit.payload?.[1];
  if (!eventName) return [];
  if (GTM_INTERNAL_EVENTS.has(String(eventName))) return [];
  return [{
    eventName: String(eventName),
    source: 'dataLayer (GTM)',
    vendor: 'GTM',
    parameters: (hit.payload as Record<string, any>) || {},
    transport: hit.transport,
    method: hit.method,
    timestamp: hit.timestamp,
    rawUrlSample: hit.url.slice(0, 200),
  }];
}

const PARSERS: Record<string, (hit: RawHit) => NormalizedEvent[]> = {
  GA4: parseGA4,
  UA: parseUA,
  MetaPixel: parseMetaPixel,
  TikTokPixel: parseTikTok,
  LinkedInInsight: parseLinkedIn,
  GoogleAds: parseGoogleAds,
  BingUET: parseBingUET,
  PinterestTag: parsePinterest,
  TwitterPixel: parseTwitter,
  Hotjar: parseHotjar,
  Segment: parseSegment,
  Mixpanel: parseMixpanel,
  Amplitude: parseAmplitude,
  AdobeAnalytics: parseAdobe,
  GTM: parseDataLayer,
};

/**
 * Convert raw hits → normalized events. Bad hits log a warning and are dropped;
 * the audit must never crash because of a malformed vendor payload.
 */
export function parseRawHits(hits: RawHit[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const hit of hits) {
    const parser = PARSERS[hit.vendor];
    if (!parser) {
      console.warn(`[tracking-spy] No parser for vendor "${hit.vendor}" — skipping (url=${hit.url?.slice(0, 120)})`);
      continue;
    }
    try {
      const evts = parser(hit);
      for (const e of evts) {
        if (e && e.eventName) out.push(e);
      }
    } catch (err) {
      console.warn(`[tracking-spy] Parser "${hit.vendor}" threw on payload:`, (err as Error)?.message, 'url=', hit.url?.slice(0, 200));
    }
  }
  return out;
}

/**
 * Dedupe by (vendor, eventName) — keep the first occurrence's params but track
 * a `count` and `firstSeenAt` / `lastSeenAt` for the audit's "how many times"
 * insights downstream.
 */
export function dedupeEvents(events: NormalizedEvent[]): Array<NormalizedEvent & { count: number; firstSeenAt: number; lastSeenAt: number }> {
  const map = new Map<string, NormalizedEvent & { count: number; firstSeenAt: number; lastSeenAt: number }>();
  for (const e of events) {
    const key = `${e.vendor}::${e.eventName.toLowerCase().trim()}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeenAt = Math.max(existing.lastSeenAt, e.timestamp);
    } else {
      map.set(key, { ...e, count: 1, firstSeenAt: e.timestamp, lastSeenAt: e.timestamp });
    }
  }
  return Array.from(map.values());
}
