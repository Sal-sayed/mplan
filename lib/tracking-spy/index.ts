/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tracking Spy — Node-side glue.
 *
 *   attachTrackingSpy(page) → installs injected.js via addInitScript
 *   readTrackingSpyEvents(page) → drains the in-page buffer + parses it
 *
 * The injected script (lib/tracking-spy/injected.js) runs before any page
 * script on every navigation; we read its captured raw hits here and pipe
 * them through parsers.ts to produce normalized events.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { parseRawHits, dedupeEvents, type NormalizedEvent, type RawHit } from './parsers';

const INJECTED_PATH = path.join(process.cwd(), 'lib', 'tracking-spy', 'injected.js');

let cachedScript: string | null = null;
async function loadInjectedScript(): Promise<string> {
  if (cachedScript) return cachedScript;
  cachedScript = await fs.readFile(INJECTED_PATH, 'utf8');
  return cachedScript;
}

/** Attach the in-page capture script BEFORE any page navigation. */
export async function attachTrackingSpy(page: Page): Promise<void> {
  const content = await loadInjectedScript();
  await page.addInitScript({ content });
}

export interface TrackingSpyReadResult {
  events: Array<NormalizedEvent & { count: number; firstSeenAt: number; lastSeenAt: number }>;
  rawHitCount: number;
  counters: { fetch: number; xhr: number; beacon: number; image: number; dataLayer: number };
  metadata: { startedAt?: number; initialUrl?: string; userAgent?: string } | null;
}

/**
 * Drain `window.__trackingSpy.events` from the live page, parse + dedupe.
 * Returns an empty result (not throws) if the script never installed.
 */
export async function readTrackingSpyEvents(page: Page): Promise<TrackingSpyReadResult> {
  const snapshot = await page.evaluate(() => {
    const spy = (window as any).__trackingSpy;
    if (!spy || !Array.isArray(spy.events)) {
      return { installed: false, events: [], counters: null, metadata: null };
    }
    return {
      installed: true,
      events: spy.events.slice(),
      counters: spy.counters || null,
      metadata: spy.metadata || null,
    };
  }).catch((err) => {
    console.warn('[tracking-spy] page.evaluate failed:', err?.message);
    return { installed: false, events: [], counters: null, metadata: null } as any;
  });

  if (!snapshot.installed) {
    console.warn('[tracking-spy] Capture script did not install — window.__trackingSpy missing');
    return { events: [], rawHitCount: 0, counters: { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 }, metadata: null };
  }

  const rawHits: RawHit[] = snapshot.events;
  const normalized = parseRawHits(rawHits);
  const deduped = dedupeEvents(normalized);

  console.log(`[tracking-spy] Captured ${rawHits.length} raw hits → ${normalized.length} normalized → ${deduped.length} unique events`);

  return {
    events: deduped,
    rawHitCount: rawHits.length,
    counters: snapshot.counters || { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 },
    metadata: snapshot.metadata,
  };
}

export type { NormalizedEvent, RawHit } from './parsers';
