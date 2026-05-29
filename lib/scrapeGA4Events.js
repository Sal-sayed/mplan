/**
 * scrapeGA4Events.js
 *
 * Scrapes a live website's GA4/GTM setup using Playwright.
 * Captures events via 3 methods:
 *   1. Network interception (GA4 /g/collect, UA /collect, Meta /tr)
 *   2. dataLayer.push interception (injected before page scripts)
 *   3. GTM container config parsing (fetches gtm.js for each container)
 *
 * Also exports diffAgainstPlan() to compare scrape results vs recommended events.
 *
 * Usage:
 *   const { scrapeGA4Events, diffAgainstPlan } = require('./scrapeGA4Events');
 *   const report = await scrapeGA4Events('https://example.com');
 *   const diff = diffAgainstPlan(report, [{ name: 'purchase', priority: 'MUST', description: '...' }]);
 */

const { chromium } = require('playwright');

const GA4_STANDARD = new Set([
  'page_view', 'scroll', 'click', 'view_search_results', 'form_start', 'form_submit',
  'video_start', 'video_progress', 'video_complete', 'file_download', 'user_engagement',
  'session_start', 'first_visit', 'first_open',
]);

const GTM_INTERNAL = new Set([
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick',
  'gtm.formSubmit', 'gtm.historyChange', 'gtm.timer', 'gtm.scrollDepth',
]);

/**
 * Scrape a live website for GA4/GTM tracking setup.
 * @param {string} url - The URL to scrape
 * @param {object} opts - Options: { timeout: 30000 }
 * @returns {Promise<object>} Scrape report
 */
async function scrapeGA4Events(url, opts = {}) {
  const timeout = opts.timeout || 30000;
  const errors = [];
  const runtimeEvents = [];
  const networkHits = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  // ─── INJECT DATALAYER INTERCEPTOR (before page scripts) ───
  await page.addInitScript(() => {
    window.__capturedDLEvents = [];
    const origPush = Array.prototype.push;
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      set(val) {
        if (Array.isArray(val)) {
          val.push = function (...args) {
            args.forEach(item => {
              if (item && typeof item === 'object') {
                if (item.event) {
                  window.__capturedDLEvents.push({ eventName: item.event, params: { ...item }, method: 'dataLayer.push' });
                } else if (Array.isArray(item) && item[0] === 'event') {
                  window.__capturedDLEvents.push({ eventName: item[1], params: item[2] || {}, method: 'gtag.arguments' });
                }
              }
            });
            return origPush.apply(this, args);
          };
        }
        this.__dl = val;
      },
      get() { return this.__dl; },
    });
  });

  // ─── NETWORK INTERCEPTION ───
  page.on('request', (req) => {
    const reqUrl = req.url();

    // GA4 Measurement Protocol
    if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect|googletagmanager\.com\/gtag/.test(reqUrl)) {
      try {
        const params = new URL(reqUrl).searchParams;
        const en = params.get('en');
        const tid = params.get('tid');
        if (en) {
          const eventParams = {};
          params.forEach((v, k) => {
            if (k.startsWith('ep.') || k.startsWith('epn.')) eventParams[k.substring(k.indexOf('.') + 1)] = v;
          });
          networkHits.push({ eventName: en, measurementId: tid, parameters: eventParams, method: 'GA4 Network' });
        }
      } catch (e) { /* malformed URL */ }
    }

    // UA Collect
    if (/google-analytics\.com\/collect(?!\/)/.test(reqUrl) || /google-analytics\.com\/r\/collect/.test(reqUrl)) {
      try {
        const params = new URL(reqUrl).searchParams;
        if (params.get('t') === 'event') {
          networkHits.push({
            eventName: `${params.get('ec') || ''}_${params.get('ea') || ''}`.replace(/^_|_$/g, ''),
            parameters: { category: params.get('ec'), action: params.get('ea'), label: params.get('el') },
            method: 'UA Network',
          });
        }
      } catch (e) { /* malformed URL */ }
    }

    // Meta Pixel
    if (/facebook\.com\/tr/.test(reqUrl)) {
      try {
        const params = new URL(reqUrl).searchParams;
        const ev = params.get('ev');
        if (ev) networkHits.push({ eventName: ev, pixelId: params.get('id'), method: 'Meta Pixel Network' });
      } catch (e) { /* malformed URL */ }
    }
  });

  // ─── NAVIGATE ───
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
  } catch {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
    catch { await page.goto(url, { waitUntil: 'commit', timeout: 15000 }); }
  }
  await page.waitForTimeout(3000);

  // ─── SIMULATE INTERACTIONS ───
  try {
    await page.evaluate(() => window.scrollBy(0, Math.floor(document.body.scrollHeight * 0.5)));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, -document.body.scrollHeight * 0.3));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  } catch (e) { errors.push('Scroll simulation failed: ' + e.message); }

  // Wait for async events to flush
  await page.waitForTimeout(3000);

  // ─── EXTRACT IDs + DATALAYER EVENTS FROM PAGE ───
  const pageData = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    return {
      ga4Ids: [...new Set((html.match(/G-[A-Z0-9]{6,12}/g) || []))],
      gtmIds: [...new Set((html.match(/GTM-[A-Z0-9]{4,10}/g) || []))],
      uaIds: [...new Set((html.match(/UA-\d{4,10}-\d{1,4}/g) || []))],
      dlEvents: window.__capturedDLEvents || [],
      dlFallback: Array.isArray(window.dataLayer)
        ? window.dataLayer.filter(i => i && i.event).map(i => ({ eventName: i.event, method: 'dataLayer.read' }))
        : [],
    };
  });

  // Combine dataLayer events (intercepted + fallback read)
  const allDLEvents = [...pageData.dlEvents, ...pageData.dlFallback];
  allDLEvents.forEach(evt => {
    if (evt.eventName && !GTM_INTERNAL.has(evt.eventName)) {
      runtimeEvents.push({ eventName: evt.eventName, source: 'dataLayer', method: evt.method, params: evt.params || {} });
    }
  });

  // Add network hits to runtime events
  networkHits.forEach(hit => {
    if (hit.eventName && !GTM_INTERNAL.has(hit.eventName)) {
      runtimeEvents.push({ eventName: hit.eventName, source: 'network', method: hit.method, params: hit.parameters || {} });
    }
  });

  // ─── FETCH GTM CONTAINER CONFIGS ───
  const gtmContainers = [];
  for (const gtmId of pageData.gtmIds) {
    const container = { id: gtmId, events: [], params: [], triggers: [] };
    try {
      const containerPage = await context.newPage();
      const resp = await containerPage.goto(`https://www.googletagmanager.com/gtm.js?id=${gtmId}`, { timeout: 10000 });
      if (resp) {
        const text = await resp.text();

        // Extract event names
        const enMatches = [...text.matchAll(/"en"\s*:\s*"([a-zA-Z0-9_]+)"/g)];
        enMatches.forEach(m => { if (m[1] && !GTM_INTERNAL.has(m[1])) container.events.push(m[1]); });

        // Extract event params
        const epMatches = [...text.matchAll(/"ep[n]?\.([a-zA-Z0-9_]+)"/g)];
        epMatches.forEach(m => { if (m[1]) container.params.push(m[1]); });

        // Extract trigger event names
        const vtpMatches = [...text.matchAll(/"vtp_eventName"\s*:\s*"([a-zA-Z0-9_]+)"/g)];
        vtpMatches.forEach(m => { if (m[1] && !GTM_INTERNAL.has(m[1])) container.triggers.push(m[1]); });

        // Also try generic event patterns
        const genericMatches = [...text.matchAll(/"event"\s*:\s*"([^"]+)"/g)];
        genericMatches.forEach(m => { if (m[1] && !GTM_INTERNAL.has(m[1]) && !container.events.includes(m[1])) container.events.push(m[1]); });
      }
      await containerPage.close();
    } catch (e) {
      errors.push(`GTM fetch failed for ${gtmId}: ${e.message}`);
    }

    container.events = [...new Set(container.events)];
    container.params = [...new Set(container.params)];
    container.triggers = [...new Set(container.triggers)];
    gtmContainers.push(container);
  }

  // Collect all GTM-configured events
  const gtmConfiguredEvents = [];
  gtmContainers.forEach(c => {
    [...c.events, ...c.triggers].forEach(name => {
      if (!gtmConfiguredEvents.includes(name)) gtmConfiguredEvents.push(name);
    });
  });

  // Add GTM config events to runtime if not already captured
  const existingNames = new Set(runtimeEvents.map(e => e.eventName.toLowerCase()));
  gtmConfiguredEvents.forEach(name => {
    if (!existingNames.has(name.toLowerCase())) {
      runtimeEvents.push({ eventName: name, source: 'gtm-config', method: 'Container inspection', params: {} });
    }
  });

  await browser.close();

  // Dedupe runtime events by name
  const eventMap = new Map();
  runtimeEvents.forEach(e => {
    const key = e.eventName.toLowerCase().trim();
    if (!eventMap.has(key)) eventMap.set(key, e);
  });

  return {
    url,
    scrapedAt: new Date().toISOString(),
    measurementIds: pageData.ga4Ids,
    gtmContainers,
    legacyUA: pageData.uaIds,
    runtimeEvents: Array.from(eventMap.values()),
    gtmConfiguredEvents,
    networkHits,
    errors,
  };
}

