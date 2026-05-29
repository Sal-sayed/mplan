/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Existing-site auditor — clean 4-step pipeline.
 *
 *   STEP 1  Submission (URL comes in via /api/analyze)
 *   STEP 2  Full-site scrape (homepage + auto-discovered product/category/cart/about/contact)
 *   STEP 3  Detect measurement IDs (static HTML scan) + parse each GTM container
 *           for configured events (fetched from gtm.js endpoint)
 *   STEP 4  Aggressive automated interaction on every page; events captured via
 *           Tracking Spy (in-page module, attached via addInitScript) + a
 *           Playwright network listener (backup). Events are SEPARATED by
 *           source — GTM-configured vs GA4-fired vs Meta-Pixel-fired vs other.
 *
 * No extension loading. Tracking Spy lives in lib/tracking-spy/ as modules
 * and runs via addInitScript so it loads before every page script, including
 * SPA soft-navigations.
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { attachTrackingSpy, readTrackingSpyEvents, type NormalizedEvent } from './tracking-spy';
import { simulateRealUser, type SimResult } from './user-simulator';
import { detectAndAcceptConsent } from './scraper';

// ─── PUBLIC TYPES ───
export type PageType =
  | 'homepage' | 'product' | 'category' | 'cart' | 'checkout'
  | 'about' | 'contact' | 'pricing' | 'login' | 'signup' | 'blog' | 'other';

export interface ScannedPage {
  url: string;
  pageType: PageType;
  title: string;
  loadedSuccessfully: boolean;
  eventsCapturedOnPage: number;
  error?: string;
}

export interface MeasurementIds {
  ga4: string[];
  gtm: string[];
  ua: string[];
  metaPixel: string[];
  googleAds: string[];
  tiktokPixel: string[];
  linkedinInsight: string[];
  bingUet: string[];
  hotjar: string[];
  segment: string[];
  mixpanel: string[];
  adobeAnalytics: string[];
}

export interface GTMEvent {
  eventName: string;
  tagType: string;
  trigger: string;
  gtmContainer: string;
  capturedFromPage: string;
}

export interface GA4Event {
  eventName: string;
  measurementId: string;
  parameters: Record<string, any>;
  fired: boolean;
  capturedFromPages: string[];
  timestamp: string;
  isStandardEvent: boolean;
}

export interface PixelEvent {
  eventName: string;
  pixelId: string;
  source: string;
  parameters: Record<string, any>;
  capturedFromPages: string[];
  timestamp: string;
}

export interface InteractionStats {
  buttonsClicked: number;
  eventMarkersTriggered: number;
  productsClicked: number;
  navLinksClicked: number;
  scrollsPerformed: number;
  formsInteracted: number;
  searchesPerformed: number;
  totalActions: number;
}

export type BusinessModelType =
  | 'direct_ecommerce'
  | 'brand_catalog_with_retailers'
  | 'lead_generation'
  | 'saas'
  | 'content_publisher'
  | 'marketplace'
  | 'service_booking'
  | 'informational'
  | 'unknown';

export interface BusinessModel {
  primaryType: BusinessModelType;
  hasOwnCheckout: boolean;
  redirectsToRetailers: boolean;
  retailers: string[];
  hasShoppingCart: boolean;
  hasUserAccounts: boolean;
  hasLeadForms: boolean;
  reasoning: string;
}

export interface AuditResult {
  submittedUrl: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  pagesScanned: ScannedPage[];
  totalPagesScanned: number;
  measurementIds: MeasurementIds;
  gtmContainerEvents: GTMEvent[];
  ga4Events: GA4Event[];
  metaPixelEvents: PixelEvent[];
  otherPixelEvents: PixelEvent[];
  interactionStats: InteractionStats;
  consentResult: { detected: boolean; accepted: boolean; cmp: string | null };
  businessModel: BusinessModel;
}

// ─── INTERNAL HELPERS ───
const GA4_STANDARD_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'view_search_results', 'form_start', 'form_submit',
  'video_start', 'video_progress', 'video_complete', 'file_download', 'user_engagement',
  'session_start', 'first_visit', 'view_item', 'view_item_list', 'select_item',
  'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'add_payment_info',
  'add_shipping_info', 'purchase', 'refund', 'select_promotion', 'view_promotion',
  'share', 'sign_up', 'login', 'generate_lead', 'search',
]);

