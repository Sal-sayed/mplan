/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page } from 'playwright';
import { attachTrackingSpy, readTrackingSpyEvents, type NormalizedEvent } from './tracking-spy';
import { simulateRealUser, type SimResult } from './user-simulator';

export interface ScrapedPage {
  meta: Record<string, string>;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  buttons: { text: string; type: string; href: string; id: string; classes: string }[];
  links: {
    nav: { text: string; href: string }[];
    footer: { text: string; href: string }[];
    social: string[];
    external: number;
    internal: number;
  };
  forms: {
    action: string; method: string; id: string; name: string;
    fields: { type: string; name: string; id: string; placeholder: string; required: boolean; label: string }[];
    submitText: string;
  }[];
  ecommerce: Record<string, any>;
  pricing: Record<string, any>;
  media: Record<string, any>;
  engagement: Record<string, any>;
  socialProof: Record<string, any>;
  tech: Record<string, any>;
  ldJson: any[];
  bodyText: string;
  analyticsAudit: Record<string, any>;
}

export interface ScrapeResult {
  url: string;
  homepage: ScrapedPage;
  subPages: Record<string, ScrapedPage>;
  pagesScraped: number;
  networkCapture?: NetworkCaptureSummary;
  eventAudit?: EventAudit;
  siteType?: SiteType;
}

export type ScrapeMode = 'new' | 'existing';

export type SiteType = 'ecommerce' | 'lead-gen' | 'saas' | 'content' | 'marketplace' | 'other';

export type PageType =
  | 'homepage' | 'product' | 'category' | 'cart' | 'checkout'
  | 'pricing' | 'signup' | 'login' | 'about' | 'contact' | 'blog' | 'demo' | 'other';

export interface PageScanResult {
  type: PageType;
  url: string;
  eventsFound: number;
  success: boolean;
  error?: string;
}

export interface CategorizedEvent {
  eventName: string;
  source: string;
  vendor?: string;
  parameters?: Record<string, any>;
  pixelId?: string | null;
  measurementId?: string | null;
  transport?: string;
  method?: string;
  timestamp?: number;
  count?: number;
  isStandard?: boolean;
  confidenceSource?: string;
  category?: 'firing' | 'configured-not-firing';
  gtmContainer?: string | null;
  tagType?: string | null;
  trigger?: string | null;
  notes?: string;
  capturedFromPages?: PageType[];
}

export interface UserSimulationSummary {
  pagesSimulated: number;
  totalInteractions: number;  // sum of every click-equivalent action
  totalDurationMs: number;
  totals: {
    eventMarkersTriggered: number;
    ctasClicked: number;
    productsClicked: number;
    elementsClicked: number;
    linksClicked: number;
    scrolls: number;
    hovers: number;
    formInteractions: number;
    searchesPerformed: number;
    mediaTriggered: number;
  };
}

export interface EventAudit {
  detectionMethod: 'Tracking Spy + Playwright' | 'Playwright only' | 'static-only';
  trackingSpy: {
    installed: boolean;
    rawHitCount: number;
    counters: { fetch: number; xhr: number; beacon: number; image: number; dataLayer: number };
  };
  firingEvents: CategorizedEvent[];
  configuredEvents: CategorizedEvent[];
  pagesScanned: PageScanResult[];
  userSimulation: UserSimulationSummary;
}

interface CapturedEvent {
  eventName: string;
  source: string;
  parameters: Record<string, string>;
  isStandard: boolean;
  method: string;
}

interface CapturedPixel {
  source: string;
  url: string;
  eventName?: string;
  pixelId?: string | null;
  isStandard?: boolean;
}

interface TrackingRequest {
  tool: string;
  url: string;
  eventName?: string;
}

export interface NetworkCaptureSummary {
  totalAnalyticsRequests: number;
  ga4Hits: number;
  uaHits: number;
  metaPixelHits: number;
  toolsDetected: string[];
}

function detectToolFromUrl(url: string): string {
  if (url.includes('google-analytics.com')) return 'GA4';
  if (url.includes('facebook.com')) return 'Meta Pixel';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  if (url.includes('segment.io')) return 'Segment';
  if (url.includes('mixpanel.com')) return 'Mixpanel';
  if (url.includes('amplitude.com')) return 'Amplitude';
  if (url.includes('omtrdc.net')) return 'Adobe Analytics';
  return 'Unknown';
}

/**
 * Classify a URL into a page type using its path. Returns 'other' if no
 * pattern matches. Order matters — cart/checkout patterns are checked before
 * product/category to avoid /shop/cart being labelled "category".
 */
function classifyUrl(rawUrl: string): PageType {
  let p = rawUrl;
  try { p = new URL(rawUrl).pathname.toLowerCase(); } catch { p = rawUrl.toLowerCase(); }

  if (/(?:^|\/)(cart|basket|bag|my-bag|shopping-cart)(?:\/|$)/.test(p)) return 'cart';
  if (/(?:^|\/)checkout(?:\/|$)/.test(p)) return 'checkout';

  // Product detail patterns: /products/<slug>, /p/<slug>, /item/<slug>, slug-p-12345, /products/<slug>.html
  if (
    /\/products?\/[^/]+\/?$/.test(p) ||
    /\/p\/[^/]+/.test(p) ||
    /\/item\/[^/]+/.test(p) ||
    /\/product-detail\//.test(p) ||
    /\/shop\/[^/]+\/[^/]+/.test(p) ||
    /\/products?\/[^/]+\.html?$/.test(p) ||
    /-p-\d+/.test(p)
  ) return 'product';

  // Category / listing patterns: /category/<slug>, /collections/<slug>, /c/<slug>, /shop/<slug>
  if (
    /\/categor(?:y|ies)\/[^/]+/.test(p) ||
    /\/collections?\/[^/]+/.test(p) ||
    /\/product-collections?\/[^/]+/.test(p) ||
    /\/c\/[^/]+/.test(p) ||
    /\/department[s]?\/[^/]+/.test(p) ||
    /\/shop\/[^/]+\/?$/.test(p)
  ) return 'category';

  if (p.includes('/pricing')) return 'pricing';
  if (p.includes('/signup') || p.includes('/sign-up') || p.includes('/register')) return 'signup';
  if (p.includes('/login') || p.includes('/sign-in') || p.includes('/signin')) return 'login';
  if (p.includes('/about')) return 'about';
  if (p.includes('/contact')) return 'contact';
  if (p.includes('/blog') || p.includes('/news') || p.includes('/articles')) return 'blog';
  if (p.includes('/demo')) return 'demo';
  return 'other';
}

/**
 * Pick the first link from the homepage that matches each high-value page
 * type for analytics auditing (product / category / cart). Only returns
 * same-origin URLs so we don't drift off to a third-party domain.
 */
function discoverDeepPages(homepage: ScrapedPage, baseUrl: string): { product: string | null; category: string | null; cart: string | null } {
  let baseHost = '';
  try { baseHost = new URL(baseUrl).hostname; } catch { /* keep empty */ }

  const allLinks = [
    ...(homepage.links.nav || []).map(l => l.href),
    ...(homepage.links.footer || []).map(l => l.href),
  ].filter((h): h is string => !!h);

  const sameOrigin = (href: string): string | null => {
    try {
      const u = href.startsWith('http') ? new URL(href) : new URL(href, baseUrl);
      if (baseHost && u.hostname !== baseHost) return null;
      return u.toString();
    } catch { return null; }
  };

  const findFirst = (target: PageType): string | null => {
    for (const href of allLinks) {
      const abs = sameOrigin(href);
      if (!abs) continue;
      if (classifyUrl(abs) === target) return abs;
    }
    return null;
  };

  return {
    product: findFirst('product'),
    category: findFirst('category'),
    cart: findFirst('cart'),
  };
}

/**
 * Wire up Playwright request interception to capture analytics/pixel network traffic.
 * Only called in `existing` mode — for `new` mode we skip this entirely and just
 * collect static site structure.
 */