/**
 * Compare scrape results against a recommended events plan.
 * @param {object} scrapeReport - Output from scrapeGA4Events()
 * @param {Array} recommendedEvents - Array of { name, priority, description }
 * @returns {object} Diff report
 */
function diffAgainstPlan(scrapeReport, recommendedEvents) {
  // Build set of all events actually firing (runtime + gtm config)
  const firingSet = new Set();
  scrapeReport.runtimeEvents.forEach(e => firingSet.add(e.eventName.toLowerCase().trim()));
  scrapeReport.gtmConfiguredEvents.forEach(e => firingSet.add(e.toLowerCase().trim()));

  const comparison = recommendedEvents.map(rec => ({
    name: rec.name,
    priority: rec.priority,
    description: rec.description,
    status: firingSet.has(rec.name.toLowerCase().trim()) ? 'implemented' : 'missing',
  }));

  const recommendedSet = new Set(recommendedEvents.map(r => r.name.toLowerCase().trim()));
  const extraEvents = [];
  firingSet.forEach(name => {
    if (!recommendedSet.has(name) && !GA4_STANDARD.has(name)) {
      extraEvents.push(name);
    }
  });

  const implemented = comparison.filter(c => c.status === 'implemented').length;
  const missing = comparison.filter(c => c.status === 'missing').length;
  const mustHaveMissing = comparison.filter(c => c.status === 'missing' && c.priority === 'MUST').length;

  return {
    summary: {
      totalRecommended: recommendedEvents.length,
      implemented,
      missing,
      mustHaveMissing,
      extraEventsFound: extraEvents.length,
    },
    comparison,
    extraEvents,
  };
}

module.exports = { scrapeGA4Events, diffAgainstPlan };