const GTM_INTERNAL_EVENTS = new Set([
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick', 'gtm.formSubmit',
  'gtm.historyChange', 'gtm.timer', 'gtm.scrollDepth', 'gtm.video', 'gtm.elementVisibility',
  'gtm.triggerGroup', 'gtm.init_consent',
]);

function emptyIds(): MeasurementIds {
  return {
    ga4: [], gtm: [], ua: [], metaPixel: [], googleAds: [],
    tiktokPixel: [], linkedinInsight: [], bingUet: [], hotjar: [],
    segment: [], mixpanel: [], adobeAnalytics: [],
  };
}

function emptyStats(): InteractionStats {
  return {
    buttonsClicked: 0, eventMarkersTriggered: 0, productsClicked: 0,
    navLinksClicked: 0, scrollsPerformed: 0, formsInteracted: 0,
    searchesPerformed: 0, totalActions: 0,
  };
}

function pushUnique(arr: string[], val: string | null | undefined) {
  if (!val) return;
  if (!arr.includes(val)) arr.push(val);
}

// ─── NETWORK INTERCEPTOR (BACKUP CAPTURE PATH) ───
// Primary capture is Tracking Spy (in-page). This listener is a safety net
// that catches request-level metadata Spy might miss (e.g. when a vendor
// uses an iframe that Spy can't reach). It also surfaces measurement IDs
// from the URL parameters as the requests fly past.
function attachNetworkInterceptor(
  page: Page,
  ga4Events: GA4Event[],
  metaEvents: PixelEvent[],
  otherEvents: PixelEvent[],
  pageUrl: string,
  ids: MeasurementIds,
): void {
  page.on('request', (request) => {
    const url = request.url();
    try {
      // GA4 — measurement protocol
      if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(url)) {
        const params = new URL(url).searchParams;
        const eventName = params.get('en');
        const measurementId = params.get('tid');
        pushUnique(ids.ga4, measurementId);
        if (eventName && measurementId) {
          const eventParams: Record<string, any> = {};
          params.forEach((v, k) => {
            if (k.startsWith('ep.')) eventParams[k.substring(3)] = v;
            else if (k.startsWith('epn.')) eventParams[k.substring(4)] = Number(v);
          });
          ga4Events.push({
            eventName,
            measurementId,
            parameters: eventParams,
            fired: true,
            capturedFromPages: [pageUrl],
            timestamp: new Date().toISOString(),
            isStandardEvent: GA4_STANDARD_EVENTS.has(eventName),
          });
        }
      }

      // Universal Analytics (legacy)
      if (/google-analytics\.com\/collect(?!\/)|google-analytics\.com\/r\/collect/.test(url)) {
        const params = new URL(url).searchParams;
        pushUnique(ids.ua, params.get('tid'));
      }

      // Meta Pixel
      if (/facebook\.com\/tr/.test(url)) {
        const params = new URL(url).searchParams;
        const eventName = params.get('ev');
        const pixelId = params.get('id') || '';
        pushUnique(ids.metaPixel, pixelId);
        if (eventName) {
          const cd: Record<string, any> = {};
          params.forEach((v, k) => { if (k.startsWith('cd[') && k.endsWith(']')) cd[k.slice(3, -1)] = v; });
          metaEvents.push({
            eventName,
            pixelId,
            source: 'Meta Pixel',
            parameters: cd,
            capturedFromPages: [pageUrl],
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Other vendor patterns — record a 'tracking_request' marker so users
      // see the vendor is active even when we can't decode the payload.
      const others: Array<{ match: RegExp; source: string; idField: keyof MeasurementIds; idParam?: string }> = [
        { match: /analytics\.tiktok\.com/, source: 'TikTok Pixel', idField: 'tiktokPixel' },
        { match: /px\.ads\.linkedin\.com|snap\.licdn\.com/, source: 'LinkedIn Insight', idField: 'linkedinInsight' },
        { match: /googleadservices\.com|googleads\.g\.doubleclick\.net|google\.com\/pagead/, source: 'Google Ads', idField: 'googleAds' },
        { match: /bat\.bing\.com\/action/, source: 'Microsoft (Bing UET)', idField: 'bingUet' },
        { match: /\.hotjar\.com\/api/, source: 'Hotjar', idField: 'hotjar' },
        { match: /api\.segment\.io/, source: 'Segment', idField: 'segment' },
        { match: /api\.mixpanel\.com/, source: 'Mixpanel', idField: 'mixpanel' },
        { match: /\.sc\.omtrdc\.net|\/b\/ss\//, source: 'Adobe Analytics', idField: 'adobeAnalytics' },
      ];
      for (const o of others) {
        if (o.match.test(url)) {
          otherEvents.push({
            eventName: 'tracking_request',
            pixelId: '',
            source: o.source,
            parameters: { url: url.substring(0, 300) },
            capturedFromPages: [pageUrl],
            timestamp: new Date().toISOString(),
          });
          break;
        }
      }
    } catch { /* swallow — one bad URL never crashes the audit */ }
  });
}

// ─── STATIC HTML ID EXTRACTION ───
async function extractAllMeasurementIds(page: Page, ids: MeasurementIds): Promise<void> {
  try {
    const extracted = await page.evaluate(() => {
      const html = document.documentElement.outerHTML || '';
      const scriptsArr = Array.from(document.scripts).map(s => `${s.src || ''} ${s.textContent || ''}`).join(' ');
      const combined = `${html} ${scriptsArr}`;
      const matches = (re: RegExp, group = 0): string[] => {
        const found = new Set<string>();
        let m;
        const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        while ((m = r.exec(combined)) !== null) {
          const v = (group > 0 ? m[group] : m[0]);
          if (v) found.add(v);
        }
        return Array.from(found);
      };
      return {
        ga4: matches(/G-[A-Z0-9]{6,12}/g),
        gtm: matches(/GTM-[A-Z0-9]{4,10}/g),
        ua: matches(/UA-\d{4,10}-\d{1,4}/g),
        metaPixel: matches(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,18})['"]\)/g, 1),
        googleAds: matches(/AW-\d{6,12}/g),
        tiktokPixel: matches(/ttq\.load\(\s*['"]([^'"]+)['"]\)/g, 1),
        linkedinInsight: matches(/_linkedin_partner_id\s*=\s*['"]?(\d+)/g, 1),
      };
    });
    for (const k of Object.keys(extracted) as Array<keyof typeof extracted>) {
      const vals = extracted[k] || [];
      vals.forEach(v => pushUnique(ids[k as keyof MeasurementIds] as string[], v));
    }
  } catch (err) {
    console.warn(`  ⚠ extractAllMeasurementIds failed: ${(err as Error)?.message}`);
  }
}

// ─── GTM CONTAINER PARSER (fetch JSON over HTTPS) ───
async function parseGTMContainer(gtmId: string, siteUrl: string): Promise<GTMEvent[]> {
  const events: GTMEvent[] = [];
  try {
    const resp = await fetch(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`);
    if (!resp.ok) {
      console.warn(`  ⚠ GTM ${gtmId}: HTTP ${resp.status}`);
      return events;
    }
    const text = await resp.text();

    // dataLayer event names: "event":"name"
    const found = new Set<string>();
    for (const m of text.matchAll(/"event"\s*:\s*"([^"]+)"/g)) {
      const name = m[1];
      if (name && !GTM_INTERNAL_EVENTS.has(name)) found.add(name);
    }
    // GA4 eventName: "eventName":"name"
    for (const m of text.matchAll(/"eventName"\s*:\s*"([^"]+)"/g)) {
      const name = m[1];
      if (name && name.length < 60 && !GTM_INTERNAL_EVENTS.has(name)) found.add(name);
    }
    // Custom event trigger filters
    for (const m of text.matchAll(/customEventFilter[^}]*?"arg1"\s*:\s*"([^"]+)"/g)) {
      const name = m[1];
      if (name && !GTM_INTERNAL_EVENTS.has(name)) found.add(name);
    }

    found.forEach(name => events.push({
      eventName: name,
      tagType: 'GA4 Event',
      trigger: 'Defined in GTM container',
      gtmContainer: gtmId,
      capturedFromPage: siteUrl,
    }));

    console.log(`    GTM ${gtmId}: ${found.size} custom events configured (raw JS ${text.length} bytes)`);
  } catch (err) {
    console.warn(`  ⚠ Could not parse GTM container ${gtmId}:`, (err as Error)?.message);
  }
  return events;
}

// ─── BUSINESS MODEL DETECTION ───
// Inspects the live homepage DOM to classify what kind of site this is. The
// audit prompt uses this to gate which event recommendations are appropriate
// — e.g. a brand catalog that redirects to Amazon/Flipkart must NOT be told
// to add `purchase` / `add_to_cart` events because no checkout exists here.
async function detectBusinessModel(page: Page, siteUrl: string): Promise<BusinessModel> {
  const raw = await page.evaluate((url: string) => {
    const html = (document.body?.innerHTML || '').toLowerCase();
    const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    let baseHost = '';
    try { baseHost = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }

    // ─── Direct ecommerce signals ───
    const hasCartIcon = !!document.querySelector(
      "[class*='cart' i]:not([class*='add' i]), [aria-label*='cart' i], [class*='basket' i], [class*='bag-icon' i]"
    );
    const hasMyAccount = !!document.querySelector(
      "[class*='account' i], [href*='/account'], [href*='/login'], [class*='my-account' i]"
    );
    const hasCheckoutPage = links.some(a => /\/checkout|\/cart\/checkout|\/payment/i.test(a.href));
    const hasOrderHistory = links.some(a => /\/orders|\/order-history|\/my-orders/i.test(a.href));
    const hasPriceDisplay = /[$£€₹¥]\s*\d/.test(html) || /\d+\.\d{2}/.test(html);

    // ─── Retailer-redirect signals (brand catalog model) ───
    // Match common D2C retailer destinations. List intentionally conservative —
    // false positives would mis-classify the site type and tank recommendations.
    const knownRetailers = [
      'amazon.', 'amzn.', 'flipkart.', 'nykaa.', 'myntra.', 'ajio.',
      'walmart.', 'target.', 'bestbuy.', 'ebay.', 'etsy.',
      'shopee.', 'lazada.', 'rakuten.', 'alibaba.', 'aliexpress.',
      'boots.', 'superdrug.', 'tesco.', 'sainsburys.',
      'carrefour.', 'costco.', 'cvs.', 'walgreens.',
      'officedepot.', 'staples.', 'homedepot.', 'lowes.',
      'currys.', 'argos.', 'very.',
    ];
    const retailerHits = new Set<string>();
    for (const a of links) {
      try {
        const linkHost = new URL(a.href).hostname.toLowerCase();
        if (baseHost && linkHost.includes(baseHost)) continue; // same domain
        for (const r of knownRetailers) {
          if (linkHost.includes(r)) {
            retailerHits.add(r.replace('.', ''));
            break;
          }
        }
      } catch { /* skip invalid url */ }
    }

    const buttonTexts = buttons.map(b => (b.textContent || '').toLowerCase().trim());
    const hasBuyOnRetailerCTA = buttonTexts.some(t =>
      /buy\s+(on|at|from)\s+amazon|buy\s+on\s+flipkart|find\s+a\s+retailer|where\s+to\s+buy|find\s+a\s+store|store\s+locator|find\s+nearby/i.test(t)
    );

    // ─── Lead-gen signals ───
    const hasContactForm = !!document.querySelector(
      "form[action*='contact'], form[class*='contact'], form[id*='contact']"
    );
    const hasRequestDemo = buttonTexts.some(t =>
      /request\s+(a\s+)?demo|get\s+a\s+demo|schedule\s+demo|book\s+(a\s+)?demo|contact\s+sales|get\s+quote|free\s+trial/i.test(t)
    );
    const hasNewsletterForm = !!document.querySelector(
      "form[class*='newsletter'], form[class*='subscribe'], input[name*='email'][placeholder*='newsletter' i]"
    );

    // ─── SaaS signals ───
    const hasSaasFeatures = /pricing|features|integrations|api\b/.test(html) &&
      buttonTexts.some(t => /start\s+free|sign\s+up\s+free|try\s+free|create\s+account/i.test(t));

    // ─── Content publisher signals ───
    const articleCount = document.querySelectorAll('article').length;
    const isPublisher = articleCount > 5 || !!document.querySelector(
      "[class*='article-list'], [class*='post-list'], [class*='blog-list']"
    );

    return {
      hasCartIcon, hasMyAccount, hasCheckoutPage, hasOrderHistory, hasPriceDisplay,
      retailerHits: Array.from(retailerHits), hasBuyOnRetailerCTA,
      hasContactForm, hasRequestDemo, hasNewsletterForm,
      hasSaasFeatures, isPublisher,
    };
  }, siteUrl);

  // ─── Decide primary type. Order matters — most specific first. ───
  let primaryType: BusinessModelType = 'unknown';
  let reasoning = '';

  if (raw.hasCartIcon && raw.hasCheckoutPage && raw.hasMyAccount && raw.hasOrderHistory && !raw.hasBuyOnRetailerCTA) {
    primaryType = 'direct_ecommerce';
    reasoning = 'Has cart, checkout, accounts, and order history — direct ecommerce site';
  } else if (raw.retailerHits.length > 0 || raw.hasBuyOnRetailerCTA) {
    primaryType = 'brand_catalog_with_retailers';
    reasoning = raw.retailerHits.length > 0
      ? `Redirects users to ${raw.retailerHits.join(', ')} for actual purchases — brand/catalog site model`
      : 'Has "Where to buy" / "Find a retailer" CTAs but no own checkout — brand/catalog site';
  } else if (raw.hasRequestDemo || (raw.hasContactForm && !raw.hasCartIcon)) {
    primaryType = 'lead_generation';
    reasoning = 'Has contact/demo forms but no cart — lead-gen model';
  } else if (raw.hasSaasFeatures) {
    primaryType = 'saas';
    reasoning = 'Has pricing page and free signup — SaaS model';
  } else if (raw.isPublisher) {
    primaryType = 'content_publisher';
    reasoning = 'Has multiple articles — content publisher';
  } else if (raw.hasCartIcon && raw.hasPriceDisplay) {
    primaryType = 'direct_ecommerce';
    reasoning = 'Has cart and prices — likely direct ecommerce';
  } else {
    primaryType = 'informational';
    reasoning = 'No transactional features detected — informational site';
  }

  return {
    primaryType,
    hasOwnCheckout: raw.hasCheckoutPage,
    redirectsToRetailers: raw.retailerHits.length > 0 || raw.hasBuyOnRetailerCTA,
    retailers: raw.retailerHits,
    hasShoppingCart: raw.hasCartIcon,
    hasUserAccounts: raw.hasMyAccount,
    hasLeadForms: raw.hasContactForm || raw.hasRequestDemo || raw.hasNewsletterForm,
    reasoning,
  };
}

// ─── PAGE DISCOVERY (categorized same-origin links) ───
async function discoverPages(page: Page, baseUrl: string): Promise<Array<{ url: string; pageType: PageType }>> {
  const pages = await page.evaluate((base: string) => {
    let baseHost = '';
    try { baseHost = new URL(base).hostname; } catch { /* keep empty */ }
    const links = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set<string>();
    const discovered: Array<{ url: string; pageType: string }> = [];

    const patterns: Array<{ pageType: string; re: RegExp }> = [
      { pageType: 'cart',     re: /(?:^|\/)(cart|basket|bag|my-bag|shopping-cart)(?:\/|$)/i },
      { pageType: 'checkout', re: /(?:^|\/)checkout(?:\/|$)|(?:^|\/)order(?:\/|$)|(?:^|\/)payment(?:\/|$)/i },
      { pageType: 'product',  re: /\/products?\/[^/]+\/?$|\/p\/[^/]+|\/item\/[^/]+|\/product-detail\/|\/shop\/[^/]+\/[^/]+|-p-\d+/i },
      { pageType: 'category', re: /\/categor(?:y|ies)\/[^/]+|\/collections?\/[^/]+|\/product-collections?\/[^/]+|\/c\/[^/]+|\/department[s]?\/[^/]+|\/shop\/[^/]+\/?$/i },
      { pageType: 'pricing',  re: /\/pricing/i },
      { pageType: 'signup',   re: /\/sign[-_ ]?up|\/register/i },
      { pageType: 'login',    re: /\/login|\/sign[-_ ]?in/i },
      { pageType: 'about',    re: /\/about|\/company|\/who-we-are/i },
      { pageType: 'contact',  re: /\/contact|\/support|\/help/i },
      { pageType: 'blog',     re: /\/blog|\/news|\/articles/i },
    ];

    for (const a of links) {
      const href = (a as HTMLAnchorElement).href;
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      try {
        const u = new URL(href);
        if (baseHost && u.hostname !== baseHost) continue;
        const norm = u.origin + u.pathname;
        if (seen.has(norm)) continue;
        for (const p of patterns) {
          if (p.re.test(u.pathname)) {
            seen.add(norm);
            discovered.push({ url: norm, pageType: p.pageType });
            break;
          }
        }
      } catch { /* skip invalid url */ }
    }

    // Caps per page type so we don't go scanning 100 product pages
    const limits: Record<string, number> = {
      product: 2, category: 2, cart: 1, checkout: 1, about: 1, contact: 1,
      pricing: 1, signup: 1, login: 1, blog: 1, other: 0,
    };
    const counts: Record<string, number> = {};
    return discovered.filter(p => {
      counts[p.pageType] = (counts[p.pageType] || 0) + 1;
      return counts[p.pageType] <= (limits[p.pageType] ?? 0);
    });
  }, baseUrl);

  return pages as Array<{ url: string; pageType: PageType }>;
}

// ─── INTERACTION (delegates to the aggressive 9-phase user simulator) ───
function simResultToInteractionStats(sim: SimResult): InteractionStats {
  return {
    buttonsClicked: (sim.elementsClicked || 0) + (sim.ctasClicked || 0),
    eventMarkersTriggered: sim.eventMarkersTriggered || 0,
    productsClicked: sim.productsClicked || 0,
    navLinksClicked: sim.linksClicked || 0,
    scrollsPerformed: sim.scrolls || 0,
    formsInteracted: sim.formInteractions || 0,
    searchesPerformed: sim.searchesPerformed || 0,
    totalActions: (sim.eventMarkersTriggered || 0) + (sim.ctasClicked || 0) + (sim.productsClicked || 0) + (sim.elementsClicked || 0) + (sim.linksClicked || 0) + (sim.formInteractions || 0) + (sim.searchesPerformed || 0),
  };
}

async function automateInteraction(page: Page, label: string, budgetMs: number): Promise<InteractionStats> {
  try {
    const sim = await simulateRealUser(page, { maxDurationMs: budgetMs, label });
    return simResultToInteractionStats(sim);
  } catch (err) {
    console.warn(`  ⚠ Interaction on ${label} threw: ${(err as Error)?.message}`);
    return emptyStats();
  }
}

// ─── ROUTE TRACKING SPY EVENTS INTO GA4 / META / OTHER BUCKETS ───
function routeSpyEvents(
  events: NormalizedEvent[],
  pageUrl: string,
  ga4Events: GA4Event[],
  metaEvents: PixelEvent[],
  otherEvents: PixelEvent[],
  ids: MeasurementIds,
): void {
  for (const e of events) {
    try {
      const eventName = e.eventName;
      if (!eventName) continue;

      switch (e.vendor) {
        case 'GA4': {
          pushUnique(ids.ga4, e.measurementId || undefined);
          ga4Events.push({
            eventName,
            measurementId: e.measurementId || 'unknown',
            parameters: e.parameters || {},
            fired: true,
            capturedFromPages: [pageUrl],
            timestamp: new Date(e.timestamp || Date.now()).toISOString(),
            isStandardEvent: GA4_STANDARD_EVENTS.has(eventName),
          });
          break;
        }
        case 'MetaPixel': {
          pushUnique(ids.metaPixel, e.pixelId || undefined);
          metaEvents.push({
            eventName,
            pixelId: e.pixelId || '',
            source: 'Meta Pixel',
            parameters: e.parameters || {},
            capturedFromPages: [pageUrl],
            timestamp: new Date(e.timestamp || Date.now()).toISOString(),
          });
          break;
        }
        default: {
          // Everything else — TikTok / LinkedIn / Google Ads / Hotjar / Segment / etc.
          otherEvents.push({
            eventName,
            pixelId: e.pixelId || '',
            source: e.source || e.vendor || 'Unknown',
            parameters: e.parameters || {},
            capturedFromPages: [pageUrl],
            timestamp: new Date(e.timestamp || Date.now()).toISOString(),
          });
        }
      }
    } catch { /* one bad event never crashes the audit */ }
  }
}

// ─── DEDUPE (preserves capturedFromPages list across pages) ───
function dedupe<T extends { eventName: string; capturedFromPages: string[]; measurementId?: string; pixelId?: string; source?: string }>(events: T[]): T[] {
  const map = new Map<string, T>();
  for (const e of events) {
    const id = (e as any).measurementId || (e as any).pixelId || (e as any).source || '';
    const key = `${e.eventName.toLowerCase().trim()}::${id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...e, capturedFromPages: [...(e.capturedFromPages || [])] });
    } else {
      const seen = new Set(existing.capturedFromPages || []);
      for (const p of e.capturedFromPages || []) seen.add(p);
      existing.capturedFromPages = Array.from(seen);
    }
  }
  return Array.from(map.values());
}

function mergeStats(target: InteractionStats, source: InteractionStats): void {
  target.buttonsClicked += source.buttonsClicked;
  target.eventMarkersTriggered += source.eventMarkersTriggered;
  target.productsClicked += source.productsClicked;
  target.navLinksClicked += source.navLinksClicked;
  target.scrollsPerformed += source.scrollsPerformed;
  target.formsInteracted += source.formsInteracted;
  target.searchesPerformed += source.searchesPerformed;
  target.totalActions += source.totalActions;
}

// ─── MAIN ORCHESTRATOR ───
export async function auditExistingSite(submittedUrl: string): Promise<AuditResult> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  AUDIT STARTED: ${submittedUrl.substring(0, 40).padEnd(40)} ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Standard headless Chromium — Tracking Spy is a module, not an extension.
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2', '--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context: BrowserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    storageState: undefined,
  });
  await context.clearCookies();

  console.log('✓ Browser launched (Tracking Spy via addInitScript)');

  const ids = emptyIds();
  const allGtmContainerEvents: GTMEvent[] = [];
  const allGa4Events: GA4Event[] = [];
  const allMetaPixelEvents: PixelEvent[] = [];
  const allOtherPixelEvents: PixelEvent[] = [];
  const scannedPages: ScannedPage[] = [];
  const aggregateStats = emptyStats();
  let consentResult = { detected: false, accepted: false, cmp: null as string | null };
  let businessModel: BusinessModel = {
    primaryType: 'unknown',
    hasOwnCheckout: false,
    redirectsToRetailers: false,
    retailers: [],
    hasShoppingCart: false,
    hasUserAccounts: false,
    hasLeadForms: false,
    reasoning: 'Not yet detected',
  };

  try {
    // ─── STEP 2: HOMEPAGE ───
    console.log('\n━━━ STEP 2: FULL SITE SCRAPING (homepage) ━━━');
    const homepagePage = await context.newPage();
    await attachTrackingSpy(homepagePage);
    attachNetworkInterceptor(homepagePage, allGa4Events, allMetaPixelEvents, allOtherPixelEvents, submittedUrl, ids);

    try {
      await homepagePage.goto(submittedUrl, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      try { await homepagePage.goto(submittedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
      catch { await homepagePage.goto(submittedUrl, { waitUntil: 'commit', timeout: 15000 }); }
    }
    await homepagePage.waitForTimeout(2500);

    const consent = await detectAndAcceptConsent(homepagePage);
    consentResult = { detected: consent.detected, accepted: consent.accepted, cmp: consent.cmp };
    if (consent.cmp) console.log(`  ✓ Consent: ${consent.cmp} (accepted: ${consent.accepted}, method: ${consent.method})`);
    await homepagePage.waitForTimeout(2000);

    // ─── DETECT BUSINESS MODEL (must run BEFORE simulation triggers any
    // outbound retailer clicks, so we still see the original homepage state) ───
    console.log('\n━━━ DETECTING BUSINESS MODEL ━━━');
    try {
      businessModel = await detectBusinessModel(homepagePage, submittedUrl);
      console.log(`  Primary type: ${businessModel.primaryType}`);
      console.log(`  Reasoning:    ${businessModel.reasoning}`);
      if (businessModel.redirectsToRetailers && businessModel.retailers.length) {
        console.log(`  Retailers:    ${businessModel.retailers.join(', ')}`);
      }
      console.log(`  Has checkout: ${businessModel.hasOwnCheckout} | cart: ${businessModel.hasShoppingCart} | accounts: ${businessModel.hasUserAccounts} | lead forms: ${businessModel.hasLeadForms}`);
    } catch (err) {
      console.warn(`  ⚠ Business-model detection failed: ${(err as Error)?.message}`);
    }

    // ─── STEP 3: IDS + GTM CONTAINERS ───
    console.log('\n━━━ STEP 3: EXTRACTING IDS AND CONTAINERS ━━━');
    await extractAllMeasurementIds(homepagePage, ids);
    console.log(`  GA4: ${ids.ga4.length} (${ids.ga4.join(', ') || 'none'})`);
    console.log(`  GTM: ${ids.gtm.length} (${ids.gtm.join(', ') || 'none'})`);
    console.log(`  Meta: ${ids.metaPixel.length} | UA: ${ids.ua.length} | Google Ads: ${ids.googleAds.length}`);

    for (const gtmId of ids.gtm) {
      const containerEvents = await parseGTMContainer(gtmId, submittedUrl);
      allGtmContainerEvents.push(...containerEvents);
    }
    console.log(`  GTM Container Events: ${allGtmContainerEvents.length}`);

    // ─── STEP 4: INTERACTION ON HOMEPAGE ───
    console.log('\n━━━ STEP 4: AUTOMATIC INTERACTION ON HOMEPAGE ━━━');
    const homepageStats = await automateInteraction(homepagePage, 'homepage', 45000);
    mergeStats(aggregateStats, homepageStats);
    await homepagePage.waitForTimeout(6000); // settle — analytics debounce

    const homepageSpy = await readTrackingSpyEvents(homepagePage);
    routeSpyEvents(homepageSpy.events as NormalizedEvent[], submittedUrl, allGa4Events, allMetaPixelEvents, allOtherPixelEvents, ids);
    console.log(`  Tracking Spy hits on homepage: raw=${homepageSpy.rawHitCount}, unique=${homepageSpy.events.length}`);

    scannedPages.push({
      url: submittedUrl,
      pageType: 'homepage',
      title: await homepagePage.title().catch(() => ''),
      loadedSuccessfully: true,
      eventsCapturedOnPage: homepageSpy.events.length,
    });

    // ─── DISCOVER + SCAN SUB-PAGES ───
    console.log('\n━━━ DISCOVERING ADDITIONAL PAGES ━━━');
    const discovered = await discoverPages(homepagePage, submittedUrl);
    console.log(`  Found ${discovered.length} pages to scan`);
    await homepagePage.close();

    for (const info of discovered) {
      console.log(`\n  📄 Scanning ${info.pageType}: ${info.url}`);
      let subPage: Page | null = null;
      try {
        subPage = await context.newPage();
        await attachTrackingSpy(subPage);
        attachNetworkInterceptor(subPage, allGa4Events, allMetaPixelEvents, allOtherPixelEvents, info.url, ids);

        await subPage.goto(info.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await subPage.waitForTimeout(2500);

        const subStats = await automateInteraction(subPage, info.pageType, 25000);
        mergeStats(aggregateStats, subStats);
        await subPage.waitForTimeout(4000);

        const subSpy = await readTrackingSpyEvents(subPage);
        routeSpyEvents(subSpy.events as NormalizedEvent[], info.url, allGa4Events, allMetaPixelEvents, allOtherPixelEvents, ids);

        scannedPages.push({
          url: info.url,
          pageType: info.pageType,
          title: await subPage.title().catch(() => ''),
          loadedSuccessfully: true,
          eventsCapturedOnPage: subSpy.events.length,
        });
        console.log(`    ✓ ${subSpy.events.length} unique events captured`);
        await subPage.close();
      } catch (err) {
        const msg = (err as Error)?.message || String(err);
        console.warn(`  ⚠ Failed (${info.pageType}): ${msg}`);
        if (subPage) await subPage.close().catch(() => undefined);
        scannedPages.push({
          url: info.url,
          pageType: info.pageType,
          title: '',
          loadedSuccessfully: false,
          eventsCapturedOnPage: 0,
          error: msg,
        });
      }
    }

    // ─── DEDUPE EVENTS ACROSS PAGES ───
    const ga4Events = dedupe(allGa4Events);
    const metaPixelEvents = dedupe(allMetaPixelEvents);
    const otherPixelEvents = dedupe(allOtherPixelEvents);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  AUDIT COMPLETE                                          ║');
    console.log(`║  Pages scanned:        ${String(scannedPages.length).padEnd(34)} ║`);
    console.log(`║  GTM container events: ${String(allGtmContainerEvents.length).padEnd(34)} ║`);
    console.log(`║  GA4 events fired:     ${String(ga4Events.length).padEnd(34)} ║`);
    console.log(`║  Meta Pixel events:    ${String(metaPixelEvents.length).padEnd(34)} ║`);
    console.log(`║  Other pixel events:   ${String(otherPixelEvents.length).padEnd(34)} ║`);
    console.log(`║  Interaction actions:  ${String(aggregateStats.totalActions).padEnd(34)} ║`);
    console.log(`║  Duration:             ${(durationMs / 1000).toFixed(1)}s${' '.repeat(Math.max(0, 30 - (durationMs / 1000).toFixed(1).length))} ║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    return {
      submittedUrl,
      startedAt,
      completedAt,
      durationMs,
      pagesScanned: scannedPages,
      totalPagesScanned: scannedPages.length,
      measurementIds: ids,
      gtmContainerEvents: allGtmContainerEvents,
      ga4Events,
      metaPixelEvents,
      otherPixelEvents,
      interactionStats: aggregateStats,
      consentResult,
      businessModel,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