function setupNetworkInterception(
  page: Page,
  capturedEvents: CapturedEvent[],
  capturedPixels: CapturedPixel[],
  allTrackingRequests: TrackingRequest[],
  networkRequests: string[]
) {
  page.on('request', (request) => {
    const url = request.url();
    networkRequests.push(url);

    try {
      // GA4 Measurement Protocol
      if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(url)) {
        const params = new URL(url).searchParams;
        const eventName = params.get('en');
        const measurementId = params.get('tid');
        if (eventName) {
          const parameters: Record<string, string> = {};
          params.forEach((v, k) => {
            if (k.startsWith('ep.') || k.startsWith('epn.')) parameters[k.substring(k.indexOf('.') + 1)] = v;
          });
          capturedEvents.push({
            eventName,
            source: 'GA4',
            parameters,
            isStandard: GA4_STANDARD_EVENTS.has(eventName),
            method: 'Network (Measurement Protocol)',
          });
          allTrackingRequests.push({ tool: 'GA4', url: url.substring(0, 300), eventName });
          // Track measurementId via pixels list as a side note (kept lightweight)
          if (measurementId) capturedPixels.push({ source: 'GA4 Property', url: url.substring(0, 300), pixelId: measurementId });
        }
      }

      // Universal Analytics
      if (/google-analytics\.com\/collect(?!\/)/.test(url) || /google-analytics\.com\/r\/collect/.test(url)) {
        const params = new URL(url).searchParams;
        if (params.get('t') === 'event') {
          const ec = params.get('ec') || '';
          const ea = params.get('ea') || '';
          capturedEvents.push({
            eventName: `${ec}_${ea}`.replace(/^_|_$/g, ''),
            source: 'Universal Analytics',
            parameters: { category: ec, action: ea, label: params.get('el') || '' },
            isStandard: false,
            method: 'Network (UA Collect)',
          });
          allTrackingRequests.push({ tool: 'Universal Analytics', url: url.substring(0, 300) });
        }
      }

      // Meta Pixel
      if (/facebook\.com\/tr/.test(url)) {
        const params = new URL(url).searchParams;
        const ev = params.get('ev');
        if (ev) {
          capturedEvents.push({ eventName: ev, source: 'Meta Pixel', parameters: {}, isStandard: false, method: 'Network (Pixel)' });
          capturedPixels.push({
            source: 'Meta Pixel',
            url: url.substring(0, 300),
            eventName: ev,
            pixelId: params.get('id'),
            isStandard: ['PageView', 'ViewContent', 'AddToCart', 'Purchase', 'Lead'].includes(ev),
          });
          allTrackingRequests.push({ tool: 'Meta Pixel', url: url.substring(0, 300), eventName: ev });
        }
      }

      // TikTok Pixel
      if (url.includes('analytics.tiktok.com')) {
        capturedPixels.push({ source: 'TikTok Pixel', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'TikTok', url: url.substring(0, 300) });
      }

      // LinkedIn Insight
      if (url.includes('px.ads.linkedin.com') || url.includes('snap.licdn.com')) {
        capturedPixels.push({ source: 'LinkedIn Insight', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'LinkedIn', url: url.substring(0, 300) });
      }

      // Google Ads
      if (url.includes('googleadservices.com') || url.includes('googleads.g.doubleclick.net')) {
        capturedPixels.push({ source: 'Google Ads', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Google Ads', url: url.substring(0, 300) });
      }

      // Bing UET
      if (url.includes('bat.bing.com/action')) {
        capturedPixels.push({ source: 'Microsoft (Bing UET)', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Bing UET', url: url.substring(0, 300) });
      }

      // Pinterest
      if (url.includes('ct.pinterest.com')) {
        capturedPixels.push({ source: 'Pinterest Tag', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Pinterest', url: url.substring(0, 300) });
      }

      // Twitter / X
      if (url.includes('analytics.twitter.com')) {
        capturedPixels.push({ source: 'Twitter/X Pixel', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Twitter', url: url.substring(0, 300) });
      }

      // Hotjar
      if (/\.hotjar\.com\/api/.test(url)) {
        capturedPixels.push({ source: 'Hotjar', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Hotjar', url: url.substring(0, 300) });
      }

      // Segment
      if (url.includes('api.segment.io')) {
        capturedPixels.push({ source: 'Segment', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Segment', url: url.substring(0, 300) });
      }

      // Mixpanel
      if (url.includes('api.mixpanel.com')) {
        capturedPixels.push({ source: 'Mixpanel', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Mixpanel', url: url.substring(0, 300) });
      }

      // Amplitude
      if (url.includes('api.amplitude.com')) {
        capturedPixels.push({ source: 'Amplitude', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Amplitude', url: url.substring(0, 300) });
      }

      // Adobe Analytics
      if (/\.sc\.omtrdc\.net/.test(url) || url.includes('/b/ss/')) {
        capturedPixels.push({ source: 'Adobe Analytics', url: url.substring(0, 300) });
        allTrackingRequests.push({ tool: 'Adobe Analytics', url: url.substring(0, 300) });
      }
    } catch { /* malformed URL */ }
  });

  // POST body interception for tools that send analytics via POST
  page.on('requestfinished', (request) => {
    if (request.method() !== 'POST') return;
    const url = request.url();
    const isAnalytics = /\/(collect|track|pixel|conversion)|\.sc\.omtrdc\.net|segment\.io|mixpanel\.com|amplitude\.com/.test(url);
    if (!isAnalytics) return;

    try {
      const postData = request.postData();
      if (!postData) return;

      try {
        const data = JSON.parse(postData);
        capturedEvents.push({
          eventName: data.event || data.eventName || data.name || 'unknown',
          source: detectToolFromUrl(url),
          parameters: data,
          isStandard: false,
          method: 'POST body',
        });
      } catch {
        const params = new URLSearchParams(postData);
        const en = params.get('en') || params.get('event');
        if (en) {
          const parameters: Record<string, string> = {};
          params.forEach((v, k) => { parameters[k] = v; });
          capturedEvents.push({
            eventName: en,
            source: detectToolFromUrl(url),
            parameters,
            isStandard: false,
            method: 'POST form',
          });
        }
      }
    } catch { /* skip */ }
  });
}

const GA4_STANDARD_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'view_search_results', 'form_start', 'form_submit',
  'video_start', 'video_progress', 'video_complete', 'file_download', 'user_engagement',
  'session_start', 'first_visit', 'first_open',
]);

// Names to suppress from "configured / firing" lists — see comment on the
// matching set in lib/existing-site-auditor.ts.
const GTM_INTERNAL_EVENTS = new Set([
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick', 'gtm.formSubmit',
  'gtm.historyChange', 'gtm.timer', 'gtm.scrollDepth', 'gtm.video',
  'gtm.elementVisibility', 'gtm.triggerGroup', 'gtm.init_consent',
  'load', 'DOMContentLoaded', 'readystatechange', 'beforeunload', 'unload',
  'pageshow', 'pagehide', 'visibilitychange',
  'OneTrustLoaded', 'OptanonLoaded', 'OneTrustGroupsUpdated', 'OptanonConsent',
  'CookieConsent', 'cookiebot_loaded', 'cookiebot_consent',
  'consent_default', 'consent_update', 'cookie_consent_update',
  'customEvent', 'pageEvent',
  'virtualPageview', 'virtual_pageview',
]);

// ═══════════════════════════════════════════
// UNIVERSAL CONSENT BANNER DETECTION + ACCEPTANCE
// Handles: main DOM, iframes, shadow DOM, late-loading CMPs
// ═══════════════════════════════════════════

/** Quick signal check — does the page have any consent-related element visible? */
async function hasConsentSignal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Global JS variables that CMPs set
    const globals = ['OneTrust', 'Cookiebot', 'Didomi', '__tcfapi', '__cmp', 'OptanonActiveGroups', '_iub'];
    for (const g of globals) { if ((window as any)[g]) return true; }
    // Visible DOM elements
    const sels = [
      '[id*="cookie" i]:not([id*="cookie-policy"])', '[id*="consent" i]', '[id*="gdpr" i]', '[id*="cmp" i]',
      '[class*="cookie-banner" i]', '[class*="cookie-notice" i]', '[class*="consent-banner" i]',
      '[class*="consent-modal" i]', '[class*="gdpr" i]', '[class*="privacy-notice" i]',
      '[role="dialog"][aria-label*="cookie" i]', '[role="dialog"][aria-label*="consent" i]',
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (s.display !== 'none' && s.visibility !== 'hidden' && r.height > 30 && r.width > 100) return true;
      }
    }
    return false;
  }).catch(() => false);
}

/** Poll for banner appearance over time (handles late-loading CMPs) */
async function waitForConsentBanner(page: Page, maxWaitMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await hasConsentSignal(page)) {
      console.log(`Consent signal detected after ${Date.now() - start}ms`);
      await page.waitForTimeout(1000); // let it fully render
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

/** Check iframes for consent banners (TrustArc, IAB TCF, etc.) */
async function checkIframesForConsent(page: Page): Promise<{ found: boolean; frameUrl: string | null }> {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      if (frame === page.mainFrame()) continue;
      const url = frame.url();
      if (url.match(/doubleclick|googleadservices|facebook\.com\/plugins|twitter\.com\/widgets/i)) continue;
      if (url.match(/cookielaw|onetrust|cookiebot|didomi|trustarc|truste|quantcast|usercentrics|consent|privacy|cmp|gdpr/i)) {
        return { found: true, frameUrl: url };
      }
      try {
        const hasContent = await frame.evaluate(() => {
          const t = document.body?.textContent?.toLowerCase() || '';
          return t.includes('cookie') || t.includes('consent') || t.includes('privacy');
        });
        if (hasContent) return { found: true, frameUrl: url };
      } catch { /* cross-origin */ }
    } catch { continue; }
  }
  return { found: false, frameUrl: null };
}

/** Try to accept consent inside an iframe */
async function acceptInIframe(page: Page, frameUrl: string): Promise<boolean> {
  const frame = page.frames().find(f => f.url() === frameUrl);
  if (!frame) return false;
  const patterns = [
    "button:has-text('Accept All')", "button:has-text('Accept all')", "button:has-text('I Accept')",
    "button:has-text('Accept Cookies')", "button:has-text('Got it')", "button:has-text('Agree')",
    "[id*='accept' i]:not([id*='reject' i])", "[class*='accept' i]:not([class*='reject' i])",
  ];
  for (const pat of patterns) {
    try {
      const btn = frame.locator(pat).first();
      if (await btn.isVisible({ timeout: 600 })) {
        await btn.click({ timeout: 2000 });
        console.log(`Consent accepted in iframe: ${pat}`);
        await page.waitForTimeout(4000);
        return true;
      }
    } catch { continue; }
  }
  return false;
}

/** Check shadow DOM trees for consent banners */
async function checkShadowDom(page: Page): Promise<{ found: boolean; clicked: boolean }> {
  return page.evaluate(() => {
    function walk(root: any, depth: number): { found: boolean; clicked: boolean } {
      if (!root || depth > 8) return { found: false, clicked: false };
      const els = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      for (const el of els) {
        if ((el as any).shadowRoot) {
          const r = walk((el as any).shadowRoot, depth + 1);
          if (r.found || r.clicked) return r;
        }
        const text = ((el as HTMLElement).textContent || '').toLowerCase().substring(0, 500);
        const cls = ((el as HTMLElement).className?.toString() || '').toLowerCase();
        const id = ((el as HTMLElement).id || '').toLowerCase();
        if ((text.includes('cookie') || text.includes('consent') || cls.match(/cookie|consent|gdpr|cmp/) || id.match(/cookie|consent|gdpr|cmp/)) &&
            (el as HTMLElement).getBoundingClientRect().height > 50) {
          const btns = (el as HTMLElement).querySelectorAll('button, [role="button"]');
          for (const btn of Array.from(btns)) {
            const bt = ((btn as HTMLElement).textContent || '').trim().toLowerCase();
            if (bt.match(/^(accept all|accept|allow all|agree|i accept|got it|ok)$/)) {
              try { (btn as HTMLElement).click(); return { found: true, clicked: true }; } catch { continue; }
            }
          }
          return { found: true, clicked: false };
        }
      }
      return { found: false, clicked: false };
    }
    return walk(document, 0);
  }).catch(() => ({ found: false, clicked: false }));
}

/** Universal heuristic: find and click accept button by text pattern */
async function universalAcceptClick(page: Page): Promise<{ detected: boolean; accepted: boolean; cmp: string | null; method: string; bannerElement: string | null }> {
  const detection = await page.evaluate(() => {
    const KEYWORDS = ['cookie', 'cookies', 'consent', 'gdpr', 'ccpa', 'dpdp', 'privacy notice',
      'data protection', 'tracking', 'personalize', 'preferences', 'your choices',
      'we value your privacy', 'your data', 'third party', 'essential cookies', 'marketing cookies'];
    const candidates: any[] = [];
    document.querySelectorAll('*').forEach((el: any) => {
      if (!el?.getBoundingClientRect) return;
      const style = window.getComputedStyle(el); const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      if (rect.width < 200 || rect.height < 50) return;
      const pos = style.position; const z = parseInt(style.zIndex) || 0;
      if (pos !== 'fixed' && pos !== 'sticky' && !(pos === 'absolute' && z > 100)) return;
      const text = (el.textContent || '').toLowerCase().substring(0, 2000);
      const matched = KEYWORDS.filter(kw => text.includes(kw));
      if (matched.length === 0) return;
      let score = matched.length * 10;
      score += Math.min(el.querySelectorAll('button, [role="button"]').length * 5, 20);
      const attrs = ((el.className?.toString() || '') + ' ' + (el.id || '')).toLowerCase();
      if (attrs.match(/cookie|consent|gdpr|privacy|cmp|banner|notice/)) score += 30;
      if (rect.bottom > window.innerHeight - 100 || rect.top < 100) score += 15;
      if (rect.width > window.innerWidth * 0.95 && rect.height > window.innerHeight * 0.8) score -= 30;
      candidates.push({ score, className: (el.className?.toString() || '').substring(0, 100), id: (el.id || '').substring(0, 50), keywords: matched });
    });
    candidates.sort((a, b) => b.score - a.score);
    return { found: candidates.length > 0, best: candidates[0] || null };
  });

  if (!detection.found) return { detected: false, accepted: false, cmp: null, method: 'none', bannerElement: null };

  console.log(`Consent banner heuristic (score: ${detection.best?.score})`);

  const click = await page.evaluate(() => {
    const PATS = [
      /accept\s*all\s*cookies?/i, /allow\s*all\s*cookies?/i, /accept\s*cookies?/i, /allow\s*cookies?/i,
      /accept\s*all/i, /allow\s*all/i, /agree\s*and\s*(continue|close)/i, /accept\s*&?\s*close/i,
      /^accept$/i, /^agree$/i, /^allow$/i, /^i\s*accept$/i, /^i\s*agree$/i, /^got\s*it!?$/i,
      /^ok$/i, /^okay$/i, /^continue$/i, /^close$/i, /^dismiss$/i,
    ];
    const clickables = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]'));
    const visible = clickables.filter((el: any) => {
      const s = window.getComputedStyle(el); const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
    });
    for (const pat of PATS) {
      for (const el of visible) {
        const text = (el.textContent || (el as HTMLInputElement).value || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        if (!pat.test(text) && !pat.test(aria)) continue;
        let parent: any = el; let inBanner = false;
        for (let i = 0; i < 8 && parent; i++) {
          const pt = (parent.textContent || '').toLowerCase().substring(0, 1500);
          const pc = ((parent.className?.toString() || '') + ' ' + (parent.id || '')).toLowerCase();
          if (pc.match(/cookie|consent|gdpr|privacy|cmp|banner|notice/) || pt.match(/(cookie|consent|gdpr|privacy|data\s*protection|we\s*value\s*your\s*privacy)/)) { inBanner = true; break; }
          parent = parent.parentElement;
        }
        if (inBanner) { try { (el as HTMLElement).click(); return { clicked: true, text: text.substring(0, 50) }; } catch { continue; } }
      }
    }
    return { clicked: false, text: null };
  });

  if (click.clicked) {
    console.log(`Consent accepted: "${click.text}"`);
    await page.waitForTimeout(4000);
    return { detected: true, accepted: true, cmp: 'Universal Detection', method: `text-pattern: ${click.text}`, bannerElement: detection.best?.id || detection.best?.className || null };
  }

  // Keyboard fallback
  try {
    await page.keyboard.press('Tab'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(2000);
    const gone = await page.evaluate(() => {
      const banners = document.querySelectorAll('[class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i]');
      for (const b of Array.from(banners)) { const s = window.getComputedStyle(b); if (s.display !== 'none' && (b as Element).getBoundingClientRect().height > 30) return false; }
      return true;
    });
    if (gone) { await page.waitForTimeout(3000); return { detected: true, accepted: true, cmp: 'Universal Detection', method: 'keyboard-fallback', bannerElement: null }; }
  } catch { /* keyboard failed */ }

  return { detected: true, accepted: false, cmp: 'Custom CMP', method: 'detected-not-clicked', bannerElement: detection.best?.id || detection.best?.className || null };
}

/** Main orchestrator — tries fast path, polling, iframes, shadow DOM, universal heuristic */
export async function detectAndAcceptConsent(page: Page): Promise<{
  detected: boolean; accepted: boolean; cmp: string | null; method: string; bannerElement: string | null;
}> {
  console.log('Starting consent detection...');

  // PHASE 1: Poll for banner appearance (up to 12 seconds for late-loading CMPs)
  const appeared = await waitForConsentBanner(page, 12000);

  if (!appeared) {
    // Check iframes
    const iframe = await checkIframesForConsent(page);
    if (iframe.found && iframe.frameUrl) {
      const clicked = await acceptInIframe(page, iframe.frameUrl);
      return { detected: true, accepted: clicked, cmp: 'Iframe CMP', method: clicked ? 'iframe-click' : 'iframe-detected', bannerElement: iframe.frameUrl };
    }
    // Check shadow DOM
    const shadow = await checkShadowDom(page);
    if (shadow.found) {
      if (shadow.clicked) await page.waitForTimeout(4000);
      return { detected: true, accepted: shadow.clicked, cmp: 'Shadow DOM CMP', method: shadow.clicked ? 'shadow-dom-click' : 'shadow-dom-detected', bannerElement: null };
    }
    return { detected: false, accepted: false, cmp: null, method: 'none', bannerElement: null };
  }

  // PHASE 2: Fast path — known CMP selectors
  const knownCMPs = [
    { cmp: 'OneTrust', selector: '#onetrust-accept-btn-handler' },
    { cmp: 'Cookiebot', selector: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll' },
    { cmp: 'Didomi', selector: '#didomi-notice-agree-button' },
    { cmp: 'Quantcast', selector: ".qc-cmp2-summary-buttons button[mode='primary']" },
    { cmp: 'TrustArc', selector: '#truste-consent-button' },
    { cmp: 'Usercentrics', selector: "[data-testid='uc-accept-all-button']" },
    { cmp: 'Osano', selector: '.osano-cm-accept-all' },
    { cmp: 'CookieYes', selector: '.cky-btn-accept' },
    { cmp: 'Termly', selector: '.t-accept-all' },
    { cmp: 'Iubenda', selector: '.iubenda-cs-accept-btn' },
  ];

  for (const { cmp, selector } of knownCMPs) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 2000 });
        console.log(`Fast-path consent accepted: ${cmp}`);
        await page.waitForTimeout(4000);
        return { detected: true, accepted: true, cmp, method: 'known-cmp', bannerElement: selector };
      }
    } catch { continue; }
  }

  // PHASE 3: Check iframes (banner signal detected but no known CMP matched — might be in iframe)
  const iframe = await checkIframesForConsent(page);
  if (iframe.found && iframe.frameUrl) {
    const clicked = await acceptInIframe(page, iframe.frameUrl);
    if (clicked) return { detected: true, accepted: true, cmp: 'Iframe CMP', method: 'iframe-click', bannerElement: iframe.frameUrl };
  }

  // PHASE 4: Check shadow DOM
  const shadow = await checkShadowDom(page);
  if (shadow.clicked) {
    await page.waitForTimeout(4000);
    return { detected: true, accepted: true, cmp: 'Shadow DOM CMP', method: 'shadow-dom-click', bannerElement: null };
  }

  // PHASE 5: Universal heuristic text-pattern match
  return universalAcceptClick(page);
}

// ═══════════════════════════════════════════

async function scrapePage(
  page: Page,
  pageUrl: string,
  mode: ScrapeMode = 'new',
  shared?: {
    capturedEvents: CapturedEvent[];
    capturedPixels: CapturedPixel[];
    allTrackingRequests: TrackingRequest[];
    networkRequests: string[];
  },
  opts: { skipConsent?: boolean; simulationMs?: number; pageLabel?: string } = {}
): Promise<ScrapedPage> {
  // Storage arrays — populated only in `existing` mode via network interception
  const networkRequests: string[] = shared?.networkRequests ?? [];
  const capturedEvents: CapturedEvent[] = shared?.capturedEvents ?? [];
  const capturedPixels: CapturedPixel[] = shared?.capturedPixels ?? [];
  const allTrackingRequests: TrackingRequest[] = shared?.allTrackingRequests ?? [];

  // ─── CONDITIONAL: TRACKING SPY + BACKUP NETWORK INTERCEPTION (EXISTING ONLY) ───
  if (mode === 'existing') {
    if (!shared) console.log('🕵 Tracking Spy attaching via addInitScript (existing-website mode)');
    // PRIMARY: in-page capture via addInitScript — runs before any page script.
    try {
      await attachTrackingSpy(page);
    } catch (err) {
      console.warn('[tracking-spy] attach failed, falling back to Playwright-only capture:', (err as Error)?.message);
    }
    // BACKUP: Playwright-side network listener as a cross-check / safety net.
    setupNetworkInterception(page, capturedEvents, capturedPixels, allTrackingRequests, networkRequests);
  } else {
    console.log('📋 Tracking Spy + network interception SKIPPED (new website mode — capturing site structure only)');
  }

  // ─── NAVIGATE ───
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 25000 });
  } catch {
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch {
      await page.goto(pageUrl, { waitUntil: 'commit', timeout: 15000 });
    }
  }
  await page.waitForTimeout(2000);

  // ─── CONSENT BANNER: detect and accept (skip on sub-pages — context cookies carry the homepage decision) ───
  const consentResult = opts.skipConsent
    ? { detected: false, accepted: false, cmp: null as string | null, method: 'skipped (sub-page)', bannerElement: null as string | null }
    : await detectAndAcceptConsent(page);

  // ─── UNIVERSAL USER SIMULATION (existing mode only) ───
  // 9-phase aggressive interaction pass: scroll → click event markers → CTAs
  // → product cards → all buttons → nav links → search → form fields →
  // deep scroll. Each phase uses multi-event dispatch + native node.click()
  // to maximize trigger probability.
  let userSimulation: SimResult | null = null;
  if (mode === 'existing') {
    try {
      console.log('\n🤖 AUTOMATED INTERACTION STARTING');
      console.log('════════════════════════════════════════');
      userSimulation = await simulateRealUser(page, {
        maxDurationMs: opts.simulationMs ?? 45000,
        label: opts.pageLabel || 'page',
      });
      const totalClicks = userSimulation.eventMarkersTriggered + userSimulation.ctasClicked + userSimulation.productsClicked + userSimulation.elementsClicked + userSimulation.linksClicked;
      console.log(`Total interactions: ${totalClicks}`);
      console.log(`  Event markers triggered: ${userSimulation.eventMarkersTriggered}`);
      console.log(`  CTAs clicked:            ${userSimulation.ctasClicked}`);
      console.log(`  Product cards clicked:   ${userSimulation.productsClicked}`);
      console.log(`  Buttons clicked:         ${userSimulation.elementsClicked}`);
      console.log(`  Nav links clicked:       ${userSimulation.linksClicked}`);
      console.log(`  Searches:                ${userSimulation.searchesPerformed}`);
      console.log(`  Form focus:              ${userSimulation.formInteractions}`);
      console.log(`  Scrolls:                 ${userSimulation.scrolls}`);
      console.log('════════════════════════════════════════\n');
      // Settle wait — analytics calls often batch + debounce, so we need a
      // generous window for everything to actually land before we drain.
      await page.waitForTimeout(6000);
    } catch (err) {
      console.warn('[user-simulator] threw at top level:', (err as Error)?.message);
    }
  }

  const data: ScrapedPage = await page.evaluate(() => {
    const text = (el: Element | null) => el?.textContent?.trim().slice(0, 200) || '';
    const attr = (el: Element | null, a: string) => el?.getAttribute(a) || '';

    // 1. META
    const meta = {
      title: document.title,
      description: attr(document.querySelector('meta[name="description"]'), 'content'),
      keywords: attr(document.querySelector('meta[name="keywords"]'), 'content'),
      ogType: attr(document.querySelector('meta[property="og:type"]'), 'content'),
      ogSiteName: attr(document.querySelector('meta[property="og:site_name"]'), 'content'),
      canonical: attr(document.querySelector('link[rel="canonical"]'), 'href'),
      lang: document.documentElement.lang,
    };

    // 2. HEADINGS
    const headings = {
      h1: [...document.querySelectorAll('h1')].map(text).filter(Boolean).slice(0, 15),
      h2: [...document.querySelectorAll('h2')].map(text).filter(Boolean).slice(0, 25),
      h3: [...document.querySelectorAll('h3')].map(text).filter(Boolean).slice(0, 30),
    };

    // 3. BUTTONS & CTAs
    const buttons = [...document.querySelectorAll(
      'button, [role="button"], a.btn, a.button, [class*="btn"], [class*="cta"], input[type="submit"]'
    )].map(el => ({
      text: text(el),
      type: el.tagName.toLowerCase(),
      href: attr(el, 'href'),
      id: attr(el, 'id'),
      classes: attr(el, 'class').slice(0, 100),
    })).filter(b => b.text).slice(0, 50);

    // 4. LINKS
    const allLinks = [...document.querySelectorAll('a[href]')];
    const links = {
      nav: [...document.querySelectorAll('nav a, header a, [role="navigation"] a')]
        .map(a => ({ text: text(a), href: attr(a, 'href') })).filter(l => l.text).slice(0, 30),
      footer: [...document.querySelectorAll('footer a')]
        .map(a => ({ text: text(a), href: attr(a, 'href') })).filter(l => l.text).slice(0, 30),
      social: allLinks.filter(a => /facebook|twitter|x\.com|instagram|linkedin|youtube|tiktok|github|discord/i.test(attr(a, 'href')))
        .map(a => attr(a, 'href')).slice(0, 10),
      external: allLinks.filter(a => attr(a, 'href').startsWith('http') && !attr(a, 'href').includes(location.hostname)).length,
      internal: allLinks.filter(a => attr(a, 'href').startsWith('/') || attr(a, 'href').includes(location.hostname)).length,
    };

    // 5. FORMS
    const forms = [...document.querySelectorAll('form')].map(form => ({
      action: attr(form, 'action'),
      method: attr(form, 'method') || 'GET',
      id: attr(form, 'id'),
      name: attr(form, 'name'),
      fields: [...form.querySelectorAll('input, select, textarea')].map(f => ({
        type: attr(f, 'type') || f.tagName.toLowerCase(),
        name: attr(f, 'name'),
        id: attr(f, 'id'),
        placeholder: attr(f, 'placeholder'),
        required: f.hasAttribute('required'),
        label: text(document.querySelector(`label[for="${attr(f, 'id')}"]`)),
      })),
      submitText: text(form.querySelector('button[type="submit"], input[type="submit"]')),
    })).slice(0, 15);

    // 6. ECOMMERCE
    const htmlText = document.body.innerText || '';
    const priceRegex = /[$€£¥₹]\s?\d[\d,.]*|\d[\d,.]*\s?(USD|EUR|GBP|INR|JPY)/g;
    const prices = (htmlText.match(priceRegex) || []).slice(0, 30);
    const ecommerce = {
      hasCart: !!document.querySelector('[class*="cart"], [id*="cart"], [aria-label*="cart" i]'),
      hasCheckout: /checkout/i.test(htmlText),
      hasAddToCart: !!document.querySelector('[class*="add-to-cart"], [data-add-to-cart]'),
      hasWishlist: /wishlist|favourite|save for later/i.test(htmlText),
      hasReviews: !!document.querySelector('[class*="review"], [class*="rating"], [class*="stars"]'),
      priceCount: prices.length,
      priceSamples: prices.slice(0, 10),
      productCardCount: document.querySelectorAll('[class*="product"], [class*="card"], [class*="item"], [data-product]').length,
      currencies: [...new Set(prices.map(p => (p.match(/[$€£¥₹]|USD|EUR|GBP|INR|JPY/) || [])[0]).filter(Boolean))],
    };

    // 7. PRICING
    const pricingSection = document.querySelector('[id*="pric" i], [class*="pric" i], [class*="plan" i]');
    const pricing = {
      hasPricingPage: !!pricingSection,
      tierCount: pricingSection ? pricingSection.querySelectorAll('[class*="plan"], [class*="tier"], [class*="card"]').length : 0,
      hasFreeTrial: /free trial|try free|start free|14[- ]day free|30[- ]day free/i.test(htmlText),
      hasFreemium: /free forever|free plan|free tier/i.test(htmlText),
      billingToggle: !!document.querySelector('[class*="billing"], [class*="annual"], [class*="monthly"]'),
    };

    // 8. MEDIA
    const media = {
      videoCount: document.querySelectorAll("video, iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='wistia']").length,
      imageCount: document.querySelectorAll('img').length,
      hasGallery: !!document.querySelector('[class*="gallery"], [class*="carousel"], [class*="slider"]'),
      hasBlog: /\/blog|\/articles|\/posts|\/news/i.test([...document.querySelectorAll('a')].map(a => attr(a, 'href')).join(' ')),
      hasPodcast: /podcast|episode/i.test(htmlText),
      hasDownloads: !!document.querySelector('a[href$=".pdf"], a[href$=".zip"], a[href*="download"]'),
    };

    // 9. ENGAGEMENT
    const engagement = {
      hasNewsletter: /newsletter|subscribe|email updates|stay in the loop/i.test(htmlText),
      hasChatbot: !!document.querySelector('[class*="chat"], [class*="intercom"], [class*="drift"], [class*="zendesk"], [id*="chat"]'),
      hasLiveSearch: !!document.querySelector('[type="search"], [class*="search"][role], [class*="autocomplete"]'),
      hasLogin: /sign in|log in|login/i.test(htmlText),
      hasSignup: /sign up|register|create account|get started/i.test(htmlText),
      hasDemo: /book a demo|request demo|schedule demo|see it in action/i.test(htmlText),
      hasContactForm: forms.some(f => /contact|inquiry|message/i.test(JSON.stringify(f))),
      hasCookieBanner: !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"]'),
    };

    // 10. SOCIAL PROOF
    const socialProof = {
      hasTestimonials: /testimonial|customer story|case study|what.*customers? say/i.test(htmlText),
      hasLogos: !!document.querySelector('[class*="logo-cloud"], [class*="customers"], [class*="trusted-by"]'),
      hasRatings: /\d\.\d\s?(out of|\/)\s?\d|★|stars?/i.test(htmlText),
      hasAwards: /award|recognition|featured in|as seen in/i.test(htmlText),
    };

    // 11. TECH STACK
    const scripts = [...document.querySelectorAll('script[src]')].map(s => attr(s, 'src'));
    const inlineScripts = [...document.querySelectorAll('script:not([src])')].map(s => s.innerHTML).join(' ');
    const allScripts = scripts.join(' ') + inlineScripts;
    const tech = {
      googleAnalytics: /google-analytics|googletagmanager|gtag\(/i.test(allScripts),
      gtm: /googletagmanager/i.test(allScripts),
      facebookPixel: /fbevents|connect\.facebook/i.test(allScripts),
      hotjar: /hotjar/i.test(allScripts),
      segment: /segment\.io|analytics\.js/i.test(allScripts),
      mixpanel: /mixpanel/i.test(allScripts),
      intercom: /intercom/i.test(allScripts),
      hubspot: /hubspot|hs-script/i.test(allScripts),
      shopify: /shopify/i.test(allScripts),
      wordpress: /wp-content|wp-includes/i.test(allScripts),
      hasDataLayer: /dataLayer\s*=/i.test(inlineScripts),
    };

    // 12. STRUCTURED DATA
    const ldJson = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.innerHTML); } catch { return null; } })
      .filter(Boolean);

    // 13. BODY TEXT
    const mainEl = document.querySelector("main, article, [role='main']") || document.body;
    const bodyText = (mainEl as HTMLElement).innerText?.replace(/\s+/g, ' ').slice(0, 4000) || '';

    // 14. ANALYTICS AUDIT
    // Extract ALL IDs (not just first match)
    const ga4Ids = [...new Set((allScripts.match(/G-[A-Z0-9]{6,12}/g) || []))];
    const gtmIds = [...new Set((allScripts.match(/GTM-[A-Z0-9]{4,10}/g) || []))];
    const uaIds = [...new Set((allScripts.match(/UA-\d{4,10}-\d{1,4}/g) || []))];
    const awIds = [...new Set((inlineScripts.match(/AW-\d{6,12}/g) || []))];
    const metaPixelIds = [...(inlineScripts.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]\)/g))].map(m => m[1]);
    const linkedinIds = [...(allScripts.matchAll(/_linkedin_partner_id\s*=\s*['"]?(\d+)/g))].map(m => m[1]);
    const tiktokIds = [...(allScripts.matchAll(/ttq\.load\(\s*['"]([^'"]+)['"]\)/g))].map(m => m[1]);

    // Extract ALL events firing (gtag + dataLayer.push)
    const gtagEvents = [...inlineScripts.matchAll(/gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const dlEvents = [...inlineScripts.matchAll(/dataLayer\.push\(\s*\{\s*['"]?event['"]?\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const fbqEvents = [...inlineScripts.matchAll(/fbq\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const allDetectedEvents = [...new Set([...gtagEvents, ...dlEvents, ...fbqEvents])];

    const analyticsAudit = {
      ga4: {
        installed: ga4Ids.length > 0,
        measurementId: ga4Ids[0] || null,
        measurementIds: ga4Ids,
        sendsPageView: /gtag\(\s*['"]event['"]\s*,\s*['"]page_view/.test(inlineScripts),
        customEventsFound: allDetectedEvents.filter(e => e !== 'page_view' && e !== 'gtm.js' && e !== 'gtm.dom' && e !== 'gtm.load'),
        allEventsDetected: allDetectedEvents,
      },
      ua: {
        installed: uaIds.length > 0,
        trackingId: uaIds[0] || null,
        propertyIds: uaIds,
      },
      gtm: {
        installed: gtmIds.length > 0,
        containerId: gtmIds[0] || null,
        containerIds: gtmIds,
        serverSideGTM: /server.googletagmanager|sgtm/.test(allScripts),
      },
      dataLayer: {
        exists: /window\.dataLayer\s*=|dataLayer\s*=\s*\[/.test(inlineScripts),
        pushCount: (inlineScripts.match(/dataLayer\.push/g) || []).length,
        hasEcommerceObject: /dataLayer.*ecommerce/i.test(inlineScripts),
        eventsInDataLayer: dlEvents,
        namingConvention: /dataLayer\.push\(\s*\{\s*['"]?event['"]?\s*:\s*['"][a-z_]+['"]/.test(inlineScripts)
          ? 'snake_case'
          : /dataLayer\.push\(\s*\{\s*['"]?event['"]?\s*:\s*['"][a-z][a-zA-Z]+['"]/.test(inlineScripts)
            ? 'camelCase' : 'unknown',
      },
      pixels: {
        metaPixel: { installed: metaPixelIds.length > 0 || /fbq\(\s*['"]init['"]/.test(inlineScripts) || /connect\.facebook\.net.*fbevents/.test(allScripts), ids: metaPixelIds },
        linkedinInsight: { installed: /_linkedin_partner_id|snap\.licdn\.com/.test(allScripts), ids: linkedinIds },
        tiktokPixel: { installed: /ttq\.load|analytics\.tiktok\.com/.test(allScripts), ids: tiktokIds },
        twitterPixel: { installed: /static\.ads-twitter\.com|twq\(/.test(allScripts), ids: [] as string[] },
        pinterestTag: { installed: /pintrk\(/.test(inlineScripts), ids: [] as string[] },
        redditPixel: { installed: /rdt\(/.test(inlineScripts), ids: [] as string[] },
        googleAdsConversion: { installed: awIds.length > 0, ids: awIds },
        bingUET: { installed: /bat\.bing\.com|uetq/.test(allScripts), ids: [] as string[] },
      },
      behavior: {
        hotjar: /static\.hotjar\.com|hjid/.test(allScripts),
        fullstory: /fullstory\.com\/s\/fs/.test(allScripts),
        microsoftClarity: /clarity\.ms/.test(allScripts),
        mixpanel: /mixpanel/.test(allScripts),
        amplitude: /amplitude/.test(allScripts),
        segment: /cdn\.segment\.com|analytics\.js/.test(allScripts),
        posthog: /posthog/.test(allScripts),
        heap: /heap\.io|heap-/.test(allScripts),
      },
      consent: {
        hasCookieBanner: !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"]'),
        cmpDetected:
          /onetrust/i.test(allScripts) ? 'OneTrust' :
          /cookiebot/i.test(allScripts) ? 'Cookiebot' :
          /termly/i.test(allScripts) ? 'Termly' :
          /didomi/i.test(allScripts) ? 'Didomi' :
          /cookieyes/i.test(allScripts) ? 'CookieYes' :
          /iubenda/i.test(allScripts) ? 'Iubenda' : null,
        googleConsentMode: /gtag\(\s*['"]consent['"]/.test(inlineScripts),
        consentModeV2: /ad_user_data|ad_personalization/.test(inlineScripts),
      },
      performance: {
        totalScripts: scripts.length,
        asyncScripts: [...document.querySelectorAll('script[async]')].length,
        deferScripts: [...document.querySelectorAll('script[defer]')].length,
        inlineScriptSize: inlineScripts.length,
        headScripts: document.head.querySelectorAll('script').length,
      },
      tagsFiring: {},
    };

    return {
      meta, headings, buttons, links, forms, ecommerce, pricing,
      media, engagement, socialProof, tech, ldJson, bodyText, analyticsAudit,
    };
  });

  // ─── CONSENT DATA (always attach — lightweight metadata) ───
  (data.analyticsAudit as any).consentDetection = {
    bannerDetected: consentResult.detected,
    autoAccepted: consentResult.accepted,
    cmp: consentResult.cmp,
    detectionMethod: consentResult.method,
    bannerElement: consentResult.bannerElement,
  };

  // ─── EVERYTHING BELOW IS EVENT-CAPTURE WORK — only run in 'existing' mode ───
  if (mode !== 'existing') {
    return data;
  }

  // ─── DRAIN TRACKING SPY (primary capture source) ───
  const spyResult = await readTrackingSpyEvents(page);
  (data.analyticsAudit as any).trackingSpy = {
    installed: spyResult.metadata !== null,
    rawHitCount: spyResult.rawHitCount,
    counters: spyResult.counters,
    events: spyResult.events,
  };
  (data.analyticsAudit as any).userSimulation = userSimulation;

  // ─── READ LIVE DATALAYER ───
  const dataLayerEvents: CapturedEvent[] = await page.evaluate(() => {
    const dl = (window as any).dataLayer;
    if (!Array.isArray(dl)) return [];
    return dl
      .filter((item: any) => item && typeof item === 'object' && item.event)
      .map((item: any) => {
        const { event: evtName, ...params } = item;
        const cleanParams: Record<string, string> = {};
        Object.keys(params).forEach(k => {
          if (typeof params[k] === 'string' || typeof params[k] === 'number') cleanParams[k] = String(params[k]);
        });
        return { eventName: evtName, source: 'dataLayer (GTM)', parameters: cleanParams, isStandard: false, method: 'dataLayer.push' };
      });
  }).catch(() => [] as CapturedEvent[]);

  // ─── EXTRACT EVENTS FROM HTML CLASS PATTERNS ───
  const htmlPatternEvents: CapturedEvent[] = await page.evaluate(() => {
    const found = new Set<string>();
    document.querySelectorAll('[class]').forEach(el => {
      el.className.toString().split(/\s+/).forEach(cls => {
        if (cls.match(/^(event|ga_event|gtm_event|trackEvent|track_event)[-_][a-z0-9_-]+/i)) {
          found.add(cls);
        }
      });
    });
    // Also data-* attributes
    document.querySelectorAll('[data-event], [data-ga-event], [data-track], [data-gtm-event]').forEach(el => {
      const v = el.getAttribute('data-event') || el.getAttribute('data-ga-event') || el.getAttribute('data-track') || el.getAttribute('data-gtm-event');
      if (v) found.add(v);
    });
    return Array.from(found).map(name => ({
      eventName: name, source: 'HTML class pattern', parameters: {} as Record<string, string>,
      isStandard: false, method: 'CSS class marker on clickable element',
    }));
  }).catch(() => [] as CapturedEvent[]);

  // ─── User-interaction simulation is handled BEFORE the page.evaluate
  // structure capture by simulateRealUser() (universal 8-phase simulator).
  // We just wait briefly here to let any final batched analytics calls land.
  await page.waitForTimeout(2500);

  // ─── FINAL VERIFICATION: Complete dataLayer extraction ───
  const verifiedDL: CapturedEvent[] = await page.evaluate(() => {
    const dl = (window as any).dataLayer;
    if (!Array.isArray(dl)) return [];
    const events: any[] = [];
    dl.forEach((item: any, idx: number) => {
      if (!item) return;
      // Object push: { event: 'name', ...params }
      if (typeof item === 'object' && !Array.isArray(item) && item.event) {
        const { event: evtName, ...params } = item;
        const clean: Record<string, string> = {};
        Object.keys(params).forEach(k => { if (typeof params[k] === 'string' || typeof params[k] === 'number') clean[k] = String(params[k]); });
        events.push({ eventName: evtName, source: 'dataLayer (verified)', parameters: clean, isStandard: false, method: `dataLayer[${idx}]` });
      }
      // Array push: ['event', 'name', params]
      else if (Array.isArray(item) && item[0] === 'event' && item[1]) {
        events.push({ eventName: item[1], source: 'dataLayer (verified)', parameters: item[2] || {}, isStandard: false, method: `gtag args[${idx}]` });
      }
    });
    return events;
  }).catch(() => [] as CapturedEvent[]);

  console.log(`Final dataLayer verification: ${verifiedDL.length} events found`);

  // ─── MERGE ALL SOURCES with confidence scoring ───
  const allCaptured = [
    ...capturedEvents,
    ...dataLayerEvents,
    ...htmlPatternEvents,
    ...verifiedDL,
  ].filter(e => e.eventName && !GTM_INTERNAL_EVENTS.has(e.eventName));

  const eventMap = new Map<string, CapturedEvent & { allSources?: string[]; sourceCount?: number; confidence?: string }>();
  allCaptured.forEach(e => {
    const key = e.eventName.toLowerCase().trim();
    const existing = eventMap.get(key);
    if (!existing) {
      eventMap.set(key, { ...e, allSources: [e.source], sourceCount: 1, confidence: 'low' });
    } else {
      const sources = new Set([...(existing.allSources || []), e.source]);
      const count = sources.size;
      eventMap.set(key, {
        ...existing,
        allSources: Array.from(sources),
        source: Array.from(sources).join(' + '),
        sourceCount: count,
        confidence: count >= 3 ? 'high' : count === 2 ? 'medium' : 'low',
      });
    }
  });
  const uniqueCapturedEvents = Array.from(eventMap.values());

  // Categorize: configured vs firing
  const eventsConfigured = uniqueCapturedEvents.filter(e =>
    (e.allSources || [e.source]).some((s: string) =>
      s.includes('HTML class') || s.includes('GTM Container') || s.includes('GTM Tag') ||
      s.includes('GTM Custom Event') || s.includes('GTM Config') || s.includes('GTM Trigger') ||
      s.includes('GTM (GA4') || s.includes('GTM (UA') || s.includes('GTM Tag Parameter')
    )
  );
  const eventsFiring = uniqueCapturedEvents.filter(e =>
    (e.allSources || [e.source]).some((s: string) => s.includes('GA4') || s.includes('dataLayer') || s.includes('Meta Pixel') || s.includes('Universal Analytics') || s.includes('Network') || s.includes('verified'))
  );

  // ─── CONSOLE VERIFICATION: accuracy check ───
  const verifiedEventNames = [...new Set(verifiedDL.map(e => e.eventName.toLowerCase().trim()))].filter(n => !GTM_INTERNAL_EVENTS.has(n));
  const scraperEventNames = new Set(uniqueCapturedEvents.map(e => e.eventName.toLowerCase().trim()));
  const missedByScraper = verifiedEventNames.filter(n => !scraperEventNames.has(n));

  // Auto-add any events the scraper missed
  missedByScraper.forEach(name => {
    const original = verifiedDL.find(e => e.eventName.toLowerCase().trim() === name);
    if (original) {
      uniqueCapturedEvents.push({ ...original, source: 'dataLayer (console verification)', confidence: 'high', sourceCount: 1, allSources: ['Console verification'] } as any);
      eventsFiring.push({ ...original, source: 'dataLayer (console verification)' } as any);
    }
  });

  const consoleCount = verifiedEventNames.length;
  const scraperCount = uniqueCapturedEvents.length;
  const accuracyRatio = consoleCount > 0 ? Math.min(100, Math.round((scraperCount / consoleCount) * 100)) : 100;

  console.log(`Event detection: ${scraperCount} unique (${eventsConfigured.length} configured, ${eventsFiring.length} firing)`);
  console.log(`Verification: ${consoleCount} in dataLayer, accuracy ${accuracyRatio}%, missed ${missedByScraper.length}`);

  const verification = {
    consoleEventCount: consoleCount,
    scraperEventCount: scraperCount,
    accuracyRatio,
    eventsMissedByScraper: missedByScraper,
    verifiedAt: new Date().toISOString(),
  };

  // ─── MERGE into analyticsAudit ───
  const existingCustomEvents = data.analyticsAudit.ga4.customEventsFound || [];
  const allEventNames = [...new Set([...existingCustomEvents, ...uniqueCapturedEvents.map(e => e.eventName)])];

  data.analyticsAudit.ga4.customEventsFound = allEventNames.filter(n => !GA4_STANDARD_EVENTS.has(n));
  data.analyticsAudit.ga4.allEventsDetected = allEventNames;
  (data.analyticsAudit as any).eventsCurrentlyFiring = uniqueCapturedEvents;
  (data.analyticsAudit as any).eventsConfigured = eventsConfigured;
  (data.analyticsAudit as any).eventsFiring = eventsFiring;
  (data.analyticsAudit as any).detectionSources = {
    networkInterception: capturedEvents.length,
    dataLayerInspection: dataLayerEvents.length,
    dataLayerVerification: verifiedDL.length,
    htmlPatterns: htmlPatternEvents.length,
    staticHtmlParsing: existingCustomEvents.length,
  };
  (data.analyticsAudit as any).verification = verification;

  // Google Consent Mode detection from dataLayer (requires live page — existing mode only)
  const consentModeStatus = await page.evaluate(() => {
    const dl = (window as any).dataLayer;
    if (!Array.isArray(dl)) return { active: false, version: null, hasDefault: false, hasUpdate: false };
    let defaultFound = false, updateFound = false;
    dl.forEach((item: any) => {
      if (Array.isArray(item) && item[0] === 'consent') {
        if (item[1] === 'default') defaultFound = true;
        if (item[1] === 'update') updateFound = true;
      }
    });
    return { active: defaultFound || updateFound, version: defaultFound ? 'v2' : null, hasDefault: defaultFound, hasUpdate: updateFound };
  }).catch(() => ({ active: false, version: null, hasDefault: false, hasUpdate: false }));

  (data.analyticsAudit as any).consentDetection.googleConsentMode = consentModeStatus;

  // Network-based tag firing stats
  data.analyticsAudit.tagsFiring = {
    ga4Hits: networkRequests.filter(u => /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(u)).length,
    gtmLoaded: networkRequests.some(u => /googletagmanager\.com\/gtm\.js/.test(u)),
    metaPixelHits: networkRequests.filter(u => /facebook\.com\/tr/.test(u)).length,
    linkedinHits: networkRequests.filter(u => /px\.ads\.linkedin\.com/.test(u)).length,
    googleAdsHits: networkRequests.filter(u => /googleadservices\.com|google\.com\/pagead/.test(u)).length,
    totalAnalyticsRequests: networkRequests.filter(u =>
      /analytics|gtm|pixel|tracking|telemetry|collect|hotjar|clarity|segment/.test(u)
    ).length,
  };

  return data;
}

export async function deepScrapeWebsite(url: string, mode: ScrapeMode = 'new', siteType: SiteType = 'ecommerce'): Promise<ScrapeResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    // Fresh state — no cookies/storage from previous visits
    storageState: undefined,
  });
  // Ensure clean first-visit experience (forces consent banners to show)
  await context.clearCookies();

  try {
    // 1. Scrape homepage — 45s aggressive simulation budget
    const homePage = await context.newPage();
    const homepage = await scrapePage(homePage, url, mode, undefined, { simulationMs: 45000, pageLabel: 'homepage' });
    await homePage.close();

    // 2. Build the list of sub-pages to scan.
    //
    // EXISTING mode: deep scan PRODUCT + CATEGORY + CART (where present) so we
    // catch view_item / view_item_list / add_to_cart / view_cart events that
    // never fire on the homepage. Without this, those events get falsely
    // reported as "missing".
    //
    // NEW mode: keyword-based structural discovery (pricing/about/contact/etc)
    // since the goal there is site structure understanding, not event capture.
    const labeledCandidates: Array<{ type: PageType; url: string }> = [];

    if (mode === 'existing') {
      const deep = discoverDeepPages(homepage, url);
      console.log('🌐 Discovered deep pages:', { product: deep.product, category: deep.category, cart: deep.cart });
      if (deep.product)  labeledCandidates.push({ type: 'product',  url: deep.product  });
      if (deep.category) labeledCandidates.push({ type: 'category', url: deep.category });
      if (deep.cart)     labeledCandidates.push({ type: 'cart',     url: deep.cart     });
    }

    // Keyword-based discovery still contributes structural pages (pricing /
    // about / login / signup / etc.) — useful for both modes.
    const candidateKeywords = ['pricing', 'product', 'feature', 'about', 'contact', 'blog', 'demo', 'signup', 'sign-up', 'login', 'shop'];
    const seen = new Set(labeledCandidates.map(c => c.url));
    const maxTotal = mode === 'existing' ? 6 : 5;
    for (const link of homepage.links.nav) {
      if (!link.href) continue;
      if (labeledCandidates.length >= maxTotal) break;
      let full: string;
      try { full = link.href.startsWith('http') ? link.href : new URL(link.href, url).toString(); } catch { continue; }
      if (seen.has(full)) continue;
      if (!candidateKeywords.some(k => full.toLowerCase().includes(k))) continue;
      seen.add(full);
      labeledCandidates.push({ type: classifyUrl(full), url: full });
    }

    // 3. Scrape each labeled sub-page.
    const subPages: Record<string, ScrapedPage> = {};
    const scanResults: Array<{ type: PageType; url: string; scraped: ScrapedPage | null; success: boolean; error?: string }> = [];

    for (const { type, url: subUrl } of labeledCandidates) {
      try {
        console.log(`🔍 Scanning ${type} page: ${subUrl}`);
        const subPage = await context.newPage();
        const scraped = await scrapePage(subPage, subUrl, mode, undefined, { skipConsent: true, simulationMs: 25000, pageLabel: type });
        await subPage.close();
        subPages[type] = scraped;
        scanResults.push({ type, url: subUrl, scraped, success: true });
      } catch (err) {
        const msg = (err as Error)?.message || 'unknown error';
        console.warn(`⚠ Sub-page scan failed (${type}, ${subUrl}): ${msg}`);
        scanResults.push({ type, url: subUrl, scraped: null, success: false, error: msg });
      }
    }

    // ─── NEW WEBSITE MODE: skip GTM container fetch + networkCapture; return early ───
    if (mode !== 'existing') {
      console.log('\n📋 NEW WEBSITE MODE — skipped event capture, captured site structure only\n');
      return { url, homepage, subPages, pagesScraped: 1 + Object.keys(subPages).length, siteType };
    }

    // ─── FETCH GTM CONTAINER CONFIGS (comprehensive extraction) ───
    const gtmContainerIds = homepage.analyticsAudit?.gtm?.containerIds || [];
    const gtmExtracted: CapturedEvent[] = [];

    for (const gtmId of gtmContainerIds) {
      try {
        const containerPage = await context.newPage();
        const resp = await containerPage.goto(`https://www.googletagmanager.com/gtm.js?id=${gtmId}`, { timeout: 10000 });
        if (resp) {
          const text = await resp.text();

          // PATTERN 1: dataLayer event pushes — "event": "name"
          [...text.matchAll(/"event"\s*:\s*"([^"]+)"/g)].forEach(m => {
            if (m[1] && !GTM_INTERNAL_EVENTS.has(m[1])) gtmExtracted.push({
              eventName: m[1], source: 'GTM Container Config', parameters: {}, isStandard: false, method: `dataLayer event (${gtmId})`,
            });
          });

          // PATTERN 2: GA4 eventName parameter — "eventName": "name"
          [...text.matchAll(/"eventName"\s*:\s*"([^"]+)"/g)].forEach(m => {
            if (m[1] && m[1].length < 50 && !GTM_INTERNAL_EVENTS.has(m[1])) gtmExtracted.push({
              eventName: m[1], source: 'GTM (GA4 Event Tag)', parameters: {}, isStandard: false, method: `GA4 tag config (${gtmId})`,
            });
          });

          // PATTERN 3: Custom event trigger filters — customEventFilter..."arg1":"name"
          [...text.matchAll(/customEventFilter[^}]*?"arg1"\s*:\s*"([^"]+)"/g)].forEach(m => {
            if (m[1] && !GTM_INTERNAL_EVENTS.has(m[1])) gtmExtracted.push({
              eventName: m[1], source: 'GTM Custom Event Trigger', parameters: {}, isStandard: false, method: `Trigger filter (${gtmId})`,
            });
          });

          // PATTERN 4: vtp_eventName — "vtp_eventName": "name"
          [...text.matchAll(/"vtp_eventName"\s*:\s*"([^"]+)"/g)].forEach(m => {
            if (m[1] && !GTM_INTERNAL_EVENTS.has(m[1])) gtmExtracted.push({
              eventName: m[1], source: 'GTM Tag Event Name', parameters: {}, isStandard: false, method: `vtp_eventName (${gtmId})`,
            });
          });

          // PATTERN 5: UA event actions — "eventAction": "name" or "vtp_eventAction": "name"
          [...text.matchAll(/"(?:vtp_)?eventAction"\s*:\s*"([^"]+)"/g)].forEach(m => {
            if (m[1] && m[1].length < 50) gtmExtracted.push({
              eventName: m[1], source: 'GTM (UA Event Action)', parameters: {}, isStandard: false, method: `UA event action (${gtmId})`,
            });
          });

          // PATTERN 6: Tag names with event-like keywords
          [...text.matchAll(/"name"\s*:\s*"([^"]{3,80})"/g)].forEach(m => {
            const tagName = m[1];
            if (tagName && !tagName.match(/^(JavaScript|Variable|Trigger|Tag|All Pages|gtm\.|GTM-|__|function|vtp_)/i) &&
                tagName.match(/event|click|view|track|conversion|purchase|signup|submit|add.to.cart|scroll|lead|contact|download|search|share/i)) {
              gtmExtracted.push({
                eventName: tagName, source: 'GTM Tag Name', parameters: {}, isStandard: false, method: `Tag display name (${gtmId})`,
              });
            }
          });

          // PATTERN 7: Any vtp_ parameter that looks like an event name
          [...text.matchAll(/"vtp_(?:eventCategory|eventLabel|conversionLabel)":\s*"([^"]{2,60})"/g)].forEach(m => {
            if (m[1] && !GTM_INTERNAL_EVENTS.has(m[1])) gtmExtracted.push({
              eventName: m[1], source: 'GTM Tag Parameter', parameters: {}, isStandard: false, method: `vtp param (${gtmId})`,
            });
          });

          console.log(`GTM ${gtmId}: raw JS size ${text.length}, patterns found ${gtmExtracted.length}`);
        }
        await containerPage.close();
        console.log(`GTM ${gtmId}: extracted ${gtmExtracted.length} events from container JS`);
      } catch (e) { console.log(`GTM fetch failed for ${gtmId}:`, e); }
    }

    // Merge GTM events into homepage audit
    const audit = homepage.analyticsAudit as any;
    const existingNames = new Set([
      ...(audit.ga4?.allEventsDetected || []).map((n: string) => n.toLowerCase()),
      ...(audit.eventsCurrentlyFiring || []).map((e: any) => e.eventName?.toLowerCase()),
    ]);

    // Dedupe GTM extracted
    const gtmDeduped = new Map<string, CapturedEvent>();
    gtmExtracted.forEach(e => {
      const key = e.eventName.toLowerCase().trim();
      if (!gtmDeduped.has(key) && !existingNames.has(key)) gtmDeduped.set(key, e);
    });

    const newGtmEvents = Array.from(gtmDeduped.values());
    newGtmEvents.forEach(evt => {
      audit.ga4.allEventsDetected.push(evt.eventName);
      audit.ga4.customEventsFound.push(evt.eventName);
      audit.eventsCurrentlyFiring = audit.eventsCurrentlyFiring || [];
      audit.eventsCurrentlyFiring.push(evt);
      audit.eventsConfigured = audit.eventsConfigured || [];
      audit.eventsConfigured.push(evt);
    });

    audit.detectionSources = audit.detectionSources || {};
    audit.detectionSources.gtmContainerConfig = newGtmEvents.length;

    // ─── CATEGORIZE EVENTS INTO 3 BUCKETS — merged across ALL scanned pages ───
    // The 3rd bucket ("missing — should be added") is filled by Claude in /api/generate-audit.
    //
    // Crucially: we merge Tracking Spy events from homepage AND every sub-page
    // (product/category/cart). An event seen on any page counts as "firing" —
    // this prevents view_item / view_item_list / view_cart from being flagged
    // as missing just because the homepage didn't fire them.
    const spyInstalled = !!(homepage.analyticsAudit as any)?.trackingSpy?.installed;
    const spyCountersHome = (homepage.analyticsAudit as any)?.trackingSpy?.counters || { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 };
    let spyRawHits = (homepage.analyticsAudit as any)?.trackingSpy?.rawHitCount || 0;
    const spyCounters = { ...spyCountersHome };

    const firingMap = new Map<string, CategorizedEvent & { capturedFromPages: PageType[] }>();

    function mergePageEvents(pageType: PageType, analyticsAudit: any) {
      const events: Array<NormalizedEvent & { count?: number }> = analyticsAudit?.trackingSpy?.events || [];
      const ctrs = analyticsAudit?.trackingSpy?.counters;
      const raw = analyticsAudit?.trackingSpy?.rawHitCount || 0;
      if (pageType !== 'homepage') {
        spyRawHits += raw;
        if (ctrs) {
          spyCounters.fetch += ctrs.fetch || 0;
          spyCounters.xhr += ctrs.xhr || 0;
          spyCounters.beacon += ctrs.beacon || 0;
          spyCounters.image += ctrs.image || 0;
          spyCounters.dataLayer += ctrs.dataLayer || 0;
        }
      }
      for (const e of events) {
        if (!e?.eventName) continue;
        const key = e.eventName.toLowerCase().trim();
        const existing = firingMap.get(key);
        if (existing) {
          if (!existing.capturedFromPages.includes(pageType)) existing.capturedFromPages.push(pageType);
          existing.count = (existing.count || 1) + (e.count || 1);
        } else {
          firingMap.set(key, {
            eventName: e.eventName,
            source: e.source,
            vendor: e.vendor,
            parameters: e.parameters || {},
            pixelId: e.pixelId ?? null,
            measurementId: e.measurementId ?? null,
            transport: e.transport,
            method: e.method,
            timestamp: e.timestamp,
            count: e.count || 1,
            isStandard: e.isStandard,
            confidenceSource: 'Tracking Spy (verified)',
            category: 'firing' as const,
            capturedFromPages: [pageType],
          });
        }
      }
    }

    // Homepage events first…
    mergePageEvents('homepage', homepage.analyticsAudit);
    // …then every successful sub-page scan.
    for (const r of scanResults) {
      if (r.success && r.scraped) mergePageEvents(r.type, r.scraped.analyticsAudit);
    }

    // Playwright network listener (homepage only — backup signal).
    (audit.eventsFiring || [])
      .filter((e: any) => e.eventName)
      .forEach((e: any) => {
        const key = e.eventName.toLowerCase().trim();
        const existing = firingMap.get(key);
        if (existing) {
          if (!existing.capturedFromPages.includes('homepage')) existing.capturedFromPages.push('homepage');
        } else {
          firingMap.set(key, {
            eventName: e.eventName,
            source: e.source || 'Playwright Network Interception',
            vendor: e.source?.includes('GA4') ? 'GA4' : e.source?.includes('Meta') ? 'MetaPixel' : 'Unknown',
            parameters: e.parameters || {},
            transport: 'fetch',
            method: e.method,
            timestamp: Date.now(),
            confidenceSource: 'Playwright Network (backup)',
            category: 'firing' as const,
            capturedFromPages: ['homepage'],
          });
        }
      });

    const firingEventsAll: CategorizedEvent[] = Array.from(firingMap.values());
    const allFiringNamesLower = new Set(firingEventsAll.map(e => e.eventName.toLowerCase().trim()));

    // Configured-but-not-firing — events from GTM container/HTML markers
    // that did NOT appear in the firing set.
    const configuredEvents: CategorizedEvent[] = (audit.eventsConfigured || [])
      .filter((e: any) => e.eventName && !allFiringNamesLower.has(e.eventName.toLowerCase().trim()))
      .map((e: any) => ({
        eventName: e.eventName,
        source: e.source || 'GTM Container Config',
        vendor: 'GTM',
        gtmContainer: (e.method && /\(([^)]+)\)/.exec(e.method)?.[1]) || null,
        tagType: e.source || 'GTM Tag',
        trigger: e.notes || 'Requires user interaction to fire',
        category: 'configured-not-firing' as const,
        notes: e.method || '',
      }));

    // Build the pagesScanned roster — one entry per page we visited.
    const pagesScanned: PageScanResult[] = [
      {
        type: 'homepage',
        url,
        eventsFound: (homepage.analyticsAudit as any)?.trackingSpy?.events?.length || 0,
        success: true,
      },
      ...scanResults.map(r => ({
        type: r.type,
        url: r.url,
        eventsFound: r.success && r.scraped ? ((r.scraped.analyticsAudit as any)?.trackingSpy?.events?.length || 0) : 0,
        success: r.success,
        ...(r.error ? { error: r.error } : {}),
      })),
    ];

    // Aggregate user-simulation stats across homepage + every successful sub-page.
    const simSources: Array<SimResult | null | undefined> = [
      (homepage.analyticsAudit as any)?.userSimulation,
      ...scanResults.filter(r => r.success && r.scraped).map(r => (r.scraped!.analyticsAudit as any)?.userSimulation),
    ];
    const presentSims = simSources.filter((s): s is SimResult => !!s);
    const sumField = (key: keyof SimResult) => presentSims.reduce((acc, s) => acc + ((s[key] as number) || 0), 0);
    const totalInteractions = sumField('eventMarkersTriggered') + sumField('ctasClicked') + sumField('productsClicked') + sumField('elementsClicked') + sumField('linksClicked');
    const userSimulationSummary: UserSimulationSummary = {
      pagesSimulated: presentSims.length,
      totalInteractions,
      totalDurationMs: presentSims.reduce((acc, s) => acc + (s.durationMs || 0), 0),
      totals: {
        eventMarkersTriggered: sumField('eventMarkersTriggered'),
        ctasClicked: sumField('ctasClicked'),
        productsClicked: sumField('productsClicked'),
        elementsClicked: sumField('elementsClicked'),
        linksClicked: sumField('linksClicked'),
        scrolls: sumField('scrolls'),
        hovers: sumField('hovers'),
        formInteractions: sumField('formInteractions'),
        searchesPerformed: sumField('searchesPerformed'),
        mediaTriggered: sumField('mediaTriggered'),
      },
    };

    const eventAudit: EventAudit = {
      detectionMethod: spyInstalled ? 'Tracking Spy + Playwright' : (firingEventsAll.length > 0 ? 'Playwright only' : 'static-only'),
      trackingSpy: {
        installed: spyInstalled,
        rawHitCount: spyRawHits,
        counters: spyCounters,
      },
      firingEvents: firingEventsAll,
      configuredEvents,
      pagesScanned,
      userSimulation: userSimulationSummary,
    };

    console.log('\n📊 EVENT CATEGORIZATION (multi-page)');
    console.log('═══════════════════════════════════');
    console.log(`Detection method: ${eventAudit.detectionMethod}`);
    console.log(`Pages scanned: ${pagesScanned.map(p => `${p.type}(${p.eventsFound})`).join(', ')}`);
    console.log(`Firing now (unique across all pages): ${firingEventsAll.length}`);
    console.log(`Configured but not firing: ${configuredEvents.length}`);
    console.log(`Tracking Spy raw hits (all pages): ${spyRawHits} (fetch=${spyCounters.fetch}, xhr=${spyCounters.xhr}, beacon=${spyCounters.beacon}, image=${spyCounters.image}, dataLayer=${spyCounters.dataLayer})`);
    console.log('═══════════════════════════════════\n');

    // ─── NETWORK CAPTURE SUMMARY (existing mode only) ───
    // Build from the homepage analyticsAudit.tagsFiring and the merged event list.
    const tagsFiring = (homepage.analyticsAudit?.tagsFiring || {}) as any;
    const firingEvents = (audit.eventsCurrentlyFiring || []) as CapturedEvent[];
    const ga4Hits = firingEvents.filter(e => e.source?.includes('GA4')).length || tagsFiring.ga4Hits || 0;
    const uaHits = firingEvents.filter(e => e.source?.includes('Universal Analytics')).length;
    const metaPixelHits = firingEvents.filter(e => e.source?.includes('Meta Pixel')).length || tagsFiring.metaPixelHits || 0;

    const toolsDetected = new Set<string>();
    if (ga4Hits > 0) toolsDetected.add('GA4');
    if (uaHits > 0) toolsDetected.add('Universal Analytics');
    if (metaPixelHits > 0) toolsDetected.add('Meta Pixel');
    if (tagsFiring.gtmLoaded) toolsDetected.add('Google Tag Manager');
    if (tagsFiring.linkedinHits > 0) toolsDetected.add('LinkedIn');
    if (tagsFiring.googleAdsHits > 0) toolsDetected.add('Google Ads');

    const totalAnalyticsRequests = tagsFiring.totalAnalyticsRequests || 0;

    const networkCapture: NetworkCaptureSummary = {
      totalAnalyticsRequests,
      ga4Hits,
      uaHits,
      metaPixelHits,
      toolsDetected: Array.from(toolsDetected),
    };

    console.log('\n🌐 NETWORK CAPTURE SUMMARY (existing mode)');
    console.log('═══════════════════════════════════');
    console.log(`Total analytics requests: ${totalAnalyticsRequests}`);
    console.log(`  GA4 hits: ${ga4Hits}`);
    console.log(`  Meta Pixel hits: ${metaPixelHits}`);
    console.log(`  Tools: ${networkCapture.toolsDetected.join(', ') || 'none'}`);
    console.log('═══════════════════════════════════\n');

    return {
      url,
      homepage,
      subPages,
      pagesScraped: 1 + Object.keys(subPages).length,
      networkCapture,
      eventAudit,
      siteType,
    };
  } finally {
    await browser.close();
  }
}
