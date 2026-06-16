// live-capture.ts — browser orchestration for the launch-readiness gate.
//
// captureObservedSignals(url) drives the SAME spy → consent → simulate → drain
// sequence existing-site-auditor.ts already runs (reused, not reinvented) on a
// single deployed/staging page, then hands off to the pure toObservedSignals
// mapper. This module imports Playwright + the capture machinery, so it is loaded
// ONLY via dynamic import from launch-readiness.ts when a deployed-site URL is
// actually being checked — the pure gate/mapper modules never pull it in.
//
// NOT unit-tested (needs a live browser); flagged for a live run.

import { chromium } from 'playwright';
import { attachTrackingSpy, readTrackingSpyEvents } from '../tracking-spy/index.ts';
import { detectAndAcceptConsent, readConsentModeStatus } from '../scraper.ts';
import { simulateRealUser } from '../user-simulator.ts';
import { toObservedSignals } from './observed-signals.ts';
import type { ObservedSignals, PreConsentObservation } from './types.ts';

export async function captureObservedSignals(url: string): Promise<ObservedSignals> {
  // Standard headless Chromium — same launch args/context the auditor uses.
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2', '--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      storageState: undefined,
    });
    await context.clearCookies(); // clean first-visit so first_visit/session_start fire

    const page = await context.newPage();
    await attachTrackingSpy(page); // MUST run before goto so hooks load first

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch {
        await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
      }
    }
    await page.waitForTimeout(2500);

    // ── PRE-CONSENT observation (slice 2) ──────────────────────────────────
    // Read the SAME spy buffer NOW, before accepting anything: whatever tracking
    // is here fired without the user's agreement. Bounded (just an extra read of
    // the already-running spy — no second navigation, no second browser). The
    // read is non-destructive, so the post-consent measurement below is intact.
    // Degrades to ran:false (→ inconclusive downstream) if the spy didn't install
    // — never a false violation.
    const preConsent = await observePreConsent(page);

    // Accept consent so consent-gated tags are allowed to fire before we measure.
    const consent = await detectAndAcceptConsent(page);
    await page.waitForTimeout(2000);

    // Drive interaction so interaction-gated events actually fire.
    await simulateRealUser(page, { maxDurationMs: 45000, label: 'launch-readiness' });
    await page.waitForTimeout(6000); // settle — analytics debounce/batch

    // Read granular Consent Mode AFTER accepting consent, so both the `default`
    // (page load) and `update` (on accept) signals have had a chance to push.
    // Reuses the scraper's existing dataLayer read — the spy can't see these.
    const consentMode = await readConsentModeStatus(page);

    const spy = await readTrackingSpyEvents(page);
    console.log(`[launch-readiness] capture: raw=${spy.rawHitCount}, unique=${spy.events.length}, consentMode=${consentMode.active}, preConsentHits=${preConsent.events.length}`);

    return toObservedSignals(url, spy, { detected: consent.detected, accepted: consent.accepted }, consentMode, preConsent);
  } finally {
    await browser.close();
  }
}

// Observe the pre-consent window from the live spy buffer. ran:false (→ the
// enforcement dimension reads inconclusive, never a false violation) when the spy
// didn't install or the page can't be evaluated. The mapper drops malformed rows.
async function observePreConsent(page: import('playwright').Page): Promise<PreConsentObservation> {
  try {
    const installed = await page.evaluate(() => Boolean((window as unknown as { __trackingSpy?: unknown }).__trackingSpy)).catch(() => false);
    if (!installed) return { ran: false, events: [], rawHitCount: 0 };
    const pre = await readTrackingSpyEvents(page);
    // Reuse the same normalization the post-consent path uses (events only).
    const events = toObservedSignals(page.url(), pre, null).events;
    return { ran: true, events, rawHitCount: pre.rawHitCount };
  } catch {
    return { ran: false, events: [], rawHitCount: 0 };
  }
}
